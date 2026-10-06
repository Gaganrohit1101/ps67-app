"""PS67 wallet authentication and encrypted IPFS gateway; prototype custodial key."""
import base64, hashlib, ipaddress, json, os, re, secrets, sqlite3, time
from contextlib import contextmanager
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from web3 import Web3
from werkzeug.exceptions import HTTPException

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / 'backend/.env')
MODE = os.getenv('MODE', 'testnet')
CHAIN_ID = int(os.getenv('CHAIN_ID', '11155111'))
if CHAIN_ID not in {31337,11155111,84532,80002,421614,11155420}:
    raise SystemExit('Only supported testnets or the local chain are allowed.')
if MODE == 'local' and CHAIN_ID != 31337:
    raise SystemExit('Demo wallets are only allowed on chain 31337.')
RPC_URL = os.getenv('RPC_URL', 'http://127.0.0.1:8545')
CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS', '')
IPFS_API = os.getenv('IPFS_API', 'http://127.0.0.1:5001/api/v0').rstrip('/')
EXPLORER_URL = os.getenv('EXPLORER_URL', '').rstrip('/')
DATA_DIR = Path(os.getenv('DATA_DIR', ROOT / '.data'))
DATA_DIR.mkdir(parents=True, exist_ok=True)
KEY_FILE = DATA_DIR / 'privacy.key'
if not KEY_FILE.exists():
    try:
        with KEY_FILE.open('xb') as f: f.write(AESGCM.generate_key(bit_length=256))
    except FileExistsError: pass
CIPHER = AESGCM(KEY_FILE.read_bytes())
DB_PATH = DATA_DIR / 'auth.db'
@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
with db() as conn:
    conn.executescript('''CREATE TABLE IF NOT EXISTS challenges (nonce TEXT PRIMARY KEY, address TEXT, message TEXT, expires REAL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, address TEXT, expires REAL);''')
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100000
CORS(app, origins=os.getenv('FRONTEND_ORIGINS', 'http://127.0.0.1:8000,http://127.0.0.1:8001').split(','), allow_headers=['Content-Type','Authorization'])
LAN_SUBNET = ipaddress.ip_network(os.environ['LAN_SUBNET'],strict=False) if os.getenv('LAN_SUBNET') else None
ALLOWED_HOSTS = set(os.getenv('ALLOWED_HOSTS','127.0.0.1,localhost').split(','))
def local_client():
    try:
        ip=ipaddress.ip_address(request.remote_addr or '')
        return ip.is_loopback or bool(LAN_SUBNET and ip in LAN_SUBNET)
    except ValueError: return False
@app.before_request
def local_network_only():
    if not local_client() or request.host.split(':')[0] not in ALLOWED_HOSTS:
        return jsonify(error='Access is limited to the configured local network.'),403
w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout':15}))
ABI = json.loads((ROOT/'backend/abi.json').read_text(encoding='utf-8-sig'))
contract = w3.eth.contract(address=Web3.to_checksum_address(CONTRACT_ADDRESS), abi=ABI) if CONTRACT_ADDRESS else None
FIELD_NAMES = {'displayName','bio','college','location','email','website'}
VISIBILITY = {'public','followers','private'}
def address(value):
    if not isinstance(value,str) or not Web3.is_address(value): raise ValueError('Enter a valid wallet address.')
    return Web3.to_checksum_address(value)
def did(owner): return f'did:pkh:eip155:{CHAIN_ID}:{owner.lower()}'
def check_chain():
    if not contract: raise RuntimeError('Deploy SocialIdentity and configure its address first.')
    if w3.eth.chain_id != CHAIN_ID: raise RuntimeError('RPC network differs from configured chain.')
    if not w3.eth.get_code(contract.address): raise RuntimeError('No contract exists at that address.')
def viewer(required=False):
    auth=request.headers.get('Authorization','')
    if not auth:
        if required: raise PermissionError('Connect and sign in first.')
        return ''
    if not auth.startswith('Bearer '): raise PermissionError('Invalid session.')
    with db() as conn:
        row=conn.execute('SELECT address FROM sessions WHERE token_hash=? AND expires>?',(hashlib.sha256(auth[7:].encode()).hexdigest(),time.time())).fetchone()
    if not row: raise PermissionError('Session expired. Sign in again.')
    return row['address']
def ipfs_add(document):
    payload=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode()
    r=requests.post(IPFS_API+'/add',params={'pin':'true','cid-version':'1'},files={'file':('profile.json',payload,'application/json')},timeout=30)
    r.raise_for_status()
    return r.json()['Hash']
def ipfs_read(cid):
    # Kubo's CIDv1 adds use raw-leaf roots (bafk...) for small JSON documents,
    # and DAG-PB roots (bafy...) for larger ones.
    if not re.fullmatch(r'(baf[a-z2-7]{20,100}|Qm[a-zA-Z0-9]{44})',cid): raise ValueError('Unsupported IPFS CID in profile pointer.')
    with requests.post(IPFS_API+'/cat',params={'arg':cid},timeout=25,stream=True) as r:
        r.raise_for_status()
        chunks=[]; size=0
        for chunk in r.iter_content(4096):
            size+=len(chunk)
            if size>100000: raise ValueError('Profile is too large.')
            chunks.append(chunk)
        return json.loads(b''.join(chunks))
def aad(owner,label,visibility): return f'ps67:1:{CHAIN_ID}:{owner.lower()}:{label}:{visibility}'.encode()
def seal(owner,label,item):
    if not isinstance(item,dict) or item.get('visibility') not in VISIBILITY: raise ValueError('Choose valid field visibility.')
    value=item.get('value',''); visibility=item['visibility']
    if not isinstance(value,str) or len(value)>2000: raise ValueError('Values must be text up to 2000 characters.')
    if visibility=='public': return {'visibility':visibility,'value':value}
    nonce=os.urandom(12)
    return {'visibility':visibility,'encryption':'AES-256-GCM','nonce':base64.b64encode(nonce).decode(),
        'ciphertext':base64.b64encode(CIPHER.encrypt(nonce,value.encode(),aad(owner,label,visibility))).decode()}
def reveal(owner,label,item,is_owner,is_follower):
    visibility=item.get('visibility')
    if visibility not in VISIBILITY: raise ValueError('Invalid visibility in profile.')
    allowed=visibility=='public' or is_owner or (visibility=='followers' and is_follower)
    if not allowed: return {'visibility':visibility,'locked':True}
    value=item.get('value','') if visibility=='public' else CIPHER.decrypt(base64.b64decode(item['nonce']),base64.b64decode(item['ciphertext']),aad(owner,label,visibility)).decode()
    return {'visibility':visibility,'locked':False,'value':value}
def read_profile(owner,who):
    check_chain(); cid=contract.functions.profiles(owner).call()
    if not cid: return None
    doc=ipfs_read(cid)
    if doc.get('schemaVersion')!=1 or doc.get('did')!=did(owner) or doc.get('owner','').lower()!=owner.lower() or doc.get('chainId')!=CHAIN_ID:
        raise ValueError('Stored profile does not match this on-chain identity.')
    is_owner=bool(who and who.lower()==owner.lower())
    is_follower=bool(who and contract.functions.isFollowing(address(who),owner).call())
    fields={name:reveal(owner,name,item,is_owner,is_follower) for name,item in doc.get('fields',{}).items() if name in FIELD_NAMES}
    posts=[{'id':p['id'],'createdAt':p['createdAt'],**reveal(owner,'post:'+p['id'],p,is_owner,is_follower)} for p in doc.get('posts',[])]
    return {'schemaVersion':1,'owner':owner,'did':did(owner),'chainId':CHAIN_ID,'cid':cid,'fields':fields,'posts':posts,
        'isOwner':is_owner,'isFollower':is_follower,'followers':contract.functions.getFollowers(owner).call(),'following':contract.functions.getFollowing(owner).call()}
@app.after_request
def headers(response):
    response.headers['Cache-Control']='no-store'; response.headers['X-Content-Type-Options']='nosniff'
    return response
@app.get('/config')
def config():
    return {'mode':MODE,'chainId':CHAIN_ID,'networkName':'Local development' if CHAIN_ID==31337 else 'Public testnet',
        'contractAddress':CONTRACT_ADDRESS,'abi':ABI,'rpcUrl':request.host_url.rstrip('/')+'/rpc' if MODE=='local' else None,'explorer':EXPLORER_URL}
@app.get('/health')
def health():
    result={'ok':False,'chain':False,'ipfs':False,'chainId':CHAIN_ID,'mode':MODE}
    try: check_chain(); result['chain']=True
    except Exception: result['chainError']='Chain unavailable or contract configuration incomplete.'
    try:
        r=requests.post(IPFS_API+'/id',timeout=3);r.raise_for_status();result['ipfs']=True
    except Exception: result['ipfsError']='Start IPFS or check IPFS_API.'
    result['ok']=result['chain'] and result['ipfs']
    return result,200 if result['ok'] else 503
@app.get('/dev-wallets')
def dev_wallets():
    if MODE!='local' or CHAIN_ID!=31337 or not local_client(): return jsonify(error='Demo wallets disabled.'),404
    check_chain()
    return {'wallets':json.loads((ROOT/'.data/dev-wallets.json').read_text())}
@app.post('/rpc')
def local_rpc():
    # Only fake chain 31337. Keep the raw RPC port/admin methods off the LAN.
    if MODE!='local' or CHAIN_ID!=31337 or not local_client(): return jsonify(error='Local RPC disabled.'),404
    if w3.eth.chain_id!=31337: return jsonify(error='Local RPC network mismatch.'),503
    payload=request.get_json(silent=True)
    calls=payload if isinstance(payload,list) else [payload]
    allowed={'eth_chainId','net_version','eth_blockNumber','eth_getBalance','eth_getTransactionCount',
        'eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_estimateGas','eth_call',
        'eth_getCode','eth_sendRawTransaction','eth_getBlockByNumber','eth_getBlockByHash',
        'eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs'}
    if not calls or len(calls)>50 or any(not isinstance(c,dict) or c.get('method') not in allowed for c in calls):
        return jsonify(error='Unsupported local RPC method.'),400
    result=requests.post(RPC_URL,json=payload,timeout=15)
    result.raise_for_status()
    return jsonify(result.json())
@app.post('/auth/challenge')
def challenge():
    check_chain(); owner=address((request.get_json(silent=True) or {}).get('address'));nonce=secrets.token_hex(24);expires=time.time()+300
    message=(f'PS67 - Sign in to the privacy gateway\nGateway: {os.getenv("AUTH_ORIGIN","http://127.0.0.1:5000")}\nWallet: {owner}\nChain: {CHAIN_ID}\nContract: {contract.address}\nNonce: {nonce}\nExpires: {int(expires)}\nThis signature only authenticates a session; it sends no transaction.')
    with db() as conn:
        conn.execute('DELETE FROM challenges WHERE expires<?',(time.time(),));conn.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
        conn.execute('INSERT INTO challenges VALUES (?,?,?,?)',(nonce,owner,message,expires))
    return {'nonce':nonce,'message':message}
@app.post('/auth/session')
def session():
    data=request.get_json(silent=True) or {}
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT * FROM challenges WHERE nonce=? AND expires>?',(data.get('nonce',''),time.time())).fetchone()
        if not row: raise PermissionError('Challenge expired or already used.')
        try: recovered=Account.recover_message(encode_defunct(text=row['message']),signature=data.get('signature',''))
        except Exception as exc: raise PermissionError('Invalid signature.') from exc
        if recovered.lower()!=row['address'].lower(): raise PermissionError('Signature does not match the wallet.')
        conn.execute('DELETE FROM challenges WHERE nonce=?',(row['nonce'],));token=secrets.token_urlsafe(32)
        conn.execute('INSERT INTO sessions VALUES (?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),row['address'],time.time()+3600))
    return {'token':token,'address':row['address'],'expiresIn':3600}
@app.post('/auth/logout')
def logout():
    auth=request.headers.get('Authorization','')
    if auth.startswith('Bearer '):
        with db() as conn: conn.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(auth[7:].encode()).hexdigest(),))
    return {'ok':True}
@app.post('/profiles')
def publish():
    owner=viewer(True);check_chain();data=request.get_json(silent=True) or {};fields=data.get('fields',{});posts=data.get('posts',[])
    if not isinstance(fields,dict) or not fields or set(fields)-FIELD_NAMES: raise ValueError('Use the supported profile fields.')
    if not isinstance(posts,list) or len(posts)>40: raise ValueError('Up to 40 posts are supported in this prototype.')
    encoded=[]
    for p in posts:
        if not isinstance(p,dict): raise ValueError('Invalid post.')
        pid=p.get('id') or secrets.token_hex(12)
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,64}',str(pid)): raise ValueError('Invalid post ID.')
        encoded.append({'id':pid,'createdAt':str(p.get('createdAt',time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())))[:40],**seal(owner,'post:'+pid,p)})
    doc={'schemaVersion':1,'owner':owner,'did':did(owner),'chainId':CHAIN_ID,'fields':{n:seal(owner,n,p) for n,p in fields.items()},'posts':encoded}
    return {'cid':ipfs_add(doc),'did':did(owner)},201
@app.get('/profiles/<owner>')
def profile(owner):
    result=read_profile(address(owner),viewer())
    if result is None: return jsonify(error='This wallet has not created a profile yet.'),404
    return result
@app.get('/profiles')
def list_profiles():
    check_chain()
    logs=contract.events.ProfileUpdated().get_logs(from_block=int(os.getenv('DEPLOYMENT_BLOCK','0')),to_block='latest')
    owners=list(dict.fromkeys(log['args']['owner'] for log in reversed(logs)))[:50]
    return {'profiles':[{'owner':owner,'did':did(owner)} for owner in owners]}
@app.get('/identities/<owner>/export')
def export_identity(owner):
    owner=address(owner);check_chain()
    if not contract.functions.profiles(owner).call():
        return jsonify(error='Create a profile before exporting its identity.'),404
    response=jsonify(schemaVersion=1,did=did(owner),chainId=CHAIN_ID,contractAddress=contract.address)
    response.headers['Content-Disposition']='attachment; filename="ps67-identity.json"'
    return response
@app.errorhandler(Exception)
def errors(error):
    if isinstance(error,HTTPException): return jsonify(error=error.description),error.code
    if isinstance(error,PermissionError): return jsonify(error=str(error)),401
    if isinstance(error,ValueError): return jsonify(error=str(error)),400
    if isinstance(error,requests.RequestException): return jsonify(error='IPFS unavailable. Start the node and try again.'),503
    app.logger.error('Request failed: %s',type(error).__name__)
    return jsonify(error='Cannot complete request. Check chain, storage and gateway configuration.'),503
if __name__=='__main__': app.run(host=os.getenv('BIND_HOST','127.0.0.1'),port=int(os.getenv('PORT','5000')),debug=False)
