"""Focused gateway tests; no external chain or IPFS daemon required."""
import importlib.util, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from eth_account import Account
from eth_account.messages import encode_defunct
from cryptography.exceptions import InvalidTag

tmp=tempfile.TemporaryDirectory()
os.environ.update(MODE='local', CHAIN_ID='31337', DATA_DIR=tmp.name, CONTRACT_ADDRESS='')
spec=importlib.util.spec_from_file_location('identity',Path(__file__).resolve().parents[1]/'backend/identity.py')
identity=importlib.util.module_from_spec(spec);spec.loader.exec_module(identity)

class PrivacyTests(unittest.TestCase):
    def test_visibility_matrix_and_ciphertext_integrity(self):
        owner='0x1111111111111111111111111111111111111111'
        for visibility in ['public','followers','private']:
            value='Only permitted wallets see this.'
            item=identity.seal(owner,'email',{'visibility':visibility,'value':value})
            if visibility!='public':self.assertNotIn(value,str(item))
            for is_owner,is_follower in [(False,False),(False,True),(True,False)]:
                result=identity.reveal(owner,'email',item,is_owner,is_follower)
                allowed=visibility=='public' or is_owner or (visibility=='followers' and is_follower)
                self.assertEqual(not result['locked'],allowed)
                if allowed:self.assertEqual(result['value'],value)
                else:self.assertNotIn('value',result)
            if visibility!='public':
                with self.assertRaises(InvalidTag):identity.reveal(owner,'location',item,True,False)
    def test_signed_challenge_is_single_use_and_cannot_be_impersonated(self):
        signer=Account.create();other=Account.create();client=identity.app.test_client()
        class FakeContract:address='0x2222222222222222222222222222222222222222'
        with patch.object(identity,'check_chain'),patch.object(identity,'contract',FakeContract()):
            challenge=client.post('/auth/challenge',json={'address':signer.address}).json
        wrong=Account.sign_message(encode_defunct(text=challenge['message']),other.key).signature.hex()
        self.assertEqual(client.post('/auth/session',json={'nonce':challenge['nonce'],'signature':wrong}).status_code,401)
        signature=Account.sign_message(encode_defunct(text=challenge['message']),signer.key).signature.hex()
        data={'nonce':challenge['nonce'],'signature':signature}
        session=client.post('/auth/session',json=data)
        self.assertEqual(session.status_code,200)
        self.assertEqual(client.post('/auth/session',json=data).status_code,401)
        with identity.app.test_request_context(headers={'Authorization':'Bearer '+session.json['token']}):self.assertEqual(identity.viewer(True),signer.address)
        client.post('/auth/logout',headers={'Authorization':'Bearer '+session.json['token']})
        with identity.app.test_request_context(headers={'Authorization':'Bearer '+session.json['token']}):
            with self.assertRaises(PermissionError):identity.viewer(True)
    def test_schema_rejects_invalid_visibility_or_oversized_values(self):
        for item in [{'value':'x','visibility':'hidden'},{'value':'x'*2001,'visibility':'private'}]:
            with self.assertRaises(ValueError):identity.seal('0x1','email',item)
if __name__=='__main__':unittest.main(verbosity=2)
