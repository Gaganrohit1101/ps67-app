// Isolated local feature rehearsal; no production configuration or dotenv loading.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ganache from 'ganache';
import {JsonRpcProvider,Wallet,ContractFactory} from 'ethers';
import {compile} from './compile.mjs';
import {buildUI} from './build-ui.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chain=ganache.server({chain:{chainId:31337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:5},logging:{quiet:true}});
let backend,stopping=false;const servers=[];
async function stop(code=0){if(stopping)return;stopping=true;backend?.kill();for(const s of servers)s.close();await chain.close();process.exit(code);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
try{
  const artifact=compile();
  process.env.VITE_API_BASE='http://127.0.0.1:5200';
  await buildUI();await chain.listen(9645,'127.0.0.1');
  const accounts=Object.entries(chain.provider.getInitialAccounts()).map(([address,a],i)=>({label:['Alice','Bob','Charlie','Dana','Eli'][i],address,privateKey:a.secretKey}));
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,new Wallet(accounts[0].privateKey,new JsonRpcProvider('http://127.0.0.1:9645'))).deploy();
  await contract.waitForDeployment();fs.mkdirSync(path.join(root,'.data'),{recursive:true});fs.writeFileSync(path.join(root,'.data/dev-wallets.json'),JSON.stringify(accounts));
  const python=process.env.PYTHON_BIN||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  backend=spawn(python,['backend/identity.py'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,
    PYTHON_DOTENV_DISABLED:'1',MODE:'local',CHAIN_ID:'31337',RPC_URL:'http://127.0.0.1:9645',PORT:'5200',
    CONTRACT_ADDRESS:await contract.getAddress(),DEPLOYMENT_BLOCK:'0',EXPLORER_URL:'',DATA_DIR:path.join(root,'.data/privacy-local'),
    PUBLIC_HOSTED:'false',BIND_HOST:'127.0.0.1',LAN_SUBNET:'',ALLOWED_HOSTS:'127.0.0.1,localhost',AUTH_ORIGIN:'http://127.0.0.1:5200',
    FRONTEND_ORIGINS:'http://127.0.0.1:8200,http://127.0.0.1:8201',PINATA_JWT:'',IPFS_AUTH:'',IPFS_API:'http://127.0.0.1:5001/api/v0'}});
  backend.on('error',()=>stop(1));backend.on('exit',()=>{if(!stopping)stop(1);});
  for(const [app,port] of [['sovereign',8200],['atlas',8201]]){
    const base=path.join(root,'build',app);
    const server=http.createServer((req,res)=>{
      if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403).end();return;}
      let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
      const file=path.resolve(base,'.'+(path.extname(url)?url:'/index.html'));
      if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
      fs.readFile(file,(err,data)=>{
        if(err){res.writeHead(404).end();return;}
        if(path.extname(file)==='.html')data=data.toString().replace('<head>','<head><script>globalThis.__ATLAS_URL__="http://127.0.0.1:8201";globalThis.__SOVEREIGN_URL__="http://127.0.0.1:8200";</script>');
        res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
      });
    });server.on('error',()=>stop(1));server.listen(port,'127.0.0.1');servers.push(server);
  }
  console.log('Privacy Assistant local rehearsal: http://127.0.0.1:8200/settings | Atlas http://127.0.0.1:8201 | API http://127.0.0.1:5200');
  console.log('Fake wallets only. Reuses existing local IPFS daemon on 5001. Ctrl+C stops these isolated services.');
}catch(error){console.error(error.message);await stop(1);}
