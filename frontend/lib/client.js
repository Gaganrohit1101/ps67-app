import { BrowserProvider, JsonRpcProvider, Wallet, NonceManager, Contract } from 'ethers';
import { API_BASE } from '../config.js';

export class IdentityClient extends EventTarget {
  config = null; signer = null; address = ''; token = ''; kind = ''; devWallets = [];
  async api(route, data, authenticated = true) {
    const sentToken = this.token;
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated && this.token) headers.Authorization = 'Bearer ' + this.token;
    let response;
    try { response = await fetch(API_BASE + route, { method: data === undefined ? 'GET' : 'POST',
      headers, body: data === undefined ? undefined : JSON.stringify(data), cache: 'no-store' }); }
    catch { throw new Error('The profile service is unavailable. Start the local services and retry.'); }
    const result = await response.json();
    if (authenticated && sentToken !== this.token) throw new Error('Wallet changed. Sign in again.');
    if (!response.ok) throw new Error(result.error || result.ipfsError || result.chainError || 'The service is not ready. Check the connection status.');
    return result;
  }
  async init() {
    this.config = await this.api('/config');
    if (this.config.mode === 'local') this.devWallets = (await this.api('/dev-wallets')).wallets;
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        const newAddress = accounts?.[0] || '';
        if (!newAddress || (this.address && newAddress.toLowerCase() !== this.address.toLowerCase())) {
          this.disconnect();
        }
      });
      window.ethereum.on('chainChanged', () => this.disconnect());
    }
    return this.config;
  }
  async connectDev(index) {
    if (this.config.mode !== 'local' || this.config.chainId !== 31337) throw new Error('Local wallets are disabled on testnets.');
    await this.disconnect();
    const account = this.devWallets[index];
    if (!account) throw new Error('Choose a local demo wallet.');
    this.signer = new NonceManager(new Wallet(account.privateKey, new JsonRpcProvider(this.config.rpcUrl)));
    this.kind = account.label + ' (local)';
    await this.signIn();
  }
  async connectWallet() {
    if (!window.ethereum) throw new Error('Install MetaMask to connect a wallet, or use a local demo wallet.');
    await this.disconnect();
    await window.ethereum.request({method:'eth_requestAccounts'});
    await this.ensureWalletNetwork(window.ethereum);
    const provider = new BrowserProvider(window.ethereum);
    this.signer = await provider.getSigner(); this.kind = 'MetaMask';
    await this.signIn();
  }
  async ensureWalletNetwork(ethereum) {
    const expected = Number(this.config.chainId);
    const current = await ethereum.request({ method: 'eth_chainId' });
    if (Number(current) !== expected) {
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + expected.toString(16) }] });
      } catch (error) {
        if (error.code === 4902) throw new Error('Enable Ethereum Sepolia in MetaMask, then reconnect.');
        throw error;
      }
    }
    const actual = await ethereum.request({ method: 'eth_chainId' });
    if (Number(actual) !== expected) throw new Error('The wallet has not switched networks yet. Approve the network switch in MetaMask, then reconnect.');
  }
  async signIn() {
    const signingWallet = this.signer;
    try {
      this.address = await signingWallet.getAddress();
      const challenge = await this.api('/auth/challenge', { address: this.address }, false);
      const signature = await signingWallet.signMessage(challenge.message);
      const session = await this.api('/auth/session', { nonce: challenge.nonce, signature }, false);
      if (this.signer !== signingWallet) throw new Error('The wallet changed during sign-in. Please connect again.');
      this.token = session.token;
      this.dispatchEvent(new Event('change'));
    } catch (error) { this.clear(); throw error; }
  }
  clear() { this.signer = null; this.address = ''; this.token = ''; this.kind = ''; this.dispatchEvent(new Event('change')); }
  async disconnect() {
    if (this.token) { try { await this.api('/auth/logout', {}); } catch {} }
    this.clear();
  }
  contract() {
    if (!this.signer || !this.token) throw new Error('Connect a wallet first.');
    return new Contract(this.config.contractAddress, this.config.abi, this.signer);
  }
  resolve(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('did:')) {
      const match = /^did:pkh:eip155:(\d+):(0x[a-fA-F0-9]{40})$/.exec(trimmed);
      if (!match || Number(match[1]) !== this.config.chainId) throw new Error('This DID belongs to another network or is invalid.');
      return match[2];
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) throw new Error('Enter a wallet address or a did:pkh identity.');
    return trimmed;
  }
  profile(value) { return this.api('/profiles/' + this.resolve(value)); }
  async transaction(make, report) {
    report({ state: 'pending', message: 'Waiting for your wallet…' });
    try {
      const tx = await make();
      report({ state: 'pending', message: 'Transaction submitted. Waiting for confirmation…', hash: tx.hash });
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Transaction failed on the chain.');
      report({ state: 'confirmed', message: 'Confirmed on the chain.', hash: tx.hash, block: receipt.blockNumber });
      return receipt;
    } catch (error) {
      report({ state: 'failed', message: friendlyError(error) });
      throw error;
    }
  }
  async save(fields, posts, report) {
    if (!this.token) throw new Error('Connect a wallet before saving.');
    report({ state: 'pending', message: 'Encrypting restricted fields and pinning your profile to IPFS…' });
    try {
      const staged = await this.api('/profiles', { fields, posts });
      await this.transaction(() => this.contract().setProfile(staged.cid), report);
      return this.profile(this.address);
    } catch (error) { report({ state: 'failed', message: friendlyError(error) }); throw error; }
  }
  async follow(owner, alreadyFollowing, report) {
    const target = this.resolve(owner);
    await this.transaction(() => alreadyFollowing ? this.contract().unfollow(target) : this.contract().follow(target), report);
    return this.profile(target);
  }
  export(profile) {
    return { schemaVersion: 1, did: profile.did, chainId: this.config.chainId, contractAddress: this.config.contractAddress };
  }
  import(reference) {
    if (reference.schemaVersion !== 1 || reference.chainId !== this.config.chainId ||
      typeof reference.contractAddress !== 'string' || reference.contractAddress.toLowerCase() !== this.config.contractAddress.toLowerCase())
      throw new Error('This reference uses another schema, network or contract.');
    return this.resolve(reference.did);
  }
}

export function friendlyError(error) {
  if (error.code === 'ACTION_REJECTED' || error.code === 4001) return 'The wallet request was cancelled. Your on-chain profile was not changed.';
  const msg = error.shortMessage || error.message || '';
  if (msg.includes('has not created') || msg.includes('No profile exists') || msg.includes('PROFILE_NOT_FOUND')) return 'No profile exists for this wallet yet.';
  if (msg.includes('Wallet changed') || msg.includes('Session expired') || msg.includes('SESSION_EXPIRED') || msg.includes('Connect and sign in') || msg.includes('401')) return 'Wallet changed. Sign in again.';
  if (msg.includes('decentralized storage') || msg.includes('IPFS') || msg.includes('CID')) return 'Profile content could not be retrieved.';
  if (msg.includes('Switch MetaMask') || msg.includes('wrong network') || msg.includes('configured chain')) return 'Switch MetaMask to Ethereum Sepolia.';
  if (msg.includes('service is unavailable') || msg.includes('Failed to fetch') || msg.includes('network service unavailable')) return 'Backend temporarily unavailable.';
  return msg || 'Could not load this profile.';
}
export function shortAddress(address) { return address ? address.slice(0, 6) + '…' + address.slice(-4) : ''; }
export function el(tag, text = '', className = '') {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
export const fieldLabels = { displayName: 'Display name', bio: 'About', college: 'College', location: 'Location', email: 'Email', website: 'Website' };
export const visibilityLabels = { public: 'Public', followers: 'Followers only', private: 'Private' };
export function renderProfile(container, profile) {
  container.replaceChildren();
  const name = profile.fields.displayName;
  container.append(el('div', name && !name.locked && name.value ? name.value.slice(0, 1).toUpperCase() : '◎', 'avatar'));
  container.append(el('h2', name && !name.locked && name.value ? name.value : 'Social profile'));
  container.append(el('p', profile.did, 'identity'));
  const stats = el('div', '', 'stats');
  stats.append(el('span', profile.followers.length + ' followers'), el('span', profile.following.length + ' following'));
  container.append(stats, el('p', profile.isOwner ? 'Viewing as owner' : profile.isFollower ? 'Viewing as follower' : 'Viewing public information', 'viewer-state'));
  for (const [name, item] of Object.entries(profile.fields)) {
    const row = el('div', '', 'profile-field');
    const title = el('div', '', 'field-heading');
    title.append(el('strong', fieldLabels[name] || name), el('span', visibilityLabels[item.visibility], 'badge ' + item.visibility));
    row.append(title, el('p', item.locked ? 'Restricted · ' + visibilityLabels[item.visibility] : item.value || 'Not set', item.locked ? 'locked' : ''));
    container.append(row);
  }
  const section = el('section', '', 'posts'); section.append(el('h3', 'Posts'));
  if (!profile.posts.length) section.append(el('p', 'No posts yet.', 'muted'));
  for (const post of profile.posts) {
    const row = el('article', '', 'post');
    row.append(el('span', visibilityLabels[post.visibility], 'badge ' + post.visibility),
      el('p', post.locked ? 'Restricted post' : post.value, post.locked ? 'locked' : ''));
    section.append(row);
  }
  container.append(section);
  if (profile.followers.length) {
    const followers = el('details'); followers.append(el('summary', 'Follower wallets'));
    for (const follower of profile.followers) followers.append(el('p', follower, 'identity'));
    container.append(followers);
  }
}
export function downloadReference(reference) {
  const owner = reference.did.split(':').at(-1);
  const link = el('a');
  link.href = API_BASE + '/identities/' + owner + '/export';
  link.download = 'ps67-identity.json';
  document.body.append(link); link.click(); link.remove();
}
