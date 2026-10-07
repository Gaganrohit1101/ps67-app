# Privacy Assistant

## Purpose

Sovereign's optional Privacy Assistant helps an owner consider Public, Followers only or Private visibility before publishing. It offers local, explainable recommendations; it is not an LLM, an authorization service or a guarantee that a profile contains no sensitive information.

## Default State

**OFF by default.** Connecting a wallet never enables the assistant. The app's normal editing, publishing, MetaMask and privacy controls work while it is OFF. OFF bypasses the analysis functions before field contents are read and hides all assistant suggestions.

The preference is a boolean stored in browser localStorage, scoped to a public network/contract/wallet reference. Every new wallet starts OFF. A guest setting is separate from wallet settings and does not enable a newly connected wallet. Re-enabling a previously consenting wallet in that same browser uses its saved preference; the assistant still analyzes only explicitly selected fields. Missing, malformed or unavailable settings default to OFF. If storage is blocked, explicit consent can enable the feature for the current mounted session and the UI warns that persistence failed. There is no server preference or synchronization across devices. Changing wallet/network selects a separate preference.

## Consent

Settings → Privacy Assistant shows ON/OFF in text and an accessible switch. Pressing Enable Privacy Assistant opens an information dialog; only pressing its **Enable** button enables the feature. Not now or Escape cancels. The dialog explains inputs, exclusions, local processing, and that backend authorization remains in control. This confirmation is shown whenever the user enables the feature again.

## Local Analysis

`ui/sovereign/privacy-assistant.mjs` is a deterministic local privacy recommendation engine. It uses small, bounded checks on at most the editor's 2000-character field values. It contains no fetch calls, AI SDK, credentials, telemetry or analysis endpoint.

The owner chooses fields with Include … in privacy review. New editor sessions start with no selected fields. Analyze selected fields performs a review immediately. Save performs a pre-publish review of selected, non-ignored fields. Typing, field blur, wallet connection and toggling selection never trigger analysis. Selecting a field is explicit permission to include that field in these requested reviews. Posts are not analyzed.

Rules:

- Display name, username, normal bio and website: usually Public.
- College: Followers only.
- Email, phone and location: Private.
- Email-like text or 7–15-digit phone-like sequences in any supported selected field: Private, with a possible-contact warning.
- Some identity-document/account labels followed by digits, street-number/road-like text, and URL parameters such as token/password: Private, with an explanation.
- A field that is already more restrictive is never recommended for a broader audience.

Suggestions include only field type, current/recommended visibility and generic explanations, not a copy of matched personal text. The pure analyzer receives exactly `{fieldType, value, currentVisibility}`. Helpers ignore unknown field types and do not forward a draft, client, wallet, session or posts object to the analyzer. Nothing is sent or logged for analysis.

The active core schema supports Display name, Bio, Website, College, Email and legacy Location. Dedicated Username and Phone fields are **not** added because they would require a core schema/product change. The engine defines those baseline recommendations for future use and detects phone-like text in existing fields. Existing unsupported-field rejection stays intact. There are no schema migrations or reinterpretations of legacy encrypted Location.

## External AI

**No profile content is sent to an external AI provider.** No enhanced/external mode is implemented. Repository review found the starter `backend/app.py` example with a generic `/ai/decide` route, separate from the active `backend/identity.py` profile service. It is not used by this feature. Its presence does not constitute safe consent or a configured privacy analysis service. No paid provider, package or API secret was added.

## Data the Assistant Can Access

Only the owner's explicitly selected draft field content, field type and current visibility when a requested review runs. The editor loads only the authenticated owner's permitted API data, using its unchanged owner checks. This is analysis of a user's own editor, not other profiles or Atlas data.

## Data the Assistant Cannot Access

The analysis functions never receive wallet private keys, seeds/recovery phrases, authentication tokens, encryption keys, DMs, posts, unrelated/unselected fields or other users' restricted data. The UI wrapper can read the public wallet address solely to scope a boolean preference. Analysis is separate from authentication and does not read that preference scope. This is an architectural data-flow limit, not a browser sandbox: the application already has owner draft data and its existing session in memory; malicious same-origin code/XSS could still compromise the application.

## User Control

- Enable requires an explicit confirmation; Disable stops analysis and hides warnings.
- The editor includes a Disable button, allowing the owner to turn the feature OFF without leaving or altering the draft.
- A recommendation never changes the draft by itself.
- Apply changes only that field's visibility selector, preserving its value and all other fields.
- Ignore dismisses that recommendation for the current editor session and excludes it from pre-publish suggestions until the field is changed, reselected or explicitly reanalyzed.
- Manual edits invalidate stale recommendations. The owner can manually override an applied suggestion.
- Publishing with current choices is always allowed, subject to the existing profile validation and wallet transaction flow.
- Preferences store only booleans. Drafts, suggestions, matches and ignored-field lists are not persisted by the assistant. Reloading/navigating away uses the existing editor behavior and can discard unsaved draft edits.

## Authorization Separation

Assistant → recommendation → user choice → saved field policy → existing backend authorization.

The assistant has no authority to make followers, grant ownership, expose hidden fields, change roles or bypass access checks. No backend implementation, contract, authentication, IPFS/Pinata adapter, deployment address or production settings were modified. Backend reads still use the signed wallet session, owner identity, on-chain follower relationship and saved visibility. Unauthorized fields remain absent from API values; they are not sent to a browser for analysis or blurred with CSS.

Atlas has no assistant, editor or shared login state added. It continues to independently authenticate and resolve the same saved policy. A followers-only College is readable by Owner/Follower; NonFollower receives no College value. Owner-private Email and phone-like private Bio remain absent for followers and nonfollowers. Dedicated Phone remains rejected by the existing schema.

## Pre-Publish Review

When ON, Save reviews only explicitly selected, non-ignored fields. A dialog appears if it recommends a more restrictive audience. It offers per-field Apply, Apply recommended changes, Review individually, and Publish with my current choices. Applying returns to editing; it does not silently publish. Press Save again when ready. Review individually returns focus to the relevant field. The user's own choices can be published without accepting a suggestion. With no issues, no selection, or the assistant OFF, normal saving proceeds directly.

An exception in local analysis produces **Privacy Assistant unavailable** and an empty issue list. The existing Save/Publish flow continues. The assistant never supplies credentials or authorization to the transaction flow.

## Mobile Behavior

The layout uses wrapping controls, at least 44-pixel action targets, text ON/OFF, full-width small-screen actions and a native modal dialog. Dialogs use dynamic viewport height, scrollable content and viewport-bounded width. Native modal behavior contains keyboard focus, supports Escape, and restores focus to the invoking control. Existing visible focus styles and reduced-motion settings remain effective. Settings is available in the mobile navigation. New assistant content uses the existing Light, Dark and Night theme tokens.

Physical on-screen keyboards differ by device/browser. Responsive viewport tests cannot prove every real phone keyboard configuration; manually test an actual phone before presenting that claim.

## Known Limitations

- Rules can miss sensitive content, misinterpret harmless numeric/address text, and do not understand nuanced context, images or obfuscated content. Phone detection is not country-specific validation.
- A Public recommendation does not mean the value is safe. No analysis runs on unselected fields, posts or other apps.
- The assistant is not an AI/LLM model or a compliance/privacy certification. It does not make cryptographic or security guarantees.
- Preferences are device/browser specific; private browsing or blocked storage may reset them.
- No new username/phone profile fields, external AI, DM integration, social features or production deployment are included.
- The backend's existing profile privacy/security limits remain; this recommendation feature does not upgrade them.

## Local Rehearsal and Automated Tests

Use this feature checkout. Install existing dependencies and the existing Python requirements as in README; no new dependency was added. With a local IPFS daemon on loopback port 5001:

```powershell
$env:PYTHON_BIN = 'C:\absolute\path\to\python.exe'
npm run dev:privacy
```

The isolated launcher uses Sovereign `http://127.0.0.1:8200/settings`, Atlas `http://127.0.0.1:8201`, API `http://127.0.0.1:5200`, and fake local chain 9645. It ignores dotenv loading, uses ignored `.data/privacy-local`, and binds loopback only. It does not deploy to Sepolia or touch Antigravity's services. Its explicit local process settings are not production configuration changes.

In a second terminal in this checkout:

```powershell
$env:PYTHON_BIN = 'C:\absolute\path\to\python.exe'
$env:PS67_TEST_API = 'http://127.0.0.1:5200'
$env:VITE_API_BASE = $env:PS67_TEST_API
npm run build:ui
npm run test:all
```

Tests cover default OFF, consent, OFF bypass without reading content, disable, selection, advisory-only suggestions, field-specific Apply, Ignore, manual override, Publish anyway, phone/email detection, failure tolerance, strict analyzer inputs, boolean-only persistence, unauthorized API filtering, independent Sovereign/Atlas signed sessions and forged-role denial. Existing tests remain and the previously separate IPFS adapter regression test is included in test:all.

## Future Improvements

Expand local rules with regional validation and usability feedback; consider a separate opt-in external mode only with clear provider/data/retention disclosures; add richer per-field explanations and accessible real-device audits. Add new profile fields only as a separately reviewed core schema change. Keep recommendation and authorization responsibilities separate.

## Verification — 7 October 2026

- Base: `origin/figma-ui-integration`, `181d027425f61edf44919e59cc29139c93c79a3d`; feature branch `codex-ai-privacy`.
- `npm run build:ui` and `npm run test:all` passed. Total: **32 tests** — 14 existing tests (including the previously separate IPFS adapter test) and 18 new assistant/authorization tests. TypeScript and both React builds passed. Existing Vite bundle-size and Ganache optional native-module fallback advisories remain.
- Browser checks passed for Settings, consent, explanation, selected-field suggestions and Privacy Review at **360 / 390 / 412 pixels in Light / Dark / Night**. Strict checks compare content width against the scrollbar-excluding client width. A narrow editor grid overflow was fixed locally without changing Atlas styles.
- Native-dialog Tab/Escape, focus restoration, visible focus, 44-pixel actions, advisory-only results, Apply, Ignore, manual override, applying all recommendations, Publish with current choices, disabling without draft changes, boolean preference persistence and new-wallet OFF were exercised.
- Two profile publications confirmed on the isolated **fake local chain**, including Publish anyway and ordinary saving while OFF. Actual Chrome MetaMask/Sepolia execution of this feature was not tested or deployed.
- Atlas independently authenticated Owner, Follower and NonFollower and resolved the final saved profile: Owner saw all; Follower saw College but no private Email/phone-like Bio; NonFollower saw none of those restricted values. No assistant was present in Atlas. No console errors were captured in the tested flows.
- **Manual check still needed:** an actual phone with its on-screen keyboard open. Desktop viewport checks do not verify OS keyboard occlusion. No credentials, keys or external AI setup are required.
- Integration risk: **LOW**, because analysis is local, OFF by default and advisory, and protected backend/contract/storage/deployment code is unchanged. Editor submission and mobile layout are touched and should be smoke-tested when eventually integrated with later core commits.

## Files Changed

- `ui/sovereign/privacy-assistant.mjs` — rules, input allowlist, preference and advisory helpers.
- `ui/sovereign/PrivacyAssistant.tsx` — scoped preference context, Settings, consent and explanation dialogs.
- `ui/sovereign/privacy-assistant.css` — assistant layout, mobile dialog/actions and scoped editor grid correction.
- `ui/sovereign/EditProfile.tsx` — explicit selected-field analysis and pre-publish review.
- `ui/sovereign/main.tsx` — Sovereign Settings route/navigation and provider.
- `tests/privacy-assistant.test.mjs` — 16 local recommendation/control tests.
- `tests/assistant_authorization.py` — 2 signed-session/API filtering regression tests.
- `tests/integration.py` — optional isolated test API URL, preserving its default.
- `scripts/test.mjs` — includes new tests and the existing IPFS adapter test.
- `scripts/privacy-dev.mjs` — loopback-only local rehearsal on separate ports.
- `package.json` — `dev:privacy` command; no dependency additions.
- `README.md` — small optional-feature section.
- `docs/PRIVACY_ASSISTANT.md` — this design, limitations and verification record.
