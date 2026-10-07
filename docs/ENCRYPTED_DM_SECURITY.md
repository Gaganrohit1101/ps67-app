# Encrypted DM prototype — PS67

This optional hackathon feature is disabled by default (`ENABLE_ENCRYPTED_DM=true` opts in). It is a browser-encrypted, off-chain mailbox, **not an audited or production-grade end-to-end messaging system**. No deployed contract or production deployment configuration is changed. Sovereign has the messaging screen; Atlas keeps its independent profile authentication and has no messaging UI.

## Architecture review and decision

MetaMask signs identity challenges and messaging certificates. It does not supply encryption secrets. Its deprecated `eth_getEncryptionPublicKey` / `eth_decrypt` methods are not used. Deriving a secret directly from a wallet signature would be unsafe because signatures can become public. Instead, each browser generates a separate P-256 ECDH key pair with the standard Web Crypto API. The wallet signs the public key binding; recipients verify that signature themselves.

Flow: wallet-signed session → browser encryption → signed ciphertext envelope → Flask authorization → SQLite ciphertext → participant's browser verifies and decrypts.

Product decision: **mutual follow** is required to send or fetch conversation ciphertext, and to look up a peer's messaging key. Both wallets must have enabled messages. Existing one-way profile-follow behavior is unchanged. A participant can still see their own conversation index (peer wallet and last timestamp) after unfollowing, but cannot fetch its messages. Refollowing restores history access. Unfollow cannot revoke messages or keys already downloaded.

## Threat model

Protected against: unauthenticated requests; a wallet claiming to be another sender; forged follower flags; a nonparticipant attempting to retrieve another pair's history; passive disclosure of the DM database; ciphertext modification; a key directory substituting an unsigned public key when the browser code is honest.

Trusted: authentic frontend code and dependencies, a safe browser/device, wallet signature verification, and correct RPC/contract responses. The backend enforces follower access but has no messaging private keys. A compromised server can deliver malicious JavaScript, censor history, observe metadata, or lie about authorization. XSS, malicious extensions, endpoint compromise, recipients copying messages, and an attacker controlling the running frontend are outside the protection provided here. There is no claim of protection against an actively malicious application operator.

## Encryption design

- Browser `crypto.subtle`: P-256 ECDH derives a shared 256-bit secret; HKDF-SHA-256 derives a distinct AES-256-GCM key per message using a random 32-byte salt. Each message also has a random 12-byte GCM IV and a 128-bit authentication tag.
- Random 16-byte hexadecimal message ID. AES additional authenticated data and HKDF info bind context, ID, sender, recipient, and both public-key fingerprints.
- Context is `ps67-dm-v1|chainId|lowercaseContractAddress|AUTH_ORIGIN`. Context prevents accidental cross-deployment/network reuse. Keep the origin stable; it is not a secret.
- Key certificate signed via EIP-191 `signMessage`: compact JSON array `["PS67 DM key v1", context, lowercaseWallet, base64PublicKey]`.
- Message signature: compact JSON array `["PS67 DM message v1", context, id, sender, recipient, senderKey, recipientKey, salt, iv, ciphertext]`. Every message is wallet-signed **after encryption**. This proves sender possession of the wallet key; knowledge of the shared ECDH secret alone is insufficient to impersonate the sender.
- AES AAD / HKDF info: UTF-8 compact JSON array `["PS67 DM ciphertext v1", context, id, sender, recipient, senderKey, recipientKey]`.
- P-256 public keys are 65-byte uncompressed raw points, standard padded base64. Fingerprints are lowercase SHA-256 hex of raw public keys. All wallet addresses in envelopes are lowercase. UTF-8 message limit: 4096 bytes. Ciphertext includes the appended GCM tag. Server timestamps are display metadata, not sender-authenticated time.

These are standard cryptographic primitives, but this custom composition has not had an independent protocol audit. Do not reuse it as a production messaging protocol.

## Key management

Private ECDH keys are generated with `extractable: false` and stored by IndexedDB structured cloning, indexed by context and wallet. They are separate from Ethereum signing keys. No wallet seed, private wallet key, or MetaMask key export is requested. No private messaging key is transmitted to Flask or committed to Git. Temporary symmetric keys and plaintext exist only in browser memory in the supplied client.

One public key is registered per wallet/context. Replacement is deliberately disabled to avoid silently losing access or changing a correspondent's key. Losing browser data, using a different browser/profile, changing frontend origin, or losing the device can make history permanently unreadable. There is no key backup, multi-device sync, reset, or recovery flow. Reopening on the original browser can use the persisted key after a fresh signed login.

**Non-extractable does not mean hardware-protected or locked to MetaMask.** Same-origin JavaScript can use a stored key even if it cannot export it. Browser profiles are the device trust boundary. Multiple real people must not share one browser profile. Logout/account changes unmount the conversation UI and remove its visible plaintext; they do not erase IndexedDB or reliably wipe JavaScript heap memory. Fake local demo wallets remain part of the existing development mode only and must never receive real funds.

## What Ethereum stores

Only the existing SocialIdentity profile pointers and follower relationships. Messaging reads the existing `isFollowing` mappings. No DM plaintext, ciphertext, message hash, key registration, or message event is written to Ethereum. Signing a key certificate or envelope is an off-chain wallet signature, not a transaction and uses no gas.

## What off-chain storage stores

`DATA_DIR/dm.sqlite3` contains public key certificates, public-key fingerprints, signed encrypted envelopes, sender/recipient wallet addresses, context, message IDs, and server timestamps. It stores neither plaintext previews nor DM decryption keys. DMs use private off-chain SQLite rather than public IPFS; the existing profile IPFS path is unchanged. The existing profile gateway encryption key is separate and cannot decrypt these DMs.

Metadata is visible to the server/database operator: participants, message lengths, timing and frequency. A conversation returns only the latest 100 messages; the index lists at most 50 peers. This is a bounded prototype UI, not automatic deletion. SQLite keeps older records. No attachments, read receipts, search, or notifications.

## Authorization model

- Existing single-use wallet challenge/session flow is reused. The server derives the wallet from its validated, unexpired bearer session. The browser does not persist the session.
- Every DM endpoint validates the session and chain configuration. Both follower reads use one current block number. RPC/chain failure denies access; there is no client-role fallback.
- Conversation retrieval always binds one participant to the authenticated wallet. A requested wallet is only its peer, never an arbitrary sender filter. Database queries require exactly that pair. The conversation index filters by authenticated participant.
- Sender fields must match the session wallet. Unknown request fields (including `role`, `isFollower`, and plaintext) are rejected. The backend verifies the envelope signature and registered key fingerprints. Duplicate IDs are rejected in the deployment context.
- Public-key enrollment verifies a valid P-256 point and a wallet signature for that wallet/context. The browser verifies both key certificates and message sender signatures before decryption, and rejects GCM authentication failures.
- DM responses set `Cache-Control: no-store`. Application code never logs message content or whole request bodies. Ordinary access logs include routes, wallet addresses and HTTP status only. Do not enable body/debug logging in proxies or services.

## Known limitations / why a prototype

- Static ECDH: **no forward secrecy or post-compromise security**. A compromised device key can expose retained ciphertext from its conversations.
- No independent cryptography audit, key transparency, safety-number comparison UI, hardware-bound key storage, recovery, multi-device support, rate limiting, spam controls, storage quotas, or mature lifecycle controls.
- HTTPS is required on non-loopback origins. Ordinary `http://LAN-IP` cannot safely provide Web Crypto/session confidentiality; the messaging UI rejects it. Existing LAN profile behavior is untouched. Local rehearsal uses loopback HTTP, which browsers treat as a secure context. Do not disable browser security to enable LAN messaging.
- Follower checks are point-in-time authorization, not cryptographic revocation. A concurrent unfollow after the checked block cannot retract a response already authorized; chain reorgs/faulty RPCs are not mitigated with finality waits.
- Backend storage or RPC failure denies requests. The server can omit/reorder/replay valid history; message signatures authenticate contents and participants, not completeness or server timestamps.
- A malicious client could deliberately submit base64-encoded plaintext disguised as ciphertext. A server without the decryption key cannot prove arbitrary bytes were encrypted. Structural/signature validation is enforced, while the provided browser client is tested to encrypt before upload.
- Bearer-session theft may expose ciphertext and metadata or allow denial-of-service. Signing new messages still requires the sender wallet. XSS or device compromise may also reach plaintext and usable device keys.
- Signature prompts on every message are intentional and less convenient than a mature delegated signing protocol. Rejection stores no message. A dropped connection after upload can leave a stored message even if acknowledgement is lost; refresh before retrying.
- No Sepolia/real MetaMask DM verification is claimed by automated local tests. Existing Sepolia deployment stays untouched.

## Local rehearsal and tests

Use this branch's checkout only. Install the existing project dependencies and Python requirements as described in the README. With an IPFS daemon already running on loopback port 5001:

```powershell
# If this checkout has no virtual environment, point to your existing one:
$env:PYTHON_BIN = 'C:\absolute\path\to\python.exe'
npm run dev:dm
```

This separate launcher uses Sovereign `http://127.0.0.1:8100/messages`, Atlas `http://127.0.0.1:8101`, API `http://127.0.0.1:5100`, and fake local chain port 9545. It ignores dotenv loading, binds loopback only, and uses `.data/dm-local`. It does not use a real wallet or deploy to Sepolia. Existing launch commands remain unchanged; ordinary launches have DMs disabled unless explicitly enabled. Generated databases, keys and fake wallet files stay under ignored `.data/`.

In another PowerShell in this checkout:

```powershell
$env:PYTHON_BIN = 'C:\absolute\path\to\python.exe'
$env:PS67_TEST_API = 'http://127.0.0.1:5100'
$env:VITE_API_BASE = $env:PS67_TEST_API
npm run test:all
```

The suite runs TypeScript, both frontend builds, existing contract/client/privacy/integration tests, browser-crypto primitive tests in Node Web Crypto, signed-session DM API tests, and a live local-chain DM integration test. The live DM integration is explicitly skipped when connected to a legacy API with the feature disabled; a full DM verification must use the enabled rehearsal server.

Manual demo: create profiles for two local wallets → follow each other in both directions → enable messaging on each wallet's browser → open peer address → encrypt and sign message → recipient opens conversation → refresh/reload and authenticate again to check persisted keys → switch to third wallet and confirm no history → unfollow and confirm fetch/send denied. Use separate browser profiles for a real two-person demo. Never use development keys on Sepolia.

## Future production improvements

Use an independently audited protocol/library with authenticated prekeys, a ratchet and forward secrecy; audit web delivery and dependencies; add key transparency and explicit key-change verification; design safe backup/recovery and multi-device enrollment; harden session/device binding, CSP and XSS prevention; use TLS everywhere; add quotas, abuse controls, migration/backups, reliable delivery pagination and data-retention policies. Review all controls with an independent security specialist before offering sensitive messaging.

## Implementation verification (2026-10-07)

`npm run test:all` passed: 9 Node tests, 6 existing/default-off gateway tests, 7 DM API tests, 2 existing live profile tests, plus the live DM integration scenario. Both React builds and TypeScript passed. Ganache used its JavaScript fallback because the bundled Node version lacked a matching optional native uWS binary; the tests still completed. Vite reported its bundle-size advisory.

Local browser rehearsal verified key enrollment, Alice-to-Bob encrypted send/decrypt, message history after page reload and fresh login, persisted IndexedDB keys, and removal of conversation plaintext on wallet switching. Tests use fake local wallets, not the user's Chrome MetaMask accounts. The browser test plaintext marker was absent from SQLite bytes and the server access log. This is functional evidence, not a security audit or proof of production E2EE.

Integration risk is limited by the default-off flag, separate SQLite tables/module, unchanged contract and profile authorization, and unchanged production settings. Remaining deployment risks include secure-origin requirements, persistent database storage, browser-bound unrecoverable keys, and the application's existing web/session security. Public deployment and real MetaMask/Sepolia messaging remain unverified.

Files changed: `backend/dm.py`, `backend/identity.py`; `ui/shared/dm-crypto.mjs`; `ui/sovereign/Messages.tsx`, `messages.css`, `main.tsx`; `scripts/dm-dev.mjs`, `scripts/test.mjs`, `package.json`; `tests/dm-crypto.test.mjs`, `dm_api.py`, `dm-live.mjs`, `privacy.py`, `integration.py`; `README.md` and this document. No dependencies were added.

## Design references

- [MetaMask encryption API deprecation](https://metamask.io/en-GB/news/metamask-api-method-deprecation)
- [Web Crypto generateKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey)
- [Web Crypto ECDH / HKDF deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)
- [Web Crypto and CryptoKey storage](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
