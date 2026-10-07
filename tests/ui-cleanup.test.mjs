import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {IdentityClient} from '../frontend/lib/client.js';

test('cross-app links honor build settings, runtime LAN overrides and hosted defaults',()=>{
  const source=fs.readFileSync(new URL('../ui/shared/components.tsx',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('export const appURL'),source.indexOf('export const short'));
  function resolve(port,host,env={},runtime={}){
    const code=ts.transpile(fn.replace('export const','const').replaceAll('import.meta.env.VITE_ATLAS_URL',JSON.stringify(env.atlas||'')).replaceAll('import.meta.env.VITE_SOVEREIGN_URL',JSON.stringify(env.sovereign||'')));
    return vm.runInNewContext(code+`;appURL(${port})`,{location:{hostname:host,protocol:host.endsWith('onrender.com')?'https:':'http:'},...runtime});
  }
  assert.equal(resolve(8001,'ps67-sovereign.onrender.com'),'https://ps67-atlas.onrender.com');
  assert.equal(resolve(8000,'ps67-atlas.onrender.com'),'https://ps67-sovereign.onrender.com');
  assert.equal(resolve(8001,'custom.example',{atlas:'https://configured.example'}),'https://configured.example');
  assert.equal(resolve(8001,'10.1.2.3'), 'http://10.1.2.3:8001');
  assert.equal(resolve(8001,'127.0.0.1',{atlas:'https://configured.example'},{__ATLAS_URL__:'http://127.0.0.1:8101'}),'http://127.0.0.1:8101');
});

test('service worker excludes sensitive GET routes even when they look like static files',()=>{
  const listeners={};let intercepted=0;
  vm.runInNewContext(fs.readFileSync(new URL('../ui/sovereign/public/sw.js',import.meta.url),'utf8'),{
    URL,self:{location:{origin:'https://app.example'},addEventListener:(name,fn)=>listeners[name]=fn},
    fetch:()=>Promise.resolve({ok:false}),caches:{},Response,
  });
  for(const path of ['/auth/session.js','/profiles/a.json','/identities/a.js','/dm/messages.js','/config','/health','/rpc']){
    listeners.fetch({request:{url:'https://app.example'+path,method:'GET'},respondWith:()=>intercepted++});
  }
  assert.equal(intercepted,0);
  listeners.fetch({request:{url:'https://app.example/assets/app.js',method:'GET'},respondWith:()=>intercepted++});
  assert.equal(intercepted,1);
});

test('non-JSON service failure becomes a useful UI error',async()=>{
  const original=globalThis.fetch;
  try{globalThis.fetch=async()=>({json:async()=>{throw new SyntaxError('Unexpected token');}});
    await assert.rejects(new IdentityClient().api('/health'),/service returned an invalid response/);
  }finally{globalThis.fetch=original;}
});
