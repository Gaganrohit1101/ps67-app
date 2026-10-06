// Integration against the isolated local chain and Flask, never real wallet funds.
import assert from 'node:assert/strict';
import {Wallet,NonceManager,JsonRpcProvider,Contract} from 'ethers';
import {generateDeviceKey,keyBinding,messageBinding,encryptMessage,decryptMessage} from '../ui/shared/dm-crypto.mjs';
const base=process.env.PS67_TEST_API||'http://127.0.0.1:5000';
async function api(route,token,data){
  const r=await fetch(base+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const body=await r.json();assert.ok(r.ok,`${route}: ${r.status} ${body.error||''}`);return body;
}
const config=await api('/config');
assert.equal(config.mode,'local');assert.equal(config.chainId,31337);
if(!config.encryptedDm){console.log('Live DM test skipped: opt-in feature disabled. Run npm run dev:dm to include it.');process.exit(0);}
const provider=new JsonRpcProvider(config.rpcUrl),funding=(await api('/dev-wallets')).wallets[0];
const faucet=new NonceManager(new Wallet(funding.privateKey,provider)),people=[];
for(let i=0;i<3;i++){
  const wallet=Wallet.createRandom().connect(provider),signer=new NonceManager(wallet);
  if(i<2)await (await faucet.sendTransaction({to:wallet.address,value:10n**18n})).wait();
  const c=await api('/auth/challenge',null,{address:wallet.address});
  const session=await api('/auth/session',null,{nonce:c.nonce,signature:await wallet.signMessage(c.message)});
  const device=await generateDeviceKey();
  const record=await api('/dm/keys',session.token,{publicKey:device.publicKey,signature:await wallet.signMessage(keyBinding(config.dmContext,wallet.address,device.publicKey))});
  const contract=new Contract(config.contractAddress,config.abi,signer);
  if(i<2){const profile=await api('/profiles',session.token,{fields:{displayName:{value:'DM integration '+i,visibility:'public'}},posts:[]});await(await contract.setProfile(profile.cid)).wait();}
  people.push({wallet,device,record,token:session.token,contract});
}
const [a,b,c]=people;
await(await a.contract.follow(b.wallet.address)).wait();await(await b.contract.follow(a.wallet.address)).wait();
const text='Live Web Crypto to Flask ciphertext smoke test 🔒';
let e=await encryptMessage(a.device,a.record,b.record,config.dmContext,text);
e={...e,signature:await a.wallet.signMessage(messageBinding(config.dmContext,e))};
const block=await provider.send('eth_blockNumber',[]);
await api('/dm/messages',a.token,e);
assert.equal(await provider.send('eth_blockNumber',[]),block,'Sending a DM must not write to Ethereum');
const inbox=await api('/dm/conversations/'+a.record.wallet,b.token);
assert.equal(inbox.messages.length,1);assert.ok(!JSON.stringify(inbox).includes(text));
assert.equal(await decryptMessage(b.device,b.record,a.record,config.dmContext,inbox.messages[0]),text);
assert.equal(await decryptMessage(a.device,a.record,b.record,config.dmContext,inbox.messages[0]),text);
const denied=await fetch(base+'/dm/conversations/'+a.record.wallet,{headers:{Authorization:'Bearer '+c.token}});
assert.equal(denied.status,403);await assert.rejects(decryptMessage(c.device,c.record,a.record,config.dmContext,e));
await(await b.contract.unfollow(a.wallet.address)).wait();
assert.equal((await fetch(base+'/dm/conversations/'+a.record.wallet,{headers:{Authorization:'Bearer '+b.token}})).status,403);
console.log('Live DM integration passed: signed keys/session, real mutual follow, ciphertext API, both decrypt, outsider denied, unfollow revokes fetch, no message transaction.');
provider.destroy();
