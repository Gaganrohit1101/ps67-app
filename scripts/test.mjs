import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.PYTHON_BIN||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const nodeTests=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f);
for(const [bin,args] of [
  [process.execPath,['node_modules/typescript/bin/tsc','--noEmit']],
  [process.execPath,['scripts/build-ui.mjs']],
  [process.execPath,['--test',...nodeTests]],
  [python,['tests/privacy.py']],
  [python,['tests/dm_api.py']],
  [python,['tests/integration.py']],
  [process.execPath,['tests/dm-live.mjs']],
]) {
  const result=spawnSync(bin,args,{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.status!==0){console.error(result.error?.message||'Verification stopped at a failed check.');process.exit(result.status||1);}
}
console.log('UI build/types and all existing automated tests passed.');
