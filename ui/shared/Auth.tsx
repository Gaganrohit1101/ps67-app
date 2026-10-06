import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import { IdentityClient, friendlyError } from '../../frontend/lib/client.js';
import {Button,short,ThemeSwitch} from './components';
import type {TxState} from './types';
type Context={client:any;epoch:number;ready:boolean;busy:boolean;error:string;health:string;tx:TxState|null;setTx:(s:TxState|null)=>void;run:(f:()=>Promise<void>)=>Promise<void>};
const Auth=createContext<Context|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
  // A distinct instance per app/tab. No session token is stored or shared.
  const [client]=useState<any>(()=>new IdentityClient());
  const [epoch,setEpoch]=useState(0),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[health,setHealth]=useState('Connecting to blockchain and storage…'),[tx,setTx]=useState<TxState|null>(null);
  const running=useRef(false);
  async function run(action:()=>Promise<void>) {
    if(running.current)return;running.current=true;setBusy(true);setError('');
    try{await action();}catch(e){setError(friendlyError(e));}finally{running.current=false;setBusy(false);}
  }
  useEffect(()=>{
    let active=true;
    const changed=()=>{setEpoch(e=>e+1);setError('');setTx(null);};
    client.addEventListener('change',changed);
    (async()=>{try{await client.init();if(!active)return;setReady(true);const status=await client.api('/health');if(active)setHealth(status.ok?'Blockchain connected · IPFS ready':'Services unavailable');}catch(e){if(active){setError(friendlyError(e));setHealth('Check service connection');}}})();
    return()=>{active=false;client.removeEventListener('change',changed);};
  },[client]);
  return <Auth.Provider value={{client,epoch,ready,busy,error,health,tx,setTx,run}}>{children}</Auth.Provider>;
}
export function useAuth(){const value=useContext(Auth);if(!value)throw new Error('Missing wallet provider');return value;}
export function WalletBar() {
  const {client,ready,busy,run}=useAuth();const [demo,setDemo]=useState('0');
  return <div className="wallet-bar"><ThemeSwitch/>{client.devWallets.length>0&&<><select className="select" aria-label="Local demo wallet" value={demo} disabled={busy} onChange={e=>setDemo(e.target.value)}>{client.devWallets.map((w:any,i:number)=><option key={w.address} value={i}>{w.label} (local)</option>)}</select><Button variant="secondary" disabled={!ready||busy} onClick={()=>run(()=>client.connectDev(Number(demo)))}>Use demo wallet</Button></>}<Button disabled={!ready||busy} onClick={()=>run(()=>client.connectWallet())}>Connect MetaMask</Button>{client.address&&<><span className="wallet-address" title={client.address}>{short(client.address)}</span><Button variant="ghost" disabled={busy} onClick={()=>run(()=>client.disconnect())}>Disconnect</Button></>}</div>;
}
export function ServiceStatus(){const {client,ready,error,health}=useAuth();return <div className="service-info"><span>{ready?`${client.config.networkName} · Chain ${client.config.chainId}`:'Connecting…'}</span><span>{health}</span>{client.config?.mode==='local'&&<small>Local rehearsal · fake tokens only</small>}{error&&<div className="notice error" role="alert">{error}<Button variant="ghost" onClick={()=>location.reload()}>Reload</Button></div>}</div>;}
export function Transaction(){const {tx,client}=useAuth();return <section className="transaction-status" aria-label="Transaction status" aria-live="polite" aria-atomic="true"><h2>Transaction status</h2>{tx?<><strong className={`tx-${tx.state}`}>{tx.state.toUpperCase()}</strong><p>{tx.message}</p>{tx.hash&&(client.config.explorer?<a className="mono" href={`${client.config.explorer}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">{tx.hash} ↗</a>:<p className="mono">{tx.hash}</p>)}{tx.block!==undefined&&<small>Block {tx.block}</small>}</>:<p>Your next transaction will appear here.</p>}</section>;}
