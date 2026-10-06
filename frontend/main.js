import { IdentityClient, el, shortAddress, fieldLabels, renderProfile, downloadReference, friendlyError } from './lib/client.js';
const client = new IdentityClient();
const $ = id => document.getElementById(id);
document.querySelector('a.nav[target="_blank"]').href = `${location.protocol}//${location.hostname}:8001`;
let own = null, other = null, posts = [], busy = false, loaded = false;
for (const [name, label] of Object.entries(fieldLabels)) {
  const row = el('div', '', 'field'); const input = el(name === 'bio' ? 'textarea' : 'input');
  input.id = 'field-' + name; input.maxLength = 2000;
  input.placeholder = ({ displayName: 'What should people call you?', bio: 'Tell your story in a few words', location: 'Your city or region', email: 'you@example.com', website: 'Your portfolio or personal site' })[name];
  if (name === 'bio') input.rows = 3;
  const title = el('label', label); title.htmlFor = input.id;
  const visibility = el('select'); visibility.id = 'visibility-' + name; visibility.setAttribute('aria-label', label + ' visibility');
  for (const [value, text] of [['public', 'Public'], ['followers', 'Followers only'], ['private', 'Private']]) {
    const option = el('option', text); option.value = value; visibility.append(option);
  }
  visibility.value = name === 'email' ? 'private' : name === 'location' ? 'followers' : 'public';
  const inputs = el('div', '', 'field-inputs'); inputs.append(input, visibility); row.append(title, inputs); $('fields').append(row);
}
function message(text = '') { $('message').textContent = text; $('message').hidden = !text; }
function txStatus(container, status) {
  container.replaceChildren(el('span', status.state, 'tx-state ' + status.state), el('p', status.message));
  if (status.hash) {
    const hash = el(client.config.explorer ? 'a' : 'p', status.hash, 'tx-hash');
    if (client.config.explorer) { hash.href = client.config.explorer + '/tx/' + status.hash; hash.target = '_blank'; hash.rel = 'noopener'; }
    container.append(hash);
  }
  if (status.block !== undefined) container.append(el('p', 'Block ' + status.block));
}
function updateButtons() {
  $('save').disabled = busy || !client.address || !loaded;
  $('connect').disabled = busy || !loaded; $('connect-demo').disabled = busy || !loaded;
  $('disconnect').disabled = busy; $('follow').disabled = busy || !client.address;
  $('export').disabled = !own || busy;
}
async function run(action) {
  if (busy) return;
  busy = true; message(); updateButtons();
  try { await action(); } catch (error) { message(friendlyError(error)); }
  finally { busy = false; updateButtons(); }
}
function switchTab(explore) {
  $('profile-workspace').hidden = explore; $('explore-workspace').hidden = !explore;
  $('nav-profile').classList.toggle('active', !explore); $('nav-explore').classList.toggle('active', explore);
}
$('nav-profile').onclick = () => switchTab(false);
$('nav-explore').onclick = () => { switchTab(true); run(discover); };
function emptyOwn() {
  $('own-profile').replaceChildren(); const node = el('div', '', 'empty');
  node.append(el('div', '◎', 'empty-icon'), el('h3', 'Your identity starts here'), el('p', client.address ? 'Fill in your profile and save it to create your identity.' : 'Connect a wallet, fill in your profile, then save.'));
  $('own-profile').append(node);
}
async function refreshOwn() {
  own = null; posts = []; $('post-text').value = '';
  for (const name of Object.keys(fieldLabels)) $('field-' + name).value = '';
  if (!client.address) { emptyOwn(); updateButtons(); return; }
  try { own = await client.profile(client.address); }
  catch (error) { if (!error.message.includes('has not created')) throw error; }
  if (!own) emptyOwn();
  else {
    for (const [name, item] of Object.entries(own.fields)) { $('field-' + name).value = item.value || ''; $('visibility-' + name).value = item.visibility; }
    posts = own.posts.map(({ id, createdAt, visibility, value }) => ({ id, createdAt, visibility, value }));
    renderProfile($('own-profile'), own);
  }
  updateButtons();
}
function clearViews() {
  own = null; other = null; posts = [];
  for (const name of Object.keys(fieldLabels)) $('field-' + name).value = '';
  $('post-text').value = ''; $('other-profile').replaceChildren(); $('explore-result').hidden = true;
  $('transaction').replaceChildren(el('p', 'Your next transaction will appear here.', 'muted')); emptyOwn();
}
client.addEventListener('change', () => {
  $('wallet-label').textContent = client.address ? client.kind + ' · ' + shortAddress(client.address) : 'Not connected';
  $('disconnect').hidden = !client.address;
  // Clear all previously decrypted values immediately on account or network changes.
  clearViews(); updateButtons();
});
$('connect').onclick = () => run(async () => { await client.connectWallet(); await refreshOwn(); });
$('connect-demo').onclick = () => run(async () => { await client.connectDev(Number($('dev-wallet').value)); await refreshOwn(); });
$('disconnect').onclick = () => run(() => client.disconnect());
$('profile-form').onsubmit = event => { event.preventDefault(); run(async () => {
  const fields = {};
  for (const name of Object.keys(fieldLabels)) fields[name] = { value: $('field-' + name).value.trim(), visibility: $('visibility-' + name).value };
  if (!fields.displayName.value) throw new Error('Add a display name before saving.');
  const nextPosts = [...posts];
  if ($('post-text').value.trim()) nextPosts.push({ value: $('post-text').value.trim(), visibility: $('post-visibility').value });
  own = await client.save(fields, nextPosts, status => txStatus($('transaction'), status));
  await refreshOwn();
}); };
$('export').onclick = () => own && downloadReference(client.export(own));
$('export-explore').onclick = () => other && downloadReference(client.export(other));
async function discover() {
  const result = await client.api('/profiles'); $('people').replaceChildren();
  if (!result.profiles.length) { $('people').append(el('p', 'No profiles yet. Create the first one using My profile.', 'muted')); return; }
  for (const profile of result.profiles) {
    const account = client.devWallets.find(w => w.address.toLowerCase() === profile.owner.toLowerCase());
    const button = el('button', (account ? account.label + ' · ' : '') + shortAddress(profile.owner), 'person');
    button.onclick = () => run(() => openProfile(profile.owner)); $('people').append(button);
  }
}
async function openProfile(value) {
  other = null; $('explore-result').hidden = true; $('other-profile').replaceChildren();
  other = await client.profile(value); $('lookup').value = other.owner;
  renderProfile($('other-profile'), other); $('explore-result').hidden = false;
  $('follow').hidden = !client.address || other.isOwner;
  $('follow').textContent = other.isFollower ? 'Unfollow' : 'Follow';
  $('follow-transaction').replaceChildren();
}
$('lookup-form').onsubmit = event => { event.preventDefault(); run(() => openProfile($('lookup').value)); };
$('follow').onclick = () => run(async () => {
  if (!other) return;
  const value = other.owner;
  other = await client.follow(value, other.isFollower, status => txStatus($('follow-transaction'), status));
  renderProfile($('other-profile'), other); $('follow').textContent = other.isFollower ? 'Unfollow' : 'Follow';
});
async function init() {
  try {
    const config = await client.init(); loaded = true;
    $('network').textContent = config.networkName + ' · Chain ' + config.chainId;
    if (config.mode === 'local') {
      $('local-note').hidden = false; $('dev-wallet').hidden = false; $('connect-demo').hidden = false;
      for (let i = 0; i < client.devWallets.length; i++) { const option = el('option', client.devWallets[i].label); option.value = i; $('dev-wallet').append(option); }
    }
    const health = await client.api('/health');
    $('service-status').textContent = health.ok ? '● Blockchain connected   ·   ● IPFS storage ready' : 'Services are starting…';
  } catch (error) {
    $('service-status').textContent = friendlyError(error); $('service-status').classList.add('unready');
    const retry = el('button', 'Retry connection', 'text-button'); retry.onclick = () => location.reload(); $('service-status').append(' ', retry);
  }
  updateButtons();
}
init();
