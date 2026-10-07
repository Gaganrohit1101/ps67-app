// Standard Web Crypto primitives. These keys are separate from Ethereum wallet keys.
import {verifyMessage} from 'ethers';
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const un64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const random = size => crypto.getRandomValues(new Uint8Array(size));
const aad = (context, e) => JSON.stringify(['PS67 DM ciphertext v1', context, e.id,
  e.sender, e.recipient, e.senderKey, e.recipientKey]);
export const keyBinding = (context, wallet, publicKey) => JSON.stringify(['PS67 DM key v1', context, wallet.toLowerCase(), publicKey]);
export const messageBinding = (context, e) => JSON.stringify(['PS67 DM message v1', context, e.id,
  e.sender, e.recipient, e.senderKey, e.recipientKey, e.salt, e.iv, e.ciphertext]);

export async function generateDeviceKey() {
  if (!globalThis.crypto?.subtle) throw new Error('Encrypted messages require HTTPS or localhost and Web Crypto.');
  const pair = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, false, ['deriveBits']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return {privateKey:pair.privateKey, publicKey:b64(raw), keyId:hex(await crypto.subtle.digest('SHA-256', raw))};
}

export async function verifyKey(record, context, wallet) {
  if (record.context !== context || record.wallet !== wallet.toLowerCase() ||
      verifyMessage(keyBinding(context, wallet, record.publicKey), record.signature).toLowerCase() !== wallet.toLowerCase())
    throw new Error('Messaging public key wallet signature is invalid.');
  const raw = un64(record.publicKey);
  if (hex(await crypto.subtle.digest('SHA-256', raw)) !== record.keyId) throw new Error('Messaging key fingerprint mismatch.');
  return crypto.subtle.importKey('raw', raw, {name:'ECDH', namedCurve:'P-256'}, false, []);
}

async function messageKey(device, peer, context, envelope) {
  const publicKey = await verifyKey(peer, context, peer.wallet);
  const bits = await crypto.subtle.deriveBits({name:'ECDH', public:publicKey}, device.privateKey, 256);
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF', hash:'SHA-256', salt:un64(envelope.salt),
    info:enc.encode(aad(context, envelope))}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

export async function encryptMessage(device, own, peer, context, text) {
  await verifyKey(own, context, own.wallet);
  if (device.keyId !== own.keyId) throw new Error('This device does not hold the registered messaging key.');
  const bytes = enc.encode(text);
  if (!text.trim() || bytes.length > 4096) throw new Error('Enter a message up to 4096 UTF-8 bytes.');
  const e = {id:hex(random(16)), sender:own.wallet, recipient:peer.wallet,
    senderKey:own.keyId, recipientKey:peer.keyId, salt:b64(random(32)), iv:b64(random(12))};
  const key = await messageKey(device, peer, context, e);
  return {...e, ciphertext:b64(await crypto.subtle.encrypt({name:'AES-GCM', iv:un64(e.iv),
    additionalData:enc.encode(aad(context, e)), tagLength:128}, key, bytes))};
}

export async function decryptMessage(device, own, peer, context, e) {
  await verifyKey(own, context, own.wallet);
  const participants = [e.sender, e.recipient];
  if (!participants.includes(own.wallet) || !participants.includes(peer.wallet) || own.wallet === peer.wallet)
    throw new Error('This wallet is not a conversation participant.');
  const ids = e.sender === own.wallet ? [own.keyId, peer.keyId] : [peer.keyId, own.keyId];
  if (device.keyId !== own.keyId || e.senderKey !== ids[0] || e.recipientKey !== ids[1])
    throw new Error('Message key mismatch.');
  if (verifyMessage(messageBinding(context, e), e.signature).toLowerCase() !== e.sender)
    throw new Error('Message sender signature is invalid.');
  const key = await messageKey(device, peer, context, e);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:un64(e.iv),
    additionalData:enc.encode(aad(context, e)), tagLength:128}, key, un64(e.ciphertext));
  return new TextDecoder('utf-8', {fatal:true}).decode(plain);
}

// IndexedDB structured-clones a non-extractable CryptoKey. No private key is exported.
export async function deviceKey(scope, create = false) {
  const database = await new Promise((resolve, reject) => {
    const r = indexedDB.open('ps67-dm-device-v1', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error('Browser key storage is unavailable.'));
  });
  try {
    const read = () => new Promise((resolve,reject) => {
      const r = database.transaction('keys').objectStore('keys').get(scope);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Unable to read device key.'));
    });
    let key = await read();
    if (!key && create) {
      key = await generateDeviceKey();
      try {
        await new Promise((resolve,reject) => {
          const tx = database.transaction('keys','readwrite');
          tx.objectStore('keys').add(key, scope);
          tx.oncomplete = () => resolve(); tx.onabort = () => reject(new Error('Key storage failed.'));
        });
      } catch (error) {
        // Another tab may have enrolled this same device concurrently. Never overwrite.
        key = await read(); if (!key) throw error;
      }
    }
    return key;
  } finally { database.close(); }
}
