import { IdentityClient, el, shortAddress, renderProfile, friendlyError } from './lib/client.js';
const client = new IdentityClient(), $ = id => document.getElementById(id);
$('main-app').href = `${location.protocol}//${location.hostname}:8000`;
let current = '', busy = false;
function error(text = '') { $('error').textContent = text; $('error').hidden = !text; }
async function run(action) {
  if (busy) return; busy = true; error();
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); } catch (e) { error(friendlyError(e)); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
async function load(value) {
  $('result').hidden = true; $('profile').replaceChildren();
  const profile = await client.profile(value); current = profile.owner; $('lookup').value = profile.did;
  renderProfile($('profile'), profile); $('cid').textContent = 'IPFS content pointer: ' + profile.cid;
  $('result').hidden = false;
}
client.addEventListener('change', () => {
  $('profile').replaceChildren(); $('result').hidden = true;
  $('wallet').textContent = client.address ? 'Signed in as ' + client.kind + ' · ' + shortAddress(client.address) : 'Viewing as a public visitor';
  $('disconnect').hidden = !client.address;
});
$('lookup-form').onsubmit = e => { e.preventDefault(); run(() => load($('lookup').value)); };
$('import-file').onchange = () => run(async () => {
  const file = $('import-file').files[0]; if (!file) return;
  if (file.size > 10000) throw new Error('This file is too large for an identity reference.');
  let reference;
  try { reference = JSON.parse(await file.text()); } catch { throw new Error('Choose a valid exported identity JSON file.'); }
  await load(client.import(reference)); $('import-file').value = '';
});
$('connect').onclick = () => run(async () => { await client.connectWallet(); if (current) await load(current); });
$('connect-demo').onclick = () => run(async () => { await client.connectDev(Number($('dev-wallet').value)); if (current) await load(current); });
$('disconnect').onclick = () => run(async () => { await client.disconnect(); if (current) await load(current); });
run(async () => {
  const config = await client.init();
  $('network').textContent = config.networkName + ' · Chain ' + config.chainId + (config.mode === 'local' ? ' · Fake tokens only' : '');
  if (config.mode === 'local') {
    $('dev-wallet').hidden = false; $('connect-demo').hidden = false;
    for (let i = 0; i < client.devWallets.length; i++) { const option = el('option', client.devWallets[i].label); option.value = i; $('dev-wallet').append(option); }
  }
  const requested = new URLSearchParams(location.search).get('did'); if (requested) await load(requested);
});
