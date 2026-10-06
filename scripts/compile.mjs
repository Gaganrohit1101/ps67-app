import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function compile() {
  const source = fs.readFileSync(path.join(root, 'contracts/SocialIdentity.sol'), 'utf8');
  const input = { language: 'Solidity', sources: { 'SocialIdentity.sol': { content: source } },
    settings: { evmVersion: 'shanghai', optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  const artifact = output.contracts['SocialIdentity.sol'].SocialIdentity;
  const result = { abi: artifact.abi, bytecode: '0x' + artifact.evm.bytecode.object,
    deployedBytecode: '0x' + artifact.evm.deployedBytecode.object, compiler: solc.version() };
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build/SocialIdentity.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(root, 'build/solidity-input.json'), JSON.stringify(input, null, 2));
  fs.writeFileSync(path.join(root, 'backend/abi.json'), JSON.stringify(result.abi, null, 2));
  for (const dir of ['frontend', 'viewer']) {
    fs.mkdirSync(path.join(root, dir, 'vendor'), { recursive: true });
    fs.copyFileSync(path.join(root, 'node_modules/ethers/dist/ethers.min.js'), path.join(root, dir, 'vendor/ethers.js'));
  }
  if (fs.existsSync(path.join(root, 'frontend/lib/client.js'))) {
    fs.mkdirSync(path.join(root, 'viewer/lib'), { recursive: true });
    fs.copyFileSync(path.join(root, 'frontend/lib/client.js'), path.join(root, 'viewer/lib/client.js'));
  }
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { compile(); console.log('Contract compiled; ABI and browser dependencies synchronized.'); }
