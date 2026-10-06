# PS67 — Sepolia setup and base demo

## Verified locally

Contract compilation; profile creation and editing; follow/unfollow; owner,
follower and public visibility; signed-session privacy; encrypted restricted
IPFS content; App 2 resolving the latest profile and the same follower graph.
Local transaction states include pending, confirmed and failed.
These checks do not prove a Sepolia deployment has happened.

## 1. Deploy from Chrome with MetaMask

In a terminal in this project folder:

```powershell
npm run deploy:sepolia
```

1. Open **http://127.0.0.1:8002** in **Chrome**, where MetaMask is installed.
2. Unlock MetaMask yourself. Select your **Owner** account in the fresh hackathon wallet.
3. Click **Connect MetaMask on Sepolia** and approve the connection/network switch.
4. Check the wallet address and balance. Click **Deploy SocialIdentity**.
5. Review and confirm the **Sepolia** contract deployment in MetaMask.
6. Wait for **Confirmed on Sepolia**. Open the explorer link to inspect its success.

The deployment helper saves the address, transaction hash and block to
`deployments/sepolia.json`, updates the README, and configures `backend/.env`.
If recording fails after mining, use the transaction-hash box to retry verification;
this sends no new transaction. Do not deploy again just because recording failed.

No Secret Recovery Phrase or private key is needed. Keep `backend/.env` local;
Git ignores it and `.env.*` files apart from the two example templates. The
template has a public RPC URL, chain `11155111`, explorer and address placeholder.
If the public RPC is unavailable, use a Sepolia RPC in `backend/.env`; never paste
an RPC access token or wallet secret into chat. Keep any provider key in that
ignored file. The deployment helper verifies the RPC chain before use.

## 2. Start both apps on Sepolia

Stop `npm run dev` with Ctrl+C before launching the same ports:

```powershell
npm run sepolia
```

Open **http://127.0.0.1:8000** (Sovereign) and **http://127.0.0.1:8001** (Atlas)
in Chrome. The launcher starts local IPFS when installed and the gateway on port
5000. It uses Sepolia, the recorded contract and separate `.data/sepolia` storage.
Wait for both blockchain and IPFS to be ready. Demo wallets are disabled here.
Keep this terminal and IPFS running throughout the demo.

## 3. Your three demo accounts

Your account setup is complete (balances reported by you, not independently checked):

| Chrome MetaMask account | Purpose | Sepolia ETH |
| --- | --- | --- |
| **Owner** | Deploy contract, create/edit profile, show owner view | Remaining funded balance |
| **Follower** | Follow/unfollow Owner, show follower view in both apps | 0.005 test ETH |
| **NonFollower** | Sign in and demonstrate public fields with restricted fields hidden | Unfunded |

NonFollower needs no test ETH to connect, sign the login message or read a profile.
Do not click Save or Follow from that account: those actions need a transaction.
Follower does not need to create its own profile before following Owner.
Check the selected public address in each app when switching accounts, then reconnect
and sign in. If Chrome keeps exposing the previous account, select the intended
account for that site's connection in MetaMask and reconnect.

For a local rehearsal, use the fake demo wallets: **Alice = Owner**, **Bob = Follower**,
**Charlie = NonFollower**. These local addresses and DID chain IDs are separate from
your real Sepolia accounts. Keep Chrome MetaMask on Sepolia for the public-testnet flow.

## 4. Exact base demo

1. **Owner / Sovereign:** connect MetaMask and sign the gateway login message.
   Set display name/about to Public, a fictional location to Followers only and
   a fictional email to Private. Save; approve the profile transaction. Show
   Pending → Confirmed and its Sepolia explorer link. Owner sees every field.
2. **NonFollower / Atlas:** select NonFollower in MetaMask, connect and sign in,
   then load Owner's wallet/DID. Public fields appear; location and email remain
   restricted. Follower count is read from the same contract. No transaction or
   test ETH is needed. An anonymous visitor should see the same public fields.
3. **Follower / Sovereign:** disconnect, switch MetaMask to Follower, reconnect
   and sign in. Explore the owner's address/DID, click Follow and approve.
   After confirmation, location appears; private email remains restricted.
4. **Follower / Atlas:** connect the follower account and load the same owner DID.
   Show the same profile, location and follower graph in this separate frontend.
   Alternatively export the owner's identity JSON and import it in Atlas.
5. **Revocation:** unfollow in Sovereign, confirm, then reload Atlas. The followers
   field is restricted again. Refollow if you want a final follower snapshot.
6. **Owner:** switch back, reconnect and edit the public about text. Confirm, then
   reload Atlas to show that both apps resolve the updated on-chain IPFS pointer.

Expected visibility in **both** Sovereign and Atlas:

| Viewer | Public name/about | Followers-only location | Private email |
| --- | --- | --- | --- |
| Owner | Visible | Visible | Visible |
| Follower, after confirmed Follow | Visible | Visible | Hidden |
| NonFollower | Visible | Hidden | Hidden |
| Follower, after confirmed Unfollow | Visible | Hidden | Hidden |

For the clearest comparison, use Owner's wallet/DID throughout and reload the
profile after each confirmed Follow/Unfollow. Switching accounts applies across
Chrome tabs: connect again in each app rather than assuming it still uses its
previous viewer. Keep a note of the contract address and the profile/follow
transaction hashes for the explorer and backup video.

Wallet changes clear signed-in views. Sign in again if a session expires. Record
an offline backup video showing the explorer, owner/follower/public views and
both apps. Person 3 owns the video, GitHub submission and README. Put the actual
contract address on slide one after deployment; all three members explain their part.

## What remains manual

You unlock MetaMask, select the correct account, approve connection/signature/
transaction prompts, and optionally complete explorer verification. The agent
can check the public receipt and configure/test the code after those actions.
The browser automation available in this chat cannot control your Chrome wallet.

Prototype privacy uses a trusted gateway holding the encryption key. Both apps
use that gateway for restricted reads. Keep `.data/sepolia/privacy.key` backed up;
use fictional data. Public IPFS availability requires the node/pins to stay online.
