// Separate local rehearsal ports. Does not load backend/.env or deploy to Sepolia.
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
const servers=[];let backend,stopping=false;
async function stop(code=0){if(stopping)return;stopping=true;backend?.kill();for(const s of servers)s.close();await chain.close();process.exit(code);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
try{
  const artifact=compile();
  process.env.VITE_API_BASE='http://127.0.0.1:5100';
  process.env.VITE_ATLAS_URL='http://127.0.0.1:8101';
  process.env.VITE_SOVEREIGN_URL='http://127.0.0.1:8100';
  await buildUI();
  await chain.listen(9545,'127.0.0.1');
  const accounts=Object.entries(chain.provider.getInitialAccounts()).map(([address,a],i)=>({label:['Alice','Bob','Charlie','Dana','Eli'][i],address,privateKey:a.secretKey}));
  const provider=new JsonRpcProvider('http://127.0.0.1:9545');
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,new Wallet(accounts[0].privateKey,provider)).deploy();
  await contract.waitForDeployment();
  fs.mkdirSync(path.join(root,'.data'),{recursive:true});
  fs.writeFileSync(path.join(root,'.data/dev-wallets.json'),JSON.stringify(accounts));
  const python=process.env.PYTHON_BIN||path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  backend=spawn(python,['backend/identity.py'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,
    PYTHON_DOTENV_DISABLED:'1',MODE:'local',CHAIN_ID:'31337',RPC_URL:'http://127.0.0.1:9545',PORT:'5100',
    CONTRACT_ADDRESS:await contract.getAddress(),DEPLOYMENT_BLOCK:'0',EXPLORER_URL:'',
    DATA_DIR:path.join(root,'.data/dm-local'),ENABLE_ENCRYPTED_DM:'true',PUBLIC_HOSTED:'false',
    BIND_HOST:'127.0.0.1',LAN_SUBNET:'',ALLOWED_HOSTS:'127.0.0.1,localhost',AUTH_ORIGIN:'http://127.0.0.1:5100',
    FRONTEND_ORIGINS:'http://127.0.0.1:8100,http://127.0.0.1:8101',IPFS_API:'http://127.0.0.1:5001/api/v0'}});
  backend.on('error',()=>stop(1));backend.on('exit',()=>{if(!stopping)stop(1);});
  for(const [app,port] of [['sovereign',8100],['atlas',8101]]){
    const base=path.join(root,'build',app);
    const server=http.createServer((req,res)=>{
      if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403).end();return;}
      let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
      const file=path.resolve(base,'.'+(path.extname(url)?url:'/index.html'));
      if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
      fs.readFile(file,(err,data)=>{
        if(err){res.writeHead(404).end();return;}
        // Existing appURL supports these runtime overrides; scoped to this local server.
        if(path.extname(file)==='.html')data=data.toString().replace('<head>','<head><script>globalThis.__ATLAS_URL__="http://127.0.0.1:8101";globalThis.__SOVEREIGN_URL__="http://127.0.0.1:8100";</script>');
        res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
      });
    });
    server.on('error',()=>stop(1));server.listen(port,'127.0.0.1');servers.push(server);
  }
  console.log('DM local rehearsal: http://127.0.0.1:8100/messages | Atlas: http://127.0.0.1:8101 | API: http://127.0.0.1:5100');
  console.log('Fake local wallets only. Existing IPFS daemon on 5001 is needed for profile tests. Ctrl+C stops these services.');
}catch(error){console.error(error.message);await stop(1);}
