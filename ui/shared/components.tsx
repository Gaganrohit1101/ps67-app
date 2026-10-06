import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Eye, LockKeyhole, Users, Sun, Moon, Eclipse, Fingerprint } from 'lucide-react';
import { useTheme, type Theme } from './ThemeContext';
import { audienceLabels, type Visibility } from './types';
export const appURL = (port: number) => {
  const meta = typeof import.meta !== 'undefined' ? (import.meta as any) : null;
  if (port === 8001) {
    if (typeof process !== 'undefined' && process.env?.VITE_ATLAS_URL) return process.env.VITE_ATLAS_URL;
    if (meta?.env?.VITE_ATLAS_URL) return meta.env.VITE_ATLAS_URL;
    if ((globalThis as any).__ATLAS_URL__) return (globalThis as any).__ATLAS_URL__;
  }
  if (port === 8000) {
    if (typeof process !== 'undefined' && process.env?.VITE_SOVEREIGN_URL) return process.env.VITE_SOVEREIGN_URL;
    if (meta?.env?.VITE_SOVEREIGN_URL) return meta.env.VITE_SOVEREIGN_URL;
    if ((globalThis as any).__SOVEREIGN_URL__) return (globalThis as any).__SOVEREIGN_URL__;
  }
  return globalThis.location ? `${location.protocol}//${location.hostname}:${port}` : `http://127.0.0.1:${port}`;
};
export const short = (address: string) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
export function Button({children,variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string}) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
export function PrivacyBadge({level}:{level:Visibility}) {
  const Icon={public:Eye,followers:Users,private:LockKeyhole}[level];
  return <span className={`privacy-badge privacy-${level}`}><Icon size={13} aria-hidden="true"/>{audienceLabels[level]}</span>;
}
export function Brand({atlas=false}:{atlas?:boolean}) {
  return <div className="brand"><div className="brand-mark" aria-hidden="true"><span/><span/></div><div><strong>{atlas?'ATLAS':'SOVEREIGN'}</strong><small>INNOBLOCK · {atlas?'Identity Explorer':'Identity, on your terms'}</small></div></div>;
}
export function Avatar({name='',large=false}:{name?:string;large?:boolean}) {
  return <div className={`avatar avatar-${large?'large':'medium'}`} aria-hidden="true">{name.trim()?name.trim().slice(0,2).toUpperCase():<Fingerprint/>}</div>;
}
export function ThemeSwitch() {
  const {theme,setTheme}=useTheme();
  return <div className="theme-switch" role="group" aria-label="Color theme">{([['light',Sun],['dark',Moon],['night',Eclipse]] as const).map(([value,Icon])=><button type="button" key={value} aria-label={`${value[0].toUpperCase()+value.slice(1)} theme`} aria-pressed={theme===value} onClick={()=>setTheme(value as Theme)}><Icon size={17} aria-hidden="true"/></button>)}</div>;
}
export function Empty({title,children}:{title:string;children:ReactNode}) {return <div className="empty-state"><Fingerprint size={32} aria-hidden="true"/><h2>{title}</h2><p>{children}</p></div>;}
