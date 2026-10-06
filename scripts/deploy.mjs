// Local deployment assistant. MetaMask signs; this server never receives a key.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JsonRpcProvider } from 'ethers';
import { compile } from './compile.mjs';
import { networkOptions } from './network.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, 'backend/.env'))) process.loadEnvFile(path.join(root, 'backend/.env'));
const artifact = compile();
const rpc = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const provider = new JsonRpcProvider(rpc);
const network = networkOptions();
const origin = network.origin(8002);
const token = crypto.randomBytes(32).toString('hex');
const explorer = 'https://sepolia.etherscan.io';
function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  try {
    if (!network.allowed(req,8002))
      return json(res,403,{error:'This page is available only on the configured local network.'});
    const url = new URL(req.url, origin);
    if (url.pathname === '/artifact' && req.method === 'GET') {
      if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('RPC must be Ethereum Sepolia.');
      const previous = path.join(root,'deployments/sepolia.json');
      return json(res,200,{...artifact,chainId:11155111,token,explorer,lan:network.lan,
        deployment:fs.existsSync(previous) ? JSON.parse(fs.readFileSync(previous,'utf8')) : null});
    }
    if (url.pathname === '/confirm' && req.method === 'POST') {
      if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-deployment-token'] !== token)
        return json(res,403,{error:'Open the local deployment page first.'});
      let body='';
      for await (const part of req) { body+=part; if(body.length>1000) return json(res,413,{error:'Request too large.'}); }
      const {hash} = JSON.parse(body);
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash || '')) return json(res,400,{error:'Invalid transaction hash.'});
      if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('RPC must be Ethereum Sepolia.');
      const [receipt,tx] = await Promise.all([provider.getTransactionReceipt(hash),provider.getTransaction(hash)]);
      if (!receipt || receipt.status!==1 || !receipt.contractAddress || !tx || tx.chainId!==11155111n || tx.to || tx.value!==0n || tx.data.toLowerCase()!==artifact.bytecode.toLowerCase())
        return json(res,400,{error:'A confirmed deployment of this exact contract is required.'});
      if ((await provider.getCode(receipt.contractAddress)).toLowerCase() !== artifact.deployedBytecode.toLowerCase())
        return json(res,400,{error:'Deployed code does not match the compiled contract.'});
      const deployment={chainId:11155111,contractAddress:receipt.contractAddress,transactionHash:hash,
        blockNumber:receipt.blockNumber,deployer:tx.from,compiler:artifact.compiler,
        explorer:`${explorer}/tx/${hash}`,recordedAt:new Date().toISOString()};
      fs.mkdirSync(path.join(root,'deployments'),{recursive:true});
      fs.writeFileSync(path.join(root,'deployments/sepolia.json'),JSON.stringify(deployment,null,2)+'\n');
      const envPath=path.join(root,'backend/.env');
      let env=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):fs.readFileSync(path.join(root,'backend/.env.example'),'utf8');
      const values={MODE:'testnet',CHAIN_ID:'11155111',RPC_URL:rpc,CONTRACT_ADDRESS:deployment.contractAddress,
        DEPLOYMENT_BLOCK:String(deployment.blockNumber),EXPLORER_URL:explorer};
      for(const [name,value] of Object.entries(values)) {
        if (/[\r\n]/.test(value)) throw new Error('Invalid configuration value.');
        const pattern=new RegExp('^'+name+'=.*$','m');
        env=pattern.test(env)?env.replace(pattern,()=>`${name}=${value}`):env+`\n${name}=${value}\n`;
      }
      fs.writeFileSync(envPath,env);
      const readmePath=path.join(root,'README.md');
      let readme=fs.readFileSync(readmePath,'utf8');
      const section=`<!-- SEPOLIA_DEPLOYMENT -->\nSepolia contract: [${deployment.contractAddress}](${explorer}/address/${deployment.contractAddress})\n\nConfirmed deployment: [view transaction](${deployment.explorer}), block ${deployment.blockNumber}.\n<!-- /SEPOLIA_DEPLOYMENT -->`;
      readme=readme.replace(/<!-- SEPOLIA_DEPLOYMENT -->[\s\S]*?<!-- \/SEPOLIA_DEPLOYMENT -->/,()=>section);
      fs.writeFileSync(readmePath,readme);
      console.log(`Verified Sepolia deployment: ${deployment.contractAddress}\n${deployment.explorer}`);
      return json(res,200,deployment);
    }
    if (req.method !== 'GET') return json(res,405,{error:'Method not allowed.'});
    const files={'/':'deployment/index.html','/deploy.js':'deployment/deploy.js','/ethers.js':'node_modules/ethers/dist/ethers.min.js'};
    if (!files[url.pathname]) return json(res,404,{error:'Not found.'});
    res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(fs.readFileSync(path.join(root,files[url.pathname])));
  } catch {
    json(res,503,{error:'Cannot verify deployment. Check Sepolia RPC connectivity and retry recording the transaction.'});
  }
});
server.listen(8002,network.bind,()=>console.log(`Open ${origin} in Chrome with MetaMask. Only Sepolia is supported. No wallet key is needed.`));
process.on('SIGINT',()=>{server.close();provider.destroy();process.exit(0);});
