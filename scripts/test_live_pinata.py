import requests, json
from eth_account import Account
from eth_account.messages import encode_defunct

BASE = 'https://ps67-backend.onrender.com'

# 1. Health check
health = requests.get(f'{BASE}/health').json()
print("Health check response:", health)
assert health.get('ok') is True, f"Health check failed: {health}"
assert health.get('storageProvider') == 'pinata', f"Expected pinata, got: {health}"

# 2. Create a temporary test wallet
test_wallet = Account.create()
address = test_wallet.address
print(f"Testing with address: {address}")

# 3. Request challenge
c_res = requests.post(f'{BASE}/auth/challenge', json={'address': address})
assert c_res.status_code == 200, f"Challenge failed: {c_res.text}"
challenge_data = c_res.json()
print("Received challenge nonce:", challenge_data['nonce'])

# 4. Sign challenge
sig = Account.sign_message(encode_defunct(text=challenge_data['message']), test_wallet.key).signature.hex()

# 5. Create session
s_res = requests.post(f'{BASE}/auth/session', json={'nonce': challenge_data['nonce'], 'signature': sig})
assert s_res.status_code == 200, f"Session creation failed: {s_res.text}"
token = s_res.json()['token']
print("Successfully authenticated, session token received.")

# 6. Publish profile with public, followers, and private fields
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
payload = {
    'fields': {
        'displayName': {'value': 'Demo Owner', 'visibility': 'public'},
        'bio': {'value': 'Portable identity demo', 'visibility': 'public'},
        'college': {'value': 'GCET', 'visibility': 'followers'},
        'email': {'value': 'demo@example.com', 'visibility': 'private'},
        'website': {'value': 'https://example.com', 'visibility': 'public'}
    },
    'posts': [
        {'value': 'First public post', 'visibility': 'public'},
        {'value': 'Followers-only secret announcement', 'visibility': 'followers'}
    ]
}

p_res = requests.post(f'{BASE}/profiles', json=payload, headers=headers)
assert p_res.status_code == 201, f"Publish failed: {p_res.text}"
pub_data = p_res.json()
cid = pub_data['cid']
print("Profile published to Pinata!")
print(f"Generated CID: {cid}")
print(f"DID: {pub_data['did']}")

# 7. Check raw IPFS content via Pinata / public gateway to verify encryption
gw_url = f"https://gateway.pinata.cloud/ipfs/{cid}"
raw_res = requests.get(gw_url, timeout=15)
if not raw_res.ok:
    raw_res = requests.get(f"https://ipfs.io/ipfs/{cid}", timeout=15)

assert raw_res.ok, f"Gateway fetch failed: {raw_res.status_code}"
raw_doc = raw_res.json()
print("Raw doc fetched from IPFS gateway.")
print("Fields in raw doc:", list(raw_doc['fields'].keys()))

# Verify encryption
assert raw_doc['fields']['displayName']['value'] == 'Demo Owner'
assert 'value' not in raw_doc['fields']['college'], "Followers field should not have plaintext value"
assert raw_doc['fields']['college']['encryption'] == 'AES-256-GCM'
assert 'value' not in raw_doc['fields']['email'], "Private field should not have plaintext value"
assert raw_doc['fields']['email']['encryption'] == 'AES-256-GCM'
assert 'demo@example.com' not in raw_res.text, "CRITICAL: Plaintext email leaked in IPFS storage!"
assert 'GCET' not in raw_res.text, "CRITICAL: Plaintext college leaked in IPFS storage!"
print("Encryption verification PASSED: zero plaintext leaked to Pinata/IPFS.")
