"""Real signed sessions and real encryption, with a deterministic mocked follower graph."""
import base64, hashlib, importlib.util, io, json, logging, os, secrets, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from eth_account import Account
from eth_account.messages import encode_defunct
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

tmp=tempfile.TemporaryDirectory()
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'backend'))
os.environ.update(MODE='local',CHAIN_ID='31337',DATA_DIR=tmp.name,CONTRACT_ADDRESS='',ENABLE_ENCRYPTED_DM='true')
import identity
from dm import binding, canonical, signed_envelope
def b64(v):return base64.b64encode(v).decode()
def sign(account,text):return '0x'+Account.sign_message(encode_defunct(text=text),account.key).signature.hex().removeprefix('0x')

class DMTests(unittest.TestCase):
    def setUp(self):
        self.accounts=[Account.create() for _ in range(3)]
        self.wallets=[a.address.lower() for a in self.accounts]
        self.graph={(self.wallets[0],self.wallets[1]),(self.wallets[1],self.wallets[0])}
        def following(a,b):return SimpleNamespace(call=lambda **kw:(a.lower(),b.lower()) in self.graph)
        contract=SimpleNamespace(address='0x2222222222222222222222222222222222222222',functions=SimpleNamespace(isFollowing=following))
        for obj,name,value in [(identity,'check_chain',lambda:None),(identity,'contract',contract),(identity,'w3',SimpleNamespace(eth=SimpleNamespace(block_number=42,chain_id=31337,get_code=lambda address:b"contract")))]:
            p=patch.object(obj,name,value);p.start();self.addCleanup(p.stop)
        self.client=identity.app.test_client();self.headers=[];self.keys=[];self.records=[]
        for account,wallet in zip(self.accounts,self.wallets):
            c=self.client.post('/auth/challenge',json={'address':wallet}).json
            session=self.client.post('/auth/session',json={'nonce':c['nonce'],'signature':sign(account,c['message'])})
            self.assertEqual(session.status_code,200)
            headers={'Authorization':'Bearer '+session.json['token']};self.headers.append(headers)
            key=ec.generate_private_key(ec.SECP256R1());self.keys.append(key)
            raw=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
            response=self.client.post('/dm/keys',json={'publicKey':b64(raw),'signature':sign(account,binding(identity.DM_CONTEXT,wallet,b64(raw)))},headers=headers)
            self.assertEqual(response.status_code,201);self.records.append(response.json)
    def envelope(self):
        a,b=self.wallets[:2];ctx=identity.DM_CONTEXT
        e=dict(id=secrets.token_hex(16),sender=a,recipient=b,senderKey=self.records[0]['keyId'],recipientKey=self.records[1]['keyId'],salt=b64(os.urandom(32)),iv=b64(os.urandom(12)))
        aad=canonical(['PS67 DM ciphertext v1',ctx,e['id'],a,b,e['senderKey'],e['recipientKey']]).encode()
        shared=self.keys[0].exchange(ec.ECDH(),self.keys[1].public_key())
        key=HKDF(algorithm=hashes.SHA256(),length=32,salt=base64.b64decode(e['salt']),info=aad).derive(shared)
        e['ciphertext']=b64(AESGCM(key).encrypt(base64.b64decode(e['iv']),b'DM secret test marker 732947',aad))
        e['signature']=sign(self.accounts[0],signed_envelope(ctx,e));return e
    def post(self,e,i=0):return self.client.post('/dm/messages',json=e,headers=self.headers[i])
    def test_ciphertext_storage_participants_and_no_plaintext_api_logs(self):
        logs=io.StringIO();handler=logging.StreamHandler(logs);identity.app.logger.addHandler(handler)
        try:
            e=self.envelope();r=self.post(e);self.assertEqual(r.status_code,201)
            for i,j in [(0,1),(1,0)]:
                r=self.client.get('/dm/conversations/'+self.wallets[j],headers=self.headers[i])
                self.assertEqual(r.status_code,200);self.assertEqual(r.json['messages'][0]['id'],e['id'])
                self.assertNotIn('DM secret test marker',r.text);self.assertEqual(r.headers['Cache-Control'],'no-store')
            self.assertNotIn(b'DM secret test marker',Path(tmp.name,'dm.sqlite3').read_bytes())
            self.assertNotIn('DM secret test marker',logs.getvalue())
        finally:identity.app.logger.removeHandler(handler)
    def test_outsider_cannot_fetch_another_conversation_even_if_mutual_with_sender(self):
        e=self.envelope();self.assertEqual(self.post(e).status_code,201)
        self.assertEqual(self.client.get('/dm/conversations/'+self.wallets[0],headers=self.headers[2]).status_code,403)
        self.graph.update({(self.wallets[2],self.wallets[0]),(self.wallets[0],self.wallets[2])})
        r=self.client.get('/dm/conversations/'+self.wallets[0]+'?sender='+self.wallets[1]+'&role=follower',headers=self.headers[2])
        self.assertEqual(r.status_code,200);self.assertEqual(r.json['messages'],[])
        self.assertEqual(self.client.get('/dm/conversations',headers=self.headers[2]).json['conversations'],[])
    def test_forged_sender_role_and_plaintext_fields_rejected(self):
        e=self.envelope();self.assertEqual(self.post(e,1).status_code,403)
        for field in ['role','isFollower','text','plaintext']:
            self.assertEqual(self.post({**e,field:'follower'}).status_code,400)
        self.graph.clear()
        self.assertEqual(self.client.get('/dm/conversations/'+self.wallets[1]+'?role=follower&isFollower=true',headers=self.headers[0]).status_code,403)
    def test_invalid_expired_and_logged_out_sessions(self):
        for headers in [{},{'Authorization':'Bearer forged'}]:
            for route in ['/dm/conversations','/dm/keys/'+self.wallets[0],'/dm/conversations/'+self.wallets[1]]:
                self.assertEqual(self.client.get(route,headers=headers).status_code,401)
            self.assertEqual(self.client.post('/dm/messages',json=self.envelope(),headers=headers).status_code,401)
        self.client.post('/auth/logout',headers=self.headers[0])
        self.assertEqual(self.post(self.envelope()).status_code,401)
        with identity.db() as conn:conn.execute('UPDATE sessions SET expires=0 WHERE address=?',(self.accounts[1].address,))
        self.assertEqual(self.client.get('/dm/conversations',headers=self.headers[1]).status_code,401)
    def test_unilateral_follow_and_unfollow_deny_send_and_history(self):
        self.assertEqual(self.post(self.envelope()).status_code,201)
        for edge in list(self.graph):
            self.graph.remove(edge)
            self.assertEqual(self.post(self.envelope()).status_code,403)
            self.assertEqual(self.client.get('/dm/conversations/'+self.wallets[1],headers=self.headers[0]).status_code,403)
            self.graph.add(edge)
    def test_signature_tamper_duplicate_and_key_replacement(self):
        e=self.envelope();self.assertEqual(self.post(e).status_code,201);self.assertEqual(self.post(e).status_code,409)
        e=self.envelope();e['signature']=sign(self.accounts[2],signed_envelope(identity.DM_CONTEXT,e));self.assertEqual(self.post(e).status_code,403)
        e=self.envelope();e['iv']=b64(os.urandom(12));self.assertEqual(self.post(e).status_code,403)
        public=self.records[2]['publicKey'];payload={'publicKey':public,'signature':sign(self.accounts[0],binding(identity.DM_CONTEXT,self.wallets[0],public))}
        self.assertEqual(self.client.post('/dm/keys',json=payload,headers=self.headers[0]).status_code,409)
        payload['signature']=sign(self.accounts[2],binding(identity.DM_CONTEXT,self.wallets[0],public))
        self.assertEqual(self.client.post('/dm/keys',json=payload,headers=self.headers[0]).status_code,403)
    def test_bad_curve_and_malformed_envelope(self):
        public=b64(b'x'*65)
        self.assertEqual(self.client.post('/dm/keys',json={'publicKey':public,'signature':sign(self.accounts[0],'bad')},headers=self.headers[0]).status_code,400)
        for mutation in [{'iv':'bad'},{'salt':b64(b'x')},{'ciphertext':b64(b'x'*5000)},{'id':'../bad'}]:
            self.assertEqual(self.post({**self.envelope(),**mutation}).status_code,400)

if __name__=='__main__':unittest.main(verbosity=2)
