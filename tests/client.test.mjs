import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityClient, friendlyError } from '../frontend/lib/client.js';

test('a signature finishing after disconnect never restores the old wallet session', async () => {
  const client = new IdentityClient();
  let signed, release;
  const reachedSignature = new Promise(resolve => signed = resolve);
  client.signer = { getAddress: async () => '0x1111111111111111111111111111111111111111',
    signMessage: async () => { signed(); return new Promise(resolve => release = resolve); } };
  client.api = async route => route === '/auth/challenge' ? { nonce: 'test', message: 'test' } : { token: 'obsolete' };
  const pending = client.signIn();
  await reachedSignature;
  client.clear(); release('test-signature');
  await assert.rejects(pending, /wallet changed/);
  assert.equal(client.token, ''); assert.equal(client.address, '');
});

test('portable references reject another chain or contract', () => {
  const client = new IdentityClient();
  client.config = { chainId: 31337, contractAddress: '0x2222222222222222222222222222222222222222' };
  const reference = { schemaVersion: 1, chainId: 31337, contractAddress: client.config.contractAddress,
    did: 'did:pkh:eip155:31337:0x1111111111111111111111111111111111111111' };
  assert.equal(client.import(reference), '0x1111111111111111111111111111111111111111');
  assert.throws(() => client.import({ ...reference, chainId: 11155111 }));
  assert.throws(() => client.import({ ...reference, contractAddress: '0x3333333333333333333333333333333333333333' }));
});

test('real transaction reporting covers pending, confirmed, rejected and reverted', async () => {
  const client=new IdentityClient(), states=[];
  await client.transaction(async()=>({hash:'0xtest',wait:async()=>({status:1,blockNumber:42})}),s=>states.push(s));
  assert.deepEqual(states.map(s=>s.state),['pending','pending','confirmed']);
  assert.equal(states[2].block,42);
  for(const make of [async()=>{throw Object.assign(new Error('Rejected'),{code:4001});},async()=>({hash:'0xtest',wait:async()=>({status:0})})]) {
    const failed=[];await assert.rejects(client.transaction(make,s=>failed.push(s)));
    assert.equal(failed[0].state,'pending');assert.equal(failed.at(-1).state,'failed');
  }
});

test('mobile connection requests Sepolia switch and verifies the wallet network', async () => {
  const client=new IdentityClient();client.config={chainId:11155111};
  let chain='0x1', switches=0;
  await client.ensureWalletNetwork({request:async({method,params})=>{
    if(method==='eth_chainId')return chain;
    assert.equal(method,'wallet_switchEthereumChain');assert.equal(params[0].chainId,'0xaa36a7');switches++;chain=params[0].chainId;
  }});
  assert.equal(switches,1);
  await client.ensureWalletNetwork({request:async({method})=>{assert.equal(method,'eth_chainId');return '0xaa36a7';}});
  await assert.rejects(client.ensureWalletNetwork({request:async({method})=>{if(method==='eth_chainId')return '0x1';throw Object.assign(new Error('Rejected'),{code:4001});}}),/Rejected/);
  await assert.rejects(client.ensureWalletNetwork({request:async({method})=>method==='eth_chainId'?'0x1':null}),/has not switched/);
});


test('relay provider switching clears authenticated content and avoids duplicate event listeners', () => {
 const client=new IdentityClient(), handlers={};
 const provider={on:(event,fn)=>handlers[event]=fn, removeListener:(event)=>delete handlers[event]};
 client.bindWalletProvider(provider);client.bindWalletProvider(provider);
 assert.equal(Object.keys(handlers).length,3);
 client.address='0x1111111111111111111111111111111111111111';client.token='session';client.signer={};
 handlers.accountsChanged(['0x2222222222222222222222222222222222222222']);
 assert.equal(client.token,'');assert.equal(client.address,'');assert.equal(client.signer,null);
 client.address='owner';client.token='session';handlers.chainChanged();assert.equal(client.token,'');
});


test('installed app signs in through the relay provider without navigating away', async () => {
 const client=new IdentityClient();client.config={chainId:11155111};
 const previousWindow=globalThis.window, previousSecure=globalThis.isSecureContext;
 globalThis.window={};globalThis.isSecureContext=true;
 const address='0x1111111111111111111111111111111111111111';
 let connects=0;
 const provider={request:async({method})=>{
  if(method==='eth_chainId')return '0xaa36a7';
  if(method==='eth_accounts'||method==='eth_requestAccounts')return [address];
  throw new Error('Unexpected request '+method);
 },on:()=>{}};
 client.mobileWalletClient={status:'disconnected',connect:async options=>{assert.deepEqual(options.chainIds,['0xaa36a7']);connects++;},getProvider:()=>provider};
 client.signIn=async()=>{client.address=await client.signer.getAddress();client.token='verified-test-session';};
 try{await client.connectWallet();assert.equal(connects,1);assert.equal(client.address,address);assert.equal(client.token,'verified-test-session');assert.equal(client.walletProvider,provider);}
 finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousSecure===undefined)delete globalThis.isSecureContext;else globalThis.isSecureContext=previousSecure;}
});

 test('wallet errors identify the failed RPC without leaking request data',()=>{
 const result=friendlyError({code:'UNKNOWN_ERROR',payload:{method:'personal_sign',params:['secret-challenge']},error:{code:-32603,message:'sensitive'}});
 assert.match(result,/personal_sign/);assert.match(result,/-32603/);assert.doesNotMatch(result,/secret|sensitive/);
 assert.match(friendlyError({code:'UNKNOWN_ERROR',error:{code:4001}}),/cancelled/);
 });
