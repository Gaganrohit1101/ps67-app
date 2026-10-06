import { BrowserProvider, ContractFactory, formatEther } from '/ethers.js';
const $=id=>document.getElementById(id);
$('main-url').href=`${location.protocol}//${location.hostname}:8000`;
$('viewer-url').href=`${location.protocol}//${location.hostname}:8001`;
let artifact,signer,busy=false,provider;
function status(text){$('status').textContent=text;}
function controls(){ $('connect').disabled=busy; $('record').disabled=busy||!artifact; $('deploy').disabled=busy||!signer||!artifact; }
async function run(action){busy=true;controls();try{await action();}catch(e){status('Failed: '+(e.shortMessage||e.message));}finally{busy=false;controls();}}
async function record(hash){
  const response=await fetch('/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Deployment-Token':artifact.token},body:JSON.stringify({hash})});
  const data=await response.json(); if(!response.ok) throw new Error(data.error);
  status('Confirmed on Sepolia. Contract address and backend configuration saved.');
  $('result').replaceChildren();
  const p=document.createElement('p');p.textContent='Contract: '+data.contractAddress;
  const a=document.createElement('a');a.href=data.explorer;a.target='_blank';a.rel='noopener';a.textContent='View confirmed Sepolia transaction ↗';
  $('result').append(p,a);
}
$('connect').onclick=()=>run(async()=>{
  if(!window.ethereum) throw new Error('Open this page in Chrome with MetaMask installed.');
  await window.ethereum.request({method:'eth_requestAccounts'});
  await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]});
  provider=new BrowserProvider(window.ethereum);
  if((await provider.getNetwork()).chainId!==11155111n) throw new Error('Select Ethereum Sepolia.');
  signer=await provider.getSigner();
  const owner=await signer.getAddress();
  $('wallet').textContent=owner+' · '+formatEther(await provider.getBalance(owner))+' Sepolia ETH';
  status('Ready. Deploy sends one Sepolia contract creation transaction. Review it in MetaMask.');
});
$('deploy').onclick=()=>run(async()=>{
  if(!signer || (await provider.getNetwork()).chainId!==11155111n) throw new Error('Reconnect on Sepolia.');
  status('Pending: review the deployment in MetaMask.');
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy();
  const tx=contract.deploymentTransaction();$('hash').value=tx.hash;
  status('Pending on Sepolia: '+tx.hash+' — wait for confirmation.');
  const receipt=await tx.wait();if(receipt.status!==1) throw new Error('Deployment reverted.');
  await record(tx.hash);
});
$('record').onclick=()=>run(()=>record($('hash').value.trim()));
if(window.ethereum){for(const event of ['accountsChanged','chainChanged'])window.ethereum.on(event,()=>{signer=null;controls();$('wallet').textContent='Wallet changed. Connect again.';});}
await run(async()=>{
  const response=await fetch('/artifact');const data=await response.json();if(!response.ok)throw new Error(data.error);
  artifact=data;
  $('start-command').textContent=data.lan?'npm run sepolia:lan':'npm run sepolia';
  status('Contract compiled with '+data.compiler+'. Sepolia connection ready.');
  if(data.deployment){$('hash').value=data.deployment.transactionHash;status('An existing deployment is recorded. Verify its transaction below to reuse it.');}
});
