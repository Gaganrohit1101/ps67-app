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
    def test_dm_is_disabled_by_default(self):
        client=identity.app.test_client()
        self.assertFalse(client.get('/config').json['encryptedDm'])
        self.assertIsNone(client.get('/config').json['dmContext'])
        self.assertEqual(client.get('/dm/conversations').status_code,404)
    def test_college_does_not_reinterpret_legacy_location_ciphertext(self):
        owner='0x1111111111111111111111111111111111111111'
        legacy=identity.seal(owner,'location',{'value':'Existing location','visibility':'private'})
        self.assertEqual(identity.reveal(owner,'location',legacy,True,False)['value'],'Existing location')
        with self.assertRaises(InvalidTag):identity.reveal(owner,'college',legacy,True,False)
        college=identity.seal(owner,'college',{'value':'GCET','visibility':'followers'})
        self.assertEqual(identity.reveal(owner,'college',college,False,True)['value'],'GCET')
        self.assertNotIn('value',identity.reveal(owner,'college',college,False,False))
    def test_independent_apps_have_independently_revocable_sessions(self):
        signer=Account.create();client=identity.app.test_client();tokens=[]
        class FakeContract:address='0x2222222222222222222222222222222222222222'
        for origin in ['http://127.0.0.1:8000','http://127.0.0.1:8001']:
            with patch.object(identity,'check_chain'),patch.object(identity,'contract',FakeContract()):
                challenge=client.post('/auth/challenge',json={'address':signer.address},headers={'Origin':origin}).json
            signature=Account.sign_message(encode_defunct(text=challenge['message']),signer.key).signature.hex()
            tokens.append(client.post('/auth/session',json={'nonce':challenge['nonce'],'signature':signature},headers={'Origin':origin}).json['token'])
        self.assertNotEqual(tokens[0],tokens[1])
        client.post('/auth/logout',headers={'Authorization':'Bearer '+tokens[0]})
        with identity.app.test_request_context(headers={'Authorization':'Bearer '+tokens[0]}):
            with self.assertRaises(PermissionError):identity.viewer(True)
        with identity.app.test_request_context(headers={'Authorization':'Bearer '+tokens[1]}):
            self.assertEqual(identity.viewer(True),signer.address)
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
    def test_forged_roles_and_client_parameters_are_denied(self):
        owner='0x1111111111111111111111111111111111111111'
        email_item=identity.seal(owner,'email',{'visibility':'private','value':'owner-secret@example.com'})
        college_item=identity.seal(owner,'college',{'visibility':'followers','value':'GCET'})
        # When a non-owner/non-follower client attempts to claim roles:
        # Backend authorization ignores any claims; only cryptographic truth is evaluated.
        # Test 1: Non-follower attempting to access followers-only field
        revealed_follower=identity.reveal(owner,'college',college_item,is_owner=False,is_follower=False)
        self.assertTrue(revealed_follower['locked'])
        self.assertNotIn('value',revealed_follower)
        # Test 2: Non-owner attempting to access owner-only field
        revealed_owner=identity.reveal(owner,'email',email_item,is_owner=False,is_follower=True)
        self.assertTrue(revealed_owner['locked'])
        self.assertNotIn('value',revealed_owner)
        # Test 3: Unauthenticated visitor has empty viewer (public only)
        with identity.app.test_request_context():
            self.assertEqual(identity.viewer(False),'')
            with self.assertRaises(PermissionError):identity.viewer(True)
        # Test 4: Forged or expired bearer token is strictly rejected with PermissionError
        with identity.app.test_request_context(headers={'Authorization':'Bearer invalid_fake_token'}):
            with self.assertRaises(PermissionError):identity.viewer(False)
            with self.assertRaises(PermissionError):identity.viewer(True)
if __name__=='__main__':unittest.main(verbosity=2)
