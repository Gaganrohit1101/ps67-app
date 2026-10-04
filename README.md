# INNOBLOCK 2.0 · Starter Kit

**5–7 October 2026 · GCET · Teams of 2–4 · Testnets only · Organised by the GCET Blockchain Club**

Clone this repo and you have a working dApp from minute one: a smart contract, a Python backend and a web page that write to a blockchain testnet and prove records were never changed. Spend the hackathon on your idea, not on boilerplate.

This page is the summary. The full **participant handbook** is [INNOBLOCK-2.0-Handbook.pdf](INNOBLOCK-2.0-Handbook.pdf) (10 pages), and every step is covered in detail, with screenshots, in five guides in [`docs/`](docs/), each also available as a PDF. Announcements: [@gcet_blockchain](https://www.instagram.com/gcet_blockchain/) on Instagram.

## The three days

| Day | Date | What happens | Walk out with |
| --- | --- | --- | --- |
| **Day 1 · Guest lecture** | Mon 5 Oct | Guest lecture, problem statements handed out, team ideation | A chosen problem statement, a one-line idea, and everything in [Before you arrive](#before-you-arrive) done |
| **Day 2 · Build** | Tue 6 Oct | The whole day is yours to build | Contract deployed, app live, full flow tested |
| **Day 3 · Judgment day** | Wed 7 Oct | Pitches and live demos before the judges | A tight pitch, a working demo, a submitted repo |

## Before you arrive

Do this before Day 2, ideally tonight. Installs and faucet waits are the most common way teams lose their build morning.

- [ ] **Laptop**: Chrome, Brave or Edge with [MetaMask](https://metamask.io); in MetaMask, Settings → Advanced → **Show test networks** on
- [ ] **A new wallet just for the hackathon** (a "burner"). Never use one that has held real money
- [ ] **Python 3.10+** and **Git** installed (`python --version`, `git --version`)
- [ ] **Test tokens** in your wallet. For Sepolia, these work with a new wallet: [QuickNode](https://faucet.quicknode.com/ethereum/sepolia), [Google Cloud](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), [PoW faucet](https://sepolia-faucet.pk910.de). One teammate can share with the rest
- [ ] **The starter installed**: clone this repo and run step 2 of the [Quick start](#quick-start). If `pip install` works tonight, it works tomorrow
- [ ] **Free accounts**, one per team: [GitHub](https://github.com), [Render](https://render.com), [Vercel](https://vercel.com) or [Netlify](https://netlify.com), [Neon](https://neon.tech) or [Supabase](https://supabase.com), [UptimeRobot](https://uptimerobot.com), and an AI provider if your idea uses AI

Step by step, with a 10-minute self-test: [docs/01-setup.md](docs/01-setup.md).

## Minimum to be judged

- [ ] A smart contract deployed on a **public testnet**, its address in your README and on your first slide
- [ ] At least one transaction from your app visible on the network's **block explorer**
- [ ] A web page that connects a wallet and shows each transaction's status (pending / confirmed / failed)
- [ ] A **public GitHub repo** with a README: setup steps and how to test

Extras (AI, a database, a polished UI) earn marks, but only once the minimum works.

## Ground rules

- **Testnets only.** Any public testnet is allowed. The starter supports five EVM testnets out of the box (below), and any other EVM testnet takes one config entry. Never mainnet, never real money.
- **Burner wallets only.** Make a fresh wallet for the hackathon. Never use one that has held real funds.
- **AI is allowed**, both as a coding assistant and inside your app, with any provider you like.
- **The starter is optional.** Swap any part (Hardhat or Foundry, React, a Node backend) if your team prefers. You're judged on what you build on top.
- **Every member should be able to explain their part.** Judges will ask.

## Quick start

You need Python 3.10+, Git, and a browser with MetaMask. Full walkthrough: [docs/02-build.md](docs/02-build.md).

```bash
git clone https://github.com/murthyroshan/innoblock-2.0-starter.git
cd innoblock-2.0-starter
```

**1. Deploy the contract.** [Open it in Remix](https://remix.ethereum.org/#url=https://raw.githubusercontent.com/murthyroshan/innoblock-2.0-starter/main/contracts/RecordRegistry.sol) (one click), compile, then in **Deploy & run** set Environment to **Browser Extension → MetaMask** and deploy on your testnet. Copy the contract address.

**2. Run the backend.**

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env           # Mac/Linux: cp .env.example .env
# edit .env: PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS, EXPLORER_URL
python app.py                    # http://localhost:5000/health should say "ok": true
```

**3. Run the frontend.** Set `ACTIVE_NETWORK` and `CONTRACT_ADDRESS` in [`frontend/config.js`](frontend/config.js), then in a second terminal:

```bash
cd frontend
python -m http.server 8000       # open http://localhost:8000
```

Connect your wallet, store a record, ask the AI, verify. Then make it yours.

## What's in the box

```text
innoblock-2.0-starter/
├── contracts/RecordRegistry.sol   stores a hash per record, emits an event, verifies
├── backend/                       Flask + web3.py: AI call, signs transactions, saves records
│   ├── app.py
│   ├── abi.json                   contract interface (re-copy from Remix if you change the contract)
│   ├── requirements.txt
│   └── .env.example               every setting, with examples for each network and AI provider
├── frontend/                      plain HTML + JS + ethers.js v6, no build step
│   ├── config.js                  the only file you must edit: network, contract, backend URL
│   ├── app.js
│   ├── index.html
│   └── style.css
└── docs/                          five detailed guides (PDF copies in docs/pdf/)
```

The demo app shows the core pattern: **keep the full record off-chain, put its fingerprint (hash) on-chain**, and let anyone prove the record wasn't changed. It works for AI decisions, certificates, land records, medical reports, trade signals and more. See [docs/02-build.md](docs/02-build.md#how-the-starter-works).

## Supported networks

| Network | Chain ID | Currency | Explorer |
| --- | --- | --- | --- |
| **Ethereum Sepolia** (default) | 11155111 | ETH | [sepolia.etherscan.io](https://sepolia.etherscan.io) |
| Base Sepolia | 84532 | ETH | [sepolia.basescan.org](https://sepolia.basescan.org) |
| Polygon Amoy | 80002 | POL | [amoy.polygonscan.com](https://amoy.polygonscan.com) |
| Arbitrum Sepolia | 421614 | ETH | [sepolia.arbiscan.io](https://sepolia.arbiscan.io) |
| OP Sepolia | 11155420 | ETH | [sepolia-optimism.etherscan.io](https://sepolia-optimism.etherscan.io) |

Faucets for every network, RPC URLs and how to switch: [docs/01-setup.md](docs/01-setup.md#networks-and-faucets).

## Judging

| Criterion | Marks | What judges look for |
| --- | ---: | --- |
| Working prototype & codebase | 30 | Live demo works end to end on a testnet; transactions visible on the explorer; the repo's code is what runs |
| Blockchain | 25 | The chain is needed, not decorative; sensible on-chain / off-chain split; contract verified |
| Technical quality (GitHub, README, smart contract) | 15 | Clean public repo with no secrets; complete README; readable, commented contract |
| Pitch and Q&A | 15 | How well you explain the given problem statement and your solution, on time; every member answers questions about their part |
| Innovation | 10 | A fresh angle; AI or other integrations that add real value |
| UI / UX | 5 | Easy to follow; clear transaction feedback |
| **Total** | **100** | |

## Demo day must-haves

- [ ] Frontend deployed and opens on a phone, on mobile data
- [ ] Backend awake: open `/health` just before you present
- [ ] Database connected and environment variables set on the host, not only on your laptop
- [ ] Full flow tested 30 minutes before your slot
- [ ] Demo wallet and backend wallet both hold test tokens
- [ ] Local backup running, and a 1–2 minute backup video saved offline
- [ ] Phone hotspot ready in case the Wi-Fi drops

Full checklist, pitch structure and likely judge questions: [docs/05-pitch-and-judging.md](docs/05-pitch-and-judging.md).

## Submit

Public GitHub repo · contract address with its explorer link · live frontend URL · demo video link · slides as PDF · team name, members and domain. **Where and when to submit is announced on Day 1.**

## Detailed guides

| Guide | PDF | Read it when |
| --- | --- | --- |
| [01 · Setup and networks](docs/01-setup.md) | [PDF](docs/pdf/01-setup.pdf) | Tonight: laptop, wallet, accounts, test tokens; choosing and switching testnets |
| [02 · Build](docs/02-build.md) | [PDF](docs/pdf/02-build.pdf) | Day 2: how the starter works, step by step with screenshots, AI prompt templates |
| [03 · Deploy and security](docs/03-deploy-and-security.md) | [PDF](docs/pdf/03-deploy-and-security.pdf) | Putting it online for free (Neon / Supabase, Render, Vercel, UptimeRobot) and keeping keys safe |
| [04 · Troubleshooting](docs/04-troubleshooting.md) | [PDF](docs/pdf/04-troubleshooting.pdf) | Something broke |
| [05 · Pitch and judging](docs/05-pitch-and-judging.md) | [PDF](docs/pdf/05-pitch-and-judging.pdf) | Day 3 prep: criteria, pitch, demo-day and submission checklists |
