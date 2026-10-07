# PS67 Digital Identity — Known Limitations

## 1. Encrypted Direct Messaging (DM) Persistence

- **End-to-End Confidentiality:** Message payloads are encrypted in the browser prior to transmission using standard Web Crypto primitives:
  - **Key Agreement:** P-256 ECDH
  - **Key Derivation:** HKDF-SHA256 with random 32-byte salts
  - **Encryption:** AES-256-GCM with random 12-byte IVs
- **Zero Plaintext Storage:** The server/backend stores **ciphertext only** in `dm_messages`. No plaintext message content or decryption keys are ever sent to, logged by, or stored on the server.
- **Client-Side Key Isolation:** Private ECDH keys are marked `extractable: false` and kept in browser device storage (IndexedDB). They never leave the user's browser, and MetaMask private keys are never exported or requested.
- **Hackathon Deployment Storage (Option A):** For the prototype and live hackathon demo, ciphertext envelopes and registered public key certificates are stored in SQLite (`DATA_DIR/dm.sqlite3`) on the Render container filesystem.
- **Ephemeral Container Boundary:** On Render's free hosting tier, container filesystems are ephemeral. Message history and registered DM public keys may reset upon container spin-down (inactivity sleep), instance restart, or redeployment.
- **Security Impact:** This container-local persistence limitation affects **message availability only**, **NOT confidentiality**. Messages remain cryptographically secure at all times.
- **Future Production Roadmap:** A full production rollout would migrate ciphertext envelope storage to a durable external managed database (such as PostgreSQL / Neon / Supabase) or decentralized encrypted message relays (such as Waku / XMTP).

## 2. Decentralized Profile Storage (IPFS / Pinata)

- **Production Storage:** Fully decentralized and durable via Pinata IPFS pinning with automated local caching.
- **Field Encryption:** Sensitive fields (`followers`, `private`) are AES-256-GCM encrypted server-side with zero plaintext leakage to IPFS.

## 3. Privacy Assistant

- **Opt-In Advisory:** Operates purely client-side; disabled by default.
- **Non-Bypassing:** All authorization checks remain strictly enforced on-chain via Sepolia and backend signed sessions.
