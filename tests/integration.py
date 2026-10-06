"""Run against npm run dev and a real Kubo IPFS node. Uses local fake wallets only."""
import json, time, unittest
import requests
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

BASE='http://127.0.0.1:5000'
class BaseFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config=requests.get(BASE+'/config').json()
        assert config['mode']=='local' and config['chainId']==31337
        cls.wallets=requests.get(BASE+'/dev-wallets').json()['wallets']
        cls.w3=Web3(Web3.HTTPProvider(config['rpcUrl']))
        cls.contract=cls.w3.eth.contract(address=Web3.to_checksum_address(config['contractAddress']),abi=config['abi'])
        cls.alice=Web3.to_checksum_address(cls.wallets[0]['address'])
        cls.bob=Web3.to_checksum_address(cls.wallets[1]['address'])
        cls.tokens={}
        for i in [0,1,2]:
            challenge=requests.post(BASE+'/auth/challenge',json={'address':cls.wallets[i]['address']}).json()
            sig=Account.sign_message(encode_defunct(text=challenge['message']),cls.wallets[i]['privateKey']).signature.hex()
            session=requests.post(BASE+'/auth/session',json={'nonce':challenge['nonce'],'signature':sig})
            assert session.status_code==200,session.text
            cls.tokens[i]=session.json()['token']
    def auth(self,i): return {'Authorization':'Bearer '+self.tokens[i]}
    def tx(self,function,i=0):
        sender=Web3.to_checksum_address(self.wallets[i]['address'])
        tx=function.build_transaction({'from':sender,'nonce':self.w3.eth.get_transaction_count(sender),'chainId':31337})
        signed=Account.sign_transaction(tx,self.wallets[i]['privateKey'])
        receipt=self.w3.eth.wait_for_transaction_receipt(self.w3.eth.send_raw_transaction(signed.raw_transaction))
        self.assertEqual(receipt.status,1)
        return receipt
    def test_full_profile_privacy_and_follow_flow(self):
        payload={'fields':{'displayName':{'value':'Alice - PS67 demo','visibility':'public'},
            'bio':{'value':'Building a portable social identity.','visibility':'public'},
            'college':{'value':'GCET','visibility':'followers'},
            'location':{'value':'Legacy location retained','visibility':'private'},
            'email':{'value':'owner-only@example.test','visibility':'private'}},
            'posts':[{'value':'Our base prototype is running.','visibility':'public'},
                     {'value':'A private draft.','visibility':'private'}]}
        self.assertEqual(requests.post(BASE+'/profiles',json=payload).status_code,401)
        staged=requests.post(BASE+'/profiles',json=payload,headers=self.auth(0))
        self.assertEqual(staged.status_code,201,staged.text)
        cid=staged.json()['cid']
        raw=requests.post('http://127.0.0.1:5001/api/v0/cat',params={'arg':cid}).text
        self.assertNotIn('owner-only@example.test',raw);self.assertNotIn('GCET',raw);self.assertNotIn('Legacy location retained',raw);self.assertNotIn('A private draft.',raw)
        self.tx(self.contract.functions.setProfile(cid))
        export=requests.get(BASE+'/identities/'+self.alice+'/export')
        self.assertEqual(export.status_code,200)
        self.assertIn('attachment',export.headers['Content-Disposition'])
        self.assertEqual(set(export.json()),{'schemaVersion','did','chainId','contractAddress'})
        self.assertEqual(export.json()['did'],f'did:pkh:eip155:31337:{self.alice.lower()}')
        public=requests.get(BASE+'/profiles/'+self.alice).json()
        self.assertEqual(public['fields']['displayName']['value'],'Alice - PS67 demo')
        self.assertTrue(public['fields']['email']['locked']);self.assertNotIn('value',public['fields']['email'])
        owner=requests.get(BASE+'/profiles/'+self.alice,headers=self.auth(0)).json()
        self.assertEqual(owner['fields']['email']['value'],'owner-only@example.test')
        self.assertEqual(owner['fields']['college']['value'],'GCET')
        self.assertEqual(owner['fields']['location']['value'],'Legacy location retained')
        self.assertEqual(owner['posts'][1]['value'],'A private draft.')
        if self.contract.functions.isFollowing(self.bob,self.alice).call():self.tx(self.contract.functions.unfollow(self.alice),1)
        self.tx(self.contract.functions.follow(self.alice),1)
        follower=requests.get(BASE+'/profiles/'+self.alice,headers=self.auth(1)).json()
        self.assertEqual(follower['fields']['college']['value'],'GCET')
        self.assertTrue(follower['fields']['location']['locked'])
        self.assertTrue(follower['fields']['email']['locked']);self.assertIn(self.bob,follower['followers'])
        outsider=requests.get(BASE+'/profiles/'+self.alice,headers=self.auth(2)).json()
        self.assertFalse(outsider['isOwner']);self.assertFalse(outsider['isFollower'])
        self.assertEqual(outsider['fields']['displayName']['value'],'Alice - PS67 demo')
        self.assertTrue(outsider['fields']['location']['locked'])
        self.assertTrue(outsider['fields']['college']['locked']);self.assertNotIn('value',outsider['fields']['college'])
        self.assertTrue(outsider['fields']['email']['locked'])
        self.assertNotIn('value',outsider['fields']['location']);self.assertNotIn('value',outsider['fields']['email'])
        self.assertTrue(outsider['posts'][1]['locked']);self.assertNotIn('value',outsider['posts'][1])
        self.assertIn(self.bob,outsider['followers'])
        # App 2 imports the same reference and resolves the latest on-chain pointer.
        reference=export.json()
        payload['fields']['bio']['value']='Updated profile travels to App 2.'
        edited=requests.post(BASE+'/profiles',json=payload,headers=self.auth(0))
        self.assertEqual(edited.status_code,201,edited.text)
        self.assertNotEqual(edited.json()['cid'],cid)
        self.tx(self.contract.functions.setProfile(edited.json()['cid']))
        resolved_owner=reference['did'].split(':')[-1]
        latest=requests.get(BASE+'/profiles/'+resolved_owner,headers=self.auth(2)).json()
        self.assertEqual(latest['cid'],edited.json()['cid'])
        self.assertEqual(latest['fields']['bio']['value'],'Updated profile travels to App 2.')
        self.assertTrue(latest['fields']['email']['locked'])
        self.assertIn(self.bob,latest['followers'])
        self.tx(self.contract.functions.unfollow(self.alice),1)
        unfollowed=requests.get(BASE+'/profiles/'+self.alice,headers=self.auth(1)).json()
        self.assertTrue(unfollowed['fields']['location']['locked'])
        self.assertTrue(unfollowed['fields']['college']['locked']);self.assertNotIn('value',unfollowed['fields']['college'])
        # Re-follow leaves a useful sample graph for the local preview.
        self.tx(self.contract.functions.follow(self.alice),1)
    def test_auth_signature_replay_and_wrong_wallet(self):
        challenge=requests.post(BASE+'/auth/challenge',json={'address':self.alice}).json()
        wrong=Account.sign_message(encode_defunct(text=challenge['message']),self.wallets[1]['privateKey']).signature.hex()
        self.assertEqual(requests.post(BASE+'/auth/session',json={'nonce':challenge['nonce'],'signature':wrong}).status_code,401)
        valid=Account.sign_message(encode_defunct(text=challenge['message']),self.wallets[0]['privateKey']).signature.hex()
        data={'nonce':challenge['nonce'],'signature':valid}
        self.assertEqual(requests.post(BASE+'/auth/session',json=data).status_code,200)
        self.assertEqual(requests.post(BASE+'/auth/session',json=data).status_code,401)
        self.assertEqual(requests.get(BASE+'/profiles/'+self.alice,headers={'Authorization':'Bearer forged'}).status_code,401)
if __name__=='__main__':unittest.main(verbosity=2)
