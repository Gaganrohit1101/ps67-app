import {useEffect,useRef,useState} from 'react';
import {getAddress} from 'ethers';
import {useAuth} from '../shared/Auth';
import {Button,Empty,short} from '../shared/components';
import {deviceKey,verifyKey,keyBinding,encryptMessage,decryptMessage,messageBinding} from '../shared/dm-crypto.mjs';
import './messages.css';

export default function Messages(){
  const {client,busy,run}=useAuth();
  const [device,setDevice]=useState<any>(null),[own,setOwn]=useState<any>(null),[peer,setPeer]=useState<any>(null);
  const [recipient,setRecipient]=useState(''),[draft,setDraft]=useState(''),[rows,setRows]=useState<any[]>([]),[threads,setThreads]=useState<any[]>([]);
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const active=useRef(true);
  useEffect(()=>()=>{active.current=false;},[]);
  const context=client.config?.dmContext, wallet=client.address?.toLowerCase();
  function guard(){const token=client.token,who=wallet;return ()=>active.current&&token===client.token&&who===client.address?.toLowerCase();}
  async function action(fn:(valid:()=>boolean)=>Promise<void>){
    const valid=guard();setError('');
    await run(async()=>{try{await fn(valid);}catch(e:any){if(valid()){setRows([]);setPeer(null);setDraft('');setStatus('');setError(e.code==='ACTION_REJECTED'||e.code===4001?'Wallet signature rejected. Nothing was sent.':e.message||'Encrypted message operation failed.');}}});
  }
  async function enable(valid:()=>boolean){
    if(!globalThis.crypto?.subtle)throw new Error('Messaging needs HTTPS or localhost. Ordinary HTTP LAN addresses are not supported.');
    let record;
    try{record=await client.api('/dm/keys/'+wallet);}catch(e:any){if(!e.message.includes('This wallet has not enabled encrypted messages'))throw e;}
    if(!valid())return;
    const key=await deviceKey(context+'|'+wallet,!record);
    if(!valid())return;
    if(!key)throw new Error('Use the original browser/device. This prototype cannot recover or replace your messaging key.');
    if(!record){
      setStatus('Sign to bind this device’s public messaging key to your wallet. No gas needed.');
      const signature=await client.signer.signMessage(keyBinding(context,wallet,key.publicKey));
      if(!valid())return;
      record=await client.api('/dm/keys',{publicKey:key.publicKey,signature});
    }
    await verifyKey(record,context,wallet);
    if(key.keyId!==record.keyId)throw new Error('Use the browser that originally enabled messages. This device has a different key.');
    const index=await client.api('/dm/conversations');
    if(valid()){setOwn(record);setDevice(key);setThreads(index.conversations);setStatus('Device ready. Both wallets must enable messages and follow each other.');}
  }
  async function load(address:string,valid:()=>boolean){
    setRows([]);setPeer(null);setDraft('');
    let target:string;try{target=getAddress(address.trim()).toLowerCase();}catch{throw new Error('Enter a valid recipient wallet address (0x followed by 40 hexadecimal characters).');}
    const data=await client.api('/dm/conversations/'+target);
    const other=data.keys.find((k:any)=>k.wallet===target);
    await verifyKey(other,context,target);
    const decrypted=await Promise.all(data.messages.map(async(e:any)=>({...e,text:await decryptMessage(device,own,other,context,e)})));
    const index=await client.api('/dm/conversations');
    if(valid()){setThreads(index.conversations);setRecipient(target);setPeer(other);setRows(decrypted);setStatus('Encrypted conversation loaded. Latest 100 messages; use Refresh for updates.');}
  }
  async function send(valid:()=>boolean){
    setStatus('Encrypting on this device…');
    const envelope=await encryptMessage(device,own,peer,context,draft);
    if(!valid())return;
    setStatus('Sign the encrypted message in your wallet. No Ethereum transaction or gas.');
    const signature=await client.signer.signMessage(messageBinding(context,envelope));
    if(!valid())return;
    setStatus('Storing encrypted message…');
    await client.api('/dm/messages',{...envelope,signature});
    if(!valid())return;
    setDraft('');
    await load(peer.wallet,valid);
    if(valid())setStatus('Encrypted message stored off-chain.');
  }
  if(!client.config?.encryptedDm)return <div className="page-wrap"><Empty title="Messaging prototype is disabled">This optional feature must be enabled locally by the project operator.</Empty></div>;
  if(!wallet||!client.token)return <div className="page-wrap"><Empty title="Connect and sign in">Messages require a wallet-authenticated session.</Empty></div>;
  return <div className="page-wrap dm-page"><h1>Messages</h1><p className="notice">Encrypted messaging prototype · mutual followers only. Keys stay in this browser. Clearing site data loses access; no recovery or forward secrecy. Use a separate browser profile for each person.</p>
    <p role="status" aria-live="polite">{status}</p>{error&&<p role="alert" className="notice error">{error}</p>}
    {!device?<Button disabled={busy} onClick={()=>action(enable)}>Enable / unlock on this device</Button>:<div className="dm-layout">
      <aside className="editor-card"><h2>New message</h2><form onSubmit={e=>{e.preventDefault();action(valid=>load(recipient,valid));}}><label htmlFor="dm-recipient">Recipient wallet</label><input id="dm-recipient" className="input" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={busy} required autoComplete="off" spellCheck={false}/><Button type="submit" disabled={busy}>Open conversation</Button></form><h2>Conversations</h2>{threads.length===0&&<p>No messages yet.</p>}{threads.map(t=><Button key={t.wallet} variant="secondary" disabled={busy} title={t.wallet} onClick={()=>action(valid=>load(t.wallet,valid))}>{short(t.wallet)}</Button>)}</aside>
      <section className="editor-card" aria-label="Conversation">{peer?<><h2>Conversation</h2><p className="dm-address">{peer.wallet}</p><Button variant="secondary" disabled={busy} onClick={()=>action(valid=>load(peer.wallet,valid))}>Refresh</Button><ol className="dm-history">{rows.map(m=><li key={m.id}><small>Encrypted message · {m.sender===wallet?'You':'Peer'} · {new Date(m.timestamp).toLocaleString()}</small><p>{m.text}</p></li>)}</ol>{rows.length===0&&<p>No messages in this conversation.</p>}<form onSubmit={e=>{e.preventDefault();action(send);}}><label htmlFor="dm-message">Encrypted message</label><textarea id="dm-message" className="input" value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy} maxLength={4096} rows={4} required/><small>Up to 4096 UTF-8 bytes. Text is encrypted here before upload.</small><Button type="submit" disabled={busy||!draft.trim()}>Encrypt & send</Button></form></>:<p>Open a mutual follower’s wallet to start.</p>}</section>
    </div>}
  </div>;
}
