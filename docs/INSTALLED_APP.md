# Installed mobile apps (prototype)

Sovereign and Atlas are installable web apps (PWAs), not Android APKs or iOS native applications. Both require an internet connection and HTTPS for wallet authentication.

## Wallet connection

When an injected MetaMask provider exists, the existing provider flow is used. Otherwise MetaMask Connect EVM 2.1.1 supplies an EIP-1193 provider through its wallet connection bridge. The original app remains loaded rather than navigating to MetaMask's browser. The wallet may open for approval; return to the original installed app through the phone app switcher if necessary. Approve both connection/network selection and the authentication signature. Actual phone behavior still requires testing.

Only Sepolia is configured for this prototype. The read RPC fallback is https://ethereum-sepolia-rpc.publicnode.com. MetaMask connection services are an additional network dependency. Analytics are disabled. Profile field values and backend session tokens are not explicitly sent to the wallet bridge; authentication challenge messages and wallet signing/transaction requests necessarily reach the wallet transport.

The backend verifies the same signed wallet challenge as before. No private wallet keys or recovery phrases are requested. Application session tokens stay in memory, are not shared between Sovereign and Atlas, and require renewed sign-in after a reload. Provider account/network changes clear authenticated application content. Restricted profile visibility remains enforced by Flask.

## Deploy and phone test

1. Select branch `codex-installed-app` for the Sovereign and Atlas frontend Render services and deploy. Keep backend and contract unchanged.
2. Open each hosted HTTPS URL in Chrome and reload to obtain the updated assets. Install from the browser menu if an install prompt is unavailable.
3. Open the installed Sovereign app, tap Connect MetaMask, select the test account and Ethereum Sepolia, and approve the signature.
4. Return to Sovereign, without opening a second copy inside MetaMask's browser. Confirm the wallet address and profile load.
5. Repeat separately in installed Atlas. Authentication must remain independent.
6. Check account switching, rejected signatures, profile updates and follow/unfollow; approve each requested wallet transaction.

Do not claim the physical-phone gate has passed until these checks succeed. Existing IPFS/backend configuration and previously encrypted profile recovery are separate from the wallet transport.

## Installation and cache

Atlas has its own manifest and service worker. Only same-origin static assets are cached; API/auth/profile/DM/RPC responses are excluded. Cached shells do not make wallet transactions or private profiles available offline.

## Limitations

This is a hackathon PWA connection prototype. Mobile operating systems may suspend the original app while MetaMask is open. Reloading loses the backend login and requires signing in again. This is not native app packaging or a guarantee of seamless background return. The SDK introduces third-party dependencies; npm audit findings require separate dependency review before production use.
