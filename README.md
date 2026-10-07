# Sovereign / Atlas - INNOBLOCK 2.0 PS67

A base prototype of a portable social identity: create a DID-linked profile, publish
profile/posts to IPFS, store the profile pointer and follow graph in a Solidity
contract, and load the same identity in two independently served frontends.

**Current stage: local development. No public-testnet deployment or public GitHub
submission has been made.** Local wallets contain fake tokens. Use fresh burner
wallets and public testnets for the hackathon; never fund development wallets with
real assets.

## Base scope

| PS67 requirement | Implementation |
| --- | --- |
| DID + decentralized profile/posts | `did:pkh:eip155:<chainId>:<wallet>`; versioned JSON pinned to a Kubo IPFS node |
| Contract profile pointer + follow graph | `SocialIdentity.sol`: owner-only pointer updates, follow/unfollow, graph reads and events |
| Public / followers-only / private | Per-field/post settings; AES-256-GCM encryption; wallet-authenticated reads with live chain access checks |
| Export + second frontend | Sovereign exports a reference; Atlas validates network/contract and resolves the current profile and followers |

No AI, DMs or privacy-preview feature is included. Finish the base first.

## Start locally (Windows)

Prerequisites: Node.js, Python 3.10+ and Kubo IPFS. The app adapts the starter's
Flask + web3.py and HTML/JavaScript + ethers.js architecture.

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

Initialize an IPFS repo inside this checkout. Run this in a separate terminal;
replace `ipfs` with its full binary path if needed. Skip `init` if already initialized.

If the workspace-scoped binary `.data/tools/ipfs.exe` exists, the launcher initializes
and starts it automatically; skip the separate IPFS commands. You can also supply
an installed binary through `IPFS_BIN`. Generated tools/state are excluded from Git.

```powershell
$env:IPFS_PATH = "$PWD/.data/ipfs"
ipfs init --profile=lowpower
ipfs daemon
```

Start the app services in another terminal:

```powershell
npm run dev
```

- Main app: http://127.0.0.1:8000
- Independent viewer: http://127.0.0.1:8001
- Health: http://127.0.0.1:5000/health
- Local RPC: http://127.0.0.1:8545 (chain ID 31337)

The launcher compiles/deploys to Ganache, writes the ABI, serves both frontends
separately and starts Flask. On restart the local chain resets; IPFS pins and the
privacy key persist. Export fresh references after a restart.

**Use demo wallet** lets you try Alice, Bob and Charlie without MetaMask. These
are known development keys, enabled only on localhost/chain 31337 and disabled in
testnet mode. MetaMask is the testnet path; sign-in and transaction approval are separate.

## Try the complete flow

1. Choose Alice and **Use demo wallet**. Set a public name, followers-only location,
   private email and public post. Save. Check pending/confirmed status and hash/block.
2. Switch to Charlie. Open **Explore people**, then Alice. Only public values load.
3. Switch to Bob, open Alice and **Follow**. Her location becomes available after
   confirmation. Her private email stays restricted.
4. **Export identity**. In Atlas, **Import identity JSON**. The same DID, profile and
   follower wallets load. Sign in as Bob there to read permitted fields.
5. **Unfollow** in Sovereign. Reload Atlas: the location becomes restricted again.
   Previously seen information cannot be erased from a viewer's memory.

## Validation

```powershell
npm run test:contract
npm run test:client
.\.venv\Scripts\python.exe tests/privacy.py
# With npm run dev and IPFS running:
.\.venv\Scripts\python.exe tests/integration.py
```

Contract tests cover pointer ownership, invalid/duplicate/self follows, graph
removal and re-following. Integration checks use real IPFS, inspect raw content
for plaintext leaks, validate signatures/replay protection, and exercise owner,
follower and non-follower reads before/after unfollowing. They leave a sample
Alice profile and Bob follower relationship on the local chain for exploration.

## Architecture and interfaces

```text
Sovereign (8000)       Atlas (8001)
       |                  |
       +-- wallet sign-in +---> Flask privacy gateway (5000)
       |                              | live follower/owner checks
       +-- wallet-signed tx ----------+---> SocialIdentity / EVM chain
                                      |
                                encrypted JSON <-> Kubo / IPFS
```

- On chain: wallet profile pointers and public follow relationships. DID derives
  from chain ID + wallet, not an editable profile string.
- IPFS: public content and encrypted restricted fields/posts. No personal values
  go on chain.
- Gateway: one-time signed challenges, expiring sessions, encryption and current
  contract pointer/privilege checks on every read. Claimed addresses alone grant no access.
- Export: `{schemaVersion: 1, did, chainId, contractAddress}`. No private values;
  resolves the latest pointer rather than copying a local cached profile.
- Both frontends reuse a small client. `npm run compile` syncs the client copy and
  vendored ethers; frontend entrypoints, interfaces and state are separate.

### Prototype privacy boundary

This is **not trustless key management**. The gateway holds `.data/local/privacy.key`
for local demos, or `.data/sepolia/privacy.key` for Sepolia,
and can decrypt restricted content. Owners control writes with their wallets,
but trust this service for confidential reads. Both apps need the same gateway
for restricted fields. Public content remains independently readable through IPFS.

Keep the key/auth state on private persistent storage and back them up. Losing the
key loses restricted content. Use fictional demo data. Metadata and follower edges
are public. Replacing a pointer does not erase old IPFS content. Maintain pins and
an online node; public availability needs additional replication/pinning.
Decentralized access/key management is future work.

## Move to a public testnet after local validation

For other laptops on the same Wi-Fi, use [LAN_SETUP.md](LAN_SETUP.md):
`npm run dev:lan` and `npm run deploy:lan`. After deployment use
`npm run sepolia:lan`. Web services bind to all IPv4 interfaces, with application
access limited to the detected local subnet. The guide includes a scoped Windows
Firewall script and the exact current URLs.

Follow [SEPOLIA_SETUP.md](SEPOLIA_SETUP.md). Run `npm run deploy:sepolia`, open
http://127.0.0.1:8002 in Chrome, connect MetaMask on Sepolia and approve deployment.
The assistant verifies the mined contract bytecode and writes the public receipt to
`deployments/sepolia.json`, the contract address/block/RPC to ignored `backend/.env`,
and the address/transaction below. It never needs a wallet private key.

<!-- SEPOLIA_DEPLOYMENT -->
Sepolia contract: [0x945472E37a3eE930C5e402729AA770AcF3Ae7fFC](https://sepolia.etherscan.io/address/0x945472E37a3eE930C5e402729AA770AcF3Ae7fFC)

Confirmed deployment: [view transaction](https://sepolia.etherscan.io/tx/0x6b6a694769a862f730922dbfc8a991e632b3b89ff885c608824022914223c971), block 11857331.
<!-- /SEPOLIA_DEPLOYMENT -->

Stop the local app, then run `npm run sepolia`. This starts both apps and the
gateway on Sepolia, with demo wallets disabled and separate key/session storage.
Use compiler 0.8.30, Shanghai, optimizer 200 for explorer verification;
`build/solidity-input.json` is the exact standard JSON compiler input.
Record an offline backup demo before judging. Hosted deployment additionally needs
a WSGI server/reverse proxy, HTTPS, persistent storage and reliable IPFS pins.
Keep Kubo's administrative API private. Localhost apps already support the laptop demo.

## Team responsibility

- Person 1: contract, DID/schema, storage and gateway. Q&A: blockchain, contract,
  privacy architecture.
- Person 2: main app, wallet flow, visibility and transaction status. Q&A: frontend,
  user flow and app access control.
- Person 3: Atlas, deployment, main GitHub repo/README, integration, pitch and
  offline video. Q&A: deployment, portability, demo and GitHub.

All members push separate branches/commits; Person 3 coordinates merges. By
mid-build day, connect all three parts once. Fill in names and live URLs before submission.

## Sources and attribution

Built on [INNOBLOCK starter](https://github.com/murthyroshan/innoblock-2.0-starter).
Original README/guides remain in `docs/`. Original `RecordRegistry.sol` and
`backend/app.py` are reference code; PS67 runs `SocialIdentity.sol` and `backend/identity.py`.
Requirements come from uploaded PS67, handbook and group instructions.

Technical references: [Kubo RPC](https://docs.ipfs.tech/reference/kubo/rpc/),
[Kubo setup](https://docs.ipfs.tech/install/command-line/),
[ethers v6](https://docs.ethers.org/v6/getting-started/).

## Privacy Assistant (optional)

Sovereign includes an opt-in local privacy assistant that suggests safer visibility
settings for fields the owner selects before publishing. It is OFF by default.
Recommendations are advisory; access remains controlled by the authenticated
backend and on-chain follower state. No profile text is sent to an external AI
provider. See [Privacy Assistant](docs/PRIVACY_ASSISTANT.md) for consent, local rules,
limitations and the isolated `npm run dev:privacy` rehearsal.

## Optional encrypted DM

Mutual-follow encrypted messaging is available as an opt-in feature.
Run `npm run dev:dm` for an isolated local rehearsal. Read
[the security design and test steps](docs/ENCRYPTED_DM_SECURITY.md) and [known limitations](docs/KNOWN_LIMITATIONS.md) before enabling it.
Browser keys have no recovery or forward secrecy; message ciphertext is stored in container-local SQLite.
