# 04 · Troubleshooting

Check two places first: the **browser console** (F12 → Console) and the **backend logs** (your terminal, or Render → Logs).

## Wallet and frontend

| You see | Usually means | Fix |
| --- | --- | --- |
| "No wallet found" / `window.ethereum` is undefined | No wallet extension, a `file://` page, or a phone browser | Install MetaMask; serve with `python -m http.server`; on a phone, open the URL inside the MetaMask app's browser |
| Wallet on the wrong network | MetaMask isn't on `ACTIVE_NETWORK` | Press Connect again: the app asks MetaMask to switch. Check `ACTIVE_NETWORK` in `config.js` |
| Yellow banner: "Set CONTRACT_ADDRESS" | `config.js` still has the placeholder address | Paste your deployed address |
| "No contract found at CONTRACT_ADDRESS" (`BAD_DATA`) | Wrong address, wrong network, or an old ABI after a redeploy | Copy the new address **and** ABI everywhere; check `ACTIVE_NETWORK` matches where you deployed |
| `ACTION_REJECTED` / "You rejected the request" | Someone clicked Reject in MetaMask | Try again |
| "Your wallet has no test ETH/POL" (`INSUFFICIENT_FUNDS`) | The connected wallet is empty on this network | Use a faucet from [01 · Setup and networks](01-setup.md#networks-and-faucets) |
| Transaction stuck on pending | The network is busy or the fee was low | Wait a minute or use **Speed up** in MetaMask; the explorer link shows live status |
| `nonce too low` / `replacement transaction underpriced` | MetaMask's local state is out of sync | MetaMask → Settings → Advanced → **Clear activity tab data** |
| Another wallet's popup opens instead of MetaMask | Several wallet extensions installed | Disable all but MetaMask |
| Page changes don't show up | Browser cache | Hard refresh: Ctrl+Shift+R |

## Backend

| You see | Usually means | Fix |
| --- | --- | --- |
| `Missing in backend/.env: …` on start | No `.env`, or a value left empty | `copy .env.example .env` and fill it in |
| `ModuleNotFoundError` | venv not active, or a package missing | Activate the venv; `pip install -r requirements.txt` |
| "Can't reach the backend" in the page | Backend not running, wrong `BACKEND_URL`, or Render asleep | Start it / fix `config.js` / open `/health` and wait about a minute |
| CORS error in the console | `FRONTEND_ORIGIN` doesn't match, or the backend crashed (a crash response has no CORS headers) | Match the frontend URL exactly; read the backend logs for the real error |
| "The backend wallet … has no test tokens" | The `PRIVATE_KEY` wallet is empty | Fund that address from a faucet |
| `nonce too low` in the backend | Two transactions from the backend wallet at once, or the same key used in MetaMask at the same time | Send one at a time; don't use the backend's key in MetaMask during testing |
| `execution reverted` | A `require()` in your contract failed | Read the revert reason on the explorer or in Remix; check the inputs |
| Checksum / invalid address error | The address has a typo or wrong case | `Web3.to_checksum_address(...)` is already applied to `CONTRACT_ADDRESS`; check for typos |
| AI step returns 401 | Wrong or missing `API_KEY` | Check the key and that `AI_BASE_URL` matches the provider |
| AI step returns 404 or "model not found" | Wrong `AI_MODEL` or base URL | Copy the exact model name from your provider's docs |
| AI step returns 429 | Rate limit or no credit | Wait, or switch provider; keep demo prompts short |
| Records vanish on Render | `DATABASE_URL` isn't set on Render, so it fell back to SQLite on a disk that's wiped on restart | Add `DATABASE_URL` in Render's environment ([03 · Deploy and security](03-deploy-and-security.md)) |
| Backend won't start: `connection` / `timeout` error mentioning Postgres | Wrong `DATABASE_URL`, or Supabase's direct string | Re-copy the string; on Supabase use the **Session pooler** string; check the password |
| `429` / "too many requests" from the RPC | The shared public RPC is rate-limiting you | Sign up for a free [Alchemy](https://www.alchemy.com) or [Infura](https://www.infura.io) RPC URL and use it as `RPC_URL` |

## Deployment

| You see | Usually means | Fix |
| --- | --- | --- |
| Render build fails on `pip install` | A typo in `requirements.txt` or the wrong root directory | Root Directory must be `backend` |
| Render shows "Application failed to respond" | Wrong start command | `gunicorn app:app --timeout 120` |
| Mixed-content blocked | An HTTPS page calling an `http://` backend | Use the `https://` Render URL |
| First request takes about a minute | The free service was asleep | UptimeRobot every 5 minutes; open `/health` before the demo |

## Still stuck?

Write down the exact error, what you expected, and what you already tried. Then ask a mentor, or paste all three into your AI assistant.
