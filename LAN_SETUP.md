# PS67 — same Wi-Fi/LAN access

Current laptop IPv4: **10.1.16.63**. Open these URLs on another laptop connected to
the same Wi-Fi/LAN:

| Service | URL |
| --- | --- |
| Sepolia deployment page | http://10.1.16.63:8002 |
| Sovereign main app | http://10.1.16.63:8000 |
| Atlas second app | http://10.1.16.63:8001 |
| Backend health/API | http://10.1.16.63:5000/health |

Both apps choose the backend and other-app links from the browser's current host.
Backend CORS allows the two exact LAN frontend origins plus localhost equivalents.
The app servers bind to `0.0.0.0`; application guards allow only loopback and the
detected Wi-Fi subnet (currently `10.1.16.0/22`), with known host names/IPs.
No router port forwarding, public tunnel or public hosting is configured.

## Windows Firewall

Firewall is enabled and Wi-Fi is currently classified as **Public**. Existing
Node/Python allow rules refer to different installed executables from those used
by this project. The current agent process is not Administrator, so a suitable
firewall rule needs an Administrator PowerShell:

```powershell
cd 'C:\Users\mohan\Documents\Codex\2026-10-06\referenced-chatgpt-conversation-this-is-an-2\outputs\ps67-app'
& .\scripts\allow-lan.ps1
```

The script allows TCP ports **5000, 8000, 8001, 8002** only on the Wi-Fi interface,
to its current IPv4 address, from **LocalSubnet**. It supports Private/Public
network profiles and blocks edge traversal; it does not disable the firewall.
If PowerShell blocks the file under execution policy, paste the reviewed
`New-NetFirewallRule` command from the script into the Administrator window.

To remove this project's rule later (Administrator PowerShell):

```powershell
Remove-NetFirewallRule -Name PS67-LAN-Demo
```

## Restart commands

From the project folder, in two terminals:

```powershell
$env:LAN_HOST='10.1.16.63'
npm run dev:lan
```

```powershell
$env:LAN_HOST='10.1.16.63'
npm run deploy:lan
```

After a confirmed Sepolia deployment, stop `dev:lan` and start:

```powershell
$env:LAN_HOST='10.1.16.63'
npm run sepolia:lan
```

`LAN_HOST` selects this computer's interface when several are available. If DHCP
changes the address, update that value, restart both services and rerun the
firewall script. All four URLs then use the new address. Running without `--lan`
keeps the original laptop-only mode.

## Local demo and wallet access

The current main/second apps use the fake local chain; real MetaMask wallets on
Sepolia are used on the deployment page, and in both apps after `sepolia:lan`.
Local demo wallets use publicly known fake Ganache keys and are accessible to
devices in the configured LAN subnet for rehearsal. No actual MetaMask keys are
served. The backend provides a limited `/rpc` proxy for the fake chain only;
administrative RPC methods are blocked. Fake-wallet and proxy routes are disabled
in Sepolia mode. Ganache port 8545 and IPFS's admin port 5001 remain loopback-only.

Use [SEPOLIA_SETUP.md](SEPOLIA_SETUP.md) for Owner/Follower/NonFollower demo steps.
The laptop's IPFS node may communicate with public IPFS peers for decentralized
storage; these four web services are only available on the LAN.

## Check from another laptop

First open the backend health URL above: it should show `ok: true`. Then open
Sovereign and Atlas and check that blockchain/storage are ready. The deployment
page should report Sepolia connection ready. Use Chrome with MetaMask on the
device that will approve deployment. A same-laptop LAN-IP check cannot establish
whether the firewall allows another laptop through.

If all URLs time out after the firewall rule is installed, verify the same Wi-Fi
and address. Guest/college Wi-Fi can isolate clients; that requires a network
that permits laptop-to-laptop connections, such as a shared private hotspot.
