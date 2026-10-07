import {createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {Link} from 'react-router';
import {useAuth} from '../shared/Auth';
import {Button} from '../shared/components';
import {PrivacyPreference} from './privacy-assistant.mjs';
import './privacy-assistant.css';
type PreferenceContext={enabled:boolean;preference:PrivacyPreference};
const AssistantContext=createContext<PreferenceContext|null>(null);
export function PrivacyAssistantProvider({children}:{children:ReactNode}){
  const {client}=useAuth();
  const scope=client.address?`${client.config?.chainId}|${client.config?.contractAddress?.toLowerCase()}|${client.address.toLowerCase()}`:'guest';
  const preference=useMemo(()=>{let storage;try{storage=window.localStorage;}catch{}return new PrivacyPreference(storage,scope);},[scope]);
  const enabled=useSyncExternalStore(preference.subscribe,preference.snapshot,()=>false);
  useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key===preference.key||e.key===null)preference.refresh();};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[preference]);
  return <AssistantContext.Provider value={{enabled,preference}}>{children}</AssistantContext.Provider>;
}
export function usePrivacyAssistant(){const value=useContext(AssistantContext);if(!value)throw new Error('Missing Privacy Assistant provider');return value;}
export function AssistantModal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
  return <dialog ref={dialog} className="assistant-modal" aria-label={title} onCancel={onClose} onClose={onClose}><div className="assistant-modal-body"><h2>{title}</h2>{children}</div></dialog>;
}
export function AssistantExplanation({onClose}:{onClose:()=>void}){
  return <AssistantModal title="How Privacy Assistant works" onClose={onClose}><p>Local privacy analysis suggests Public, Followers only or Private visibility. This is an explainable rule engine, not an LLM.</p><h3>What it can analyze</h3><p>Only a profile field you select, its field type and current visibility. Analysis happens on this device when you press Analyze or request a pre-publish review.</p><h3>What it cannot access</h3><p>The analyzer never receives wallet private keys, seed or recovery phrases, authentication tokens, encryption keys, DMs, unrelated fields or other users’ restricted information.</p><h3>Your choice controls publication</h3><p>Recommendations do not change a field until you press Apply. You can ignore them, override them, or publish with your current choices. The assistant cannot grant access or make someone a follower. Your saved privacy choices, signed session and on-chain follower relationship remain the backend’s source of truth.</p><p>No profile content is sent to an external AI provider. Detection can miss sensitive information or flag harmless text.</p><Button onClick={onClose}>Close explanation</Button></AssistantModal>;
}
export default function Settings(){
  const {enabled,preference}=usePrivacyAssistant(),{busy}=useAuth();
  const [consent,setConsent]=useState(false),[learn,setLearn]=useState(false);
  return <div className="page-wrap assistant-settings"><h1>Settings</h1><section className="editor-card"><h2>Privacy Assistant</h2><p><strong>{enabled?'ON':'OFF'}</strong> · Optional feature · Local privacy analysis</p><p>When enabled, the assistant can suggest whether fields you select should be Public, Followers only or Private.</p><h3>What it can access</h3><ul><li>Only profile fields you choose to analyze</li><li>Field type and current visibility setting</li></ul><h3>What it cannot access</h3><ul><li>Wallet private keys, seed or recovery phrases</li><li>DMs, authentication tokens or encryption keys</li><li>Other users’ private information or unselected fields</li></ul><div className="assistant-actions"><Button variant="secondary" onClick={()=>setLearn(true)}>Learn how it works</Button><Button role="switch" aria-checked={enabled} aria-label={`Privacy Assistant ${enabled?'ON':'OFF'}`} disabled={busy} onClick={()=>enabled?preference.disable():setConsent(true)}>{enabled?'Disable Privacy Assistant':'Enable Privacy Assistant'}</Button></div>{!preference.persistent&&<p role="status">This browser could not persist your preference. It may reset to OFF after reload.</p>}<p>Every new wallet starts OFF in this browser. Connecting a wallet does not enable analysis. <Link to="/edit-profile">Edit your profile →</Link></p></section>{consent&&<AssistantModal title="Enable Privacy Assistant?" onClose={()=>setConsent(false)}><p>The assistant reviews only the profile fields you choose and suggests a safer visibility level.</p><p>It may use selected field content, field type and current visibility.</p><p>It never receives wallet keys, recovery phrases, tokens, encryption keys, DMs or other users’ restricted data. No profile content is sent to an external AI provider.</p><p>The assistant does not control profile access. Your saved choices and authenticated backend authorization remain the source of truth.</p><div className="assistant-actions"><Button onClick={()=>{preference.enableWithConsent(true);setConsent(false);}}>Enable</Button><Button variant="secondary" onClick={()=>setConsent(false)}>Not now</Button></div></AssistantModal>}{learn&&<AssistantExplanation onClose={()=>setLearn(false)}/>}</div>;
}
