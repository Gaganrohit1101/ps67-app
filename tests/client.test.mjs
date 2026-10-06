import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityClient } from '../frontend/lib/client.js';

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
