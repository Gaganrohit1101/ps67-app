"""Regression: the assistant adds no authority to either independently signed app."""
import importlib.util, os, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from eth_account import Account
from eth_account.messages import encode_defunct
tmp=tempfile.TemporaryDirectory()
os.environ.update(MODE='local',CHAIN_ID='31337',DATA_DIR=tmp.name,CONTRACT_ADDRESS='',PINATA_JWT='')
spec=importlib.util.spec_from_file_location('identity',Path(__file__).resolve().parents[1]/'backend/identity.py')
identity=importlib.util.module_from_spec(spec);spec.loader.exec_module(identity)
class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.owner,self.follower,self.outsider=[Account.create() for _ in range(3)]
        self.client=identity.app.test_client();self.following=False
        def value(v):return SimpleNamespace(call=lambda:v)
        self.contract=SimpleNamespace(address='0x2222222222222222222222222222222222222222',functions=SimpleNamespace(
            profiles=lambda owner:value('bafy'+'a'*50),isFollowing=lambda who,owner:value(self.following and who.lower()==self.follower.address.lower()),
            getFollowers=lambda owner:value([self.follower.address] if self.following else []),getFollowing=lambda owner:value([])))
        self.doc={'schemaVersion':1,'did':identity.did(self.owner.address),'owner':self.owner.address,'chainId':31337,'fields':{
            'displayName':identity.seal(self.owner.address,'displayName',{'value':'Owner','visibility':'public'}),
            'college':identity.seal(self.owner.address,'college',{'value':'GCET','visibility':'followers'}),
            'email':identity.seal(self.owner.address,'email',{'value':'owner-private@example.test','visibility':'private'}),
            'bio':identity.seal(self.owner.address,'bio',{'value':'Phone 9876543210','visibility':'private'})},'posts':[]}
        for name,new in [('check_chain',lambda:None),('contract',self.contract),('ipfs_read',lambda cid:self.doc)]:
            p=patch.object(identity,name,new);p.start();self.addCleanup(p.stop)
    def session(self,account,origin):
        ch=self.client.post('/auth/challenge',json={'address':account.address},headers={'Origin':origin}).json
        sig=Account.sign_message(encode_defunct(text=ch['message']),account.key).signature.hex()
        r=self.client.post('/auth/session',json={'nonce':ch['nonce'],'signature':sig},headers={'Origin':origin});self.assertEqual(r.status_code,200)
        return {'Authorization':'Bearer '+r.json['token'],'Origin':origin}
    def test_owner_follower_nonfollower_filtering_in_sovereign_and_atlas(self):
        for origin in ['http://127.0.0.1:8000','http://127.0.0.1:8001']:
            headers=self.session(self.outsider,origin)
            r=self.client.get('/profiles/'+self.owner.address+'?role=owner&isFollower=true&privacyAssistantEnabled=true',headers=headers)
            self.assertEqual(r.status_code,200);self.assertFalse(r.json['isOwner']);self.assertFalse(r.json['isFollower'])
            for key in ['college','email','bio']:self.assertNotIn('value',r.json['fields'][key])
            for secret in ['GCET','owner-private@example.test','9876543210']:self.assertNotIn(secret,r.text)
            # A signed follower still has no access before the on-chain relation is true.
            follower_headers=self.session(self.follower,origin)
            self.assertNotIn('value',self.client.get('/profiles/'+self.owner.address,headers=follower_headers).json['fields']['college'])
            self.following=True
            follower=self.client.get('/profiles/'+self.owner.address,headers=follower_headers).json
            self.assertEqual(follower['fields']['college']['value'],'GCET')
            for key in ['email','bio']:self.assertNotIn('value',follower['fields'][key])
            owner=self.client.get('/profiles/'+self.owner.address,headers=self.session(self.owner,origin)).json
            self.assertEqual(owner['fields']['email']['value'],'owner-private@example.test');self.assertEqual(owner['fields']['bio']['value'],'Phone 9876543210')
            self.following=False
    def test_assistant_cannot_create_session_or_extend_profile_schema(self):
        self.assertEqual(self.client.get('/profiles/'+self.owner.address,headers={'Authorization':'Bearer forged','role':'owner'}).status_code,401)
        headers=self.session(self.owner,'http://127.0.0.1:8000')
        # Dedicated Phone/Username are absent in the current core schema; no new storage behavior.
        for field in ['phone','username','role','privacyAssistantEnabled']:
            r=self.client.post('/profiles',json={'fields':{field:{'value':'secret','visibility':'private'}}},headers=headers)
            self.assertEqual(r.status_code,400)
if __name__=='__main__':unittest.main(verbosity=2)
