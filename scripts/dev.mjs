import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { compile } from './compile.mjs';
import { networkOptions } from './network.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sepolia = process.argv.includes('--sepolia');
if (sepolia && fs.existsSync(path.join(root, 'backend/.env'))) process.loadEnvFile(path.join(root, 'backend/.env'));
const network = networkOptions();
let deployed = {};
if (sepolia && fs.existsSync(path.join(root, 'deployments/sepolia.json')))
  deployed = JSON.parse(fs.readFileSync(path.join(root, 'deployments/sepolia.json'), 'utf8'));
if (sepolia && !(process.env.CONTRACT_ADDRESS || deployed.contractAddress)) {
  console.error('Deploy first: npm run deploy:sepolia. See SEPOLIA_SETUP.md.');
  process.exit(1);
}
const children = [], servers = [];
let shuttingDown = false;
async function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  for (const server of servers) server.close();
  if (chain) await chain.close();
  process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const ganache = sepolia ? null : (await import('ganache')).default;
const chain = sepolia ? null : ganache.server({ chain: { chainId: 31337, hardfork: 'shanghai' },
  wallet: { deterministic: true, totalAccounts: 5 }, logging: { quiet: true } });
try {
  const artifact = compile();
  // Reuse an existing local IPFS daemon, or start the workspace-scoped binary.
  let ipfsReady = false;
  try { const response = await fetch('http://127.0.0.1:5001/api/v0/id', { method: 'POST', signal: AbortSignal.timeout(1500) }); ipfsReady = response.ok; } catch {}
  const ipfsBinary = process.env.IPFS_BIN || path.join(root, '.data/tools', process.platform === 'win32' ? 'ipfs.exe' : 'ipfs');
  if (!ipfsReady && !process.env.IPFS_API && fs.existsSync(ipfsBinary)) {
    const ipfsEnv = { ...process.env, IPFS_PATH: path.join(root, '.data/ipfs') };
    if (!fs.existsSync(path.join(root, '.data/ipfs/config'))) {
      const init = spawnSync(ipfsBinary, ['init', '--profile=lowpower'], { env: ipfsEnv, windowsHide: true, encoding: 'utf8' });
      if (init.status !== 0) throw new Error('IPFS initialization failed: ' + init.stderr);
    }
    const ipfs = spawn(ipfsBinary, ['daemon'], { env: ipfsEnv, windowsHide: true, stdio: 'inherit' });
    children.push(ipfs);
    for (let attempt = 0; attempt < 30; attempt++) {
      try { const response = await fetch('http://127.0.0.1:5001/api/v0/id', { method: 'POST', signal: AbortSignal.timeout(1000) }); if (response.ok) { ipfsReady = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  let contractAddress = process.env.CONTRACT_ADDRESS || deployed.contractAddress;
  if (!sepolia) {
  await chain.listen(8545, '127.0.0.1');
  const accounts = Object.entries(chain.provider.getInitialAccounts()).map(([address, a], i) =>
    ({ label: ['Alice', 'Bob', 'Charlie', 'Dana', 'Eli'][i], address, privateKey: a.secretKey }));
  const provider = new JsonRpcProvider('http://127.0.0.1:8545');
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, new Wallet(accounts[0].privateKey, provider)).deploy();
  await contract.waitForDeployment();
  fs.mkdirSync(path.join(root, '.data'), { recursive: true });
  fs.writeFileSync(path.join(root, '.data/dev-wallets.json'), JSON.stringify(accounts));
  contractAddress = await contract.getAddress();
  }
  const python = process.env.PYTHON_BIN || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(python)) throw new Error('Set up the Python virtual environment first. See README.');
  const backend = spawn(python, ['backend/identity.py'], { cwd: root, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, MODE: sepolia ? 'testnet' : 'local', CHAIN_ID: sepolia ? '11155111' : '31337',
      RPC_URL: sepolia ? (process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com') : 'http://127.0.0.1:8545',
      CONTRACT_ADDRESS: contractAddress, EXPLORER_URL: sepolia ? 'https://sepolia.etherscan.io' : '',
      DEPLOYMENT_BLOCK: sepolia ? String(process.env.DEPLOYMENT_BLOCK || deployed.blockNumber || 0) : '0',
      DATA_DIR: path.join(root, '.data', sepolia ? 'sepolia' : 'local'),
      BIND_HOST: network.bind, LAN_SUBNET: network.lan ? network.subnet : '',
      ALLOWED_HOSTS: [...network.hosts].join(','), AUTH_ORIGIN: network.origin(5000),
      FRONTEND_ORIGINS: [...network.origins(8000),...network.origins(8001)].join(','),
      IPFS_API: process.env.IPFS_API || 'http://127.0.0.1:5001/api/v0' } });
  children.push(backend);
  backend.on('exit', code => { if (!shuttingDown) { console.error(`Backend exited (${code}).`); stop(); } });
  function serve(dir, port) {
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
    const base = path.join(root, dir);
    const server = http.createServer((req, res) => {
      if (!network.allowed(req,port)) {res.writeHead(403);res.end('Local network access only.');return;}
      let url;
      try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { res.writeHead(400); res.end(); return; }
      const file = path.resolve(base, '.' + (url === '/' ? '/index.html' : url));
      if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, bytes) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(bytes);
      });
    });
    server.listen(port, network.bind); servers.push(server);
  }
  serve('frontend', 8000); serve('viewer', 8001);
  console.log(`\nPS67 ${sepolia ? 'Sepolia' : 'local development'}\nMain app: ${network.origin(8000)}\nSecond app: ${network.origin(8001)}\nAPI: ${network.origin(5000)}\nContract: ${contractAddress}\n${sepolia ? 'Use MetaMask on Ethereum Sepolia in Chrome.' : 'Local chain only. Dev wallets contain fake tokens.'}\nIPFS: ${ipfsReady ? 'ready' : 'start a node on port 5001 before saving profiles'}\nCtrl+C stops the services.`);
} catch (error) { console.error(error.message); await stop(); }
