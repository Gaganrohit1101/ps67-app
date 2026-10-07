import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {generateDeviceKey,keyBinding,messageBinding,verifyKey,encryptMessage,decryptMessage} from '../ui/shared/dm-crypto.mjs';
const context='test-only|31337|contract|localhost';
async function person(){
  const wallet=Wallet.createRandom(),device=await generateDeviceKey();
  const record={wallet:wallet.address.toLowerCase(),publicKey:device.publicKey,keyId:device.keyId,context,
    signature:await wallet.signMessage(keyBinding(context,wallet.address,device.publicKey))};
  return {wallet,device,record};
}
async function message(a,b,text='A private test message: GCET 🔒'){
  const e=await encryptMessage(a.device,a.record,b.record,context,text);
  return {...e,signature:await a.wallet.signMessage(messageBinding(context,e))};
}
test('DM: both participants decrypt; ciphertext is randomized and private key cannot be exported',async()=>{
  const a=await person(),b=await person(),text='A private test message: GCET 🔒';
  const e=await message(a,b,text),again=await message(a,b,text);
  assert.equal(await decryptMessage(b.device,b.record,a.record,context,e),text);
  assert.equal(await decryptMessage(a.device,a.record,b.record,context,e),text);
  assert.notEqual(e.ciphertext,again.ciphertext);assert.notEqual(e.iv,again.iv);assert.notEqual(e.salt,again.salt);
  assert.ok(!JSON.stringify(e).includes(text));assert.ok(!Buffer.from(e.ciphertext,'base64').includes(Buffer.from(text)));
  assert.equal(a.device.privateKey.extractable,false);
  await assert.rejects(crypto.subtle.exportKey('jwk',a.device.privateKey));
});
test('DM: outsider and wrong device cannot decrypt even with a copied envelope',async()=>{
  const a=await person(),b=await person(),c=await person(),e=await message(a,b);
  await assert.rejects(decryptMessage(c.device,c.record,a.record,context,e),/participant/);
  await assert.rejects(decryptMessage({...c.device,keyId:b.device.keyId},b.record,a.record,context,e));
});
test('DM: altered payload, identity, signature, context and directory certificates fail closed',async()=>{
  const a=await person(),b=await person(),c=await person(),e=await message(a,b);
  for(const mutation of [{id:'0'.repeat(32)},{recipient:c.record.wallet},{salt:btoa('x'.repeat(32))},
    {iv:btoa('x'.repeat(12))},{ciphertext:btoa('x'.repeat(60))},{signature:await c.wallet.signMessage(messageBinding(context,e))}])
    await assert.rejects(decryptMessage(b.device,b.record,a.record,context,{...e,...mutation}));
  // Even a valid sender signature cannot make a damaged GCM tag decrypt.
  const bad={...e,ciphertext:btoa('x'.repeat(60))};bad.signature=await a.wallet.signMessage(messageBinding(context,bad));
  await assert.rejects(decryptMessage(b.device,b.record,a.record,context,bad));
  await assert.rejects(verifyKey({...a.record,publicKey:c.record.publicKey},context,a.record.wallet));
  await assert.rejects(verifyKey(a.record,'another deployment',a.record.wallet));
});
test('DM: empty and oversized UTF-8 messages are rejected',async()=>{
  const a=await person(),b=await person();
  for(const text of [' ','🔒'.repeat(1025)])await assert.rejects(encryptMessage(a.device,a.record,b.record,context,text));
});
