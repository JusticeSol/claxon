# Claxon

**Claxon sounds before liquidation does.**

Telegram alerts for FXRP agent health on Flare. Built for **Flare Summer Signal — Bounty 1 (Interoperable Asset Products)**.

| | |
|---|---|
| **Live app** | https://claxon-eta.vercel.app |
| **Telegram bot** | [@ClaxonFlareBot](https://t.me/ClaxonFlareBot) — send `/watch` |
| **Repo** | https://github.com/JusticeSol/claxon |
| **Network** | **Flare Mainnet** (chain 14) — live production data, not testnet |
| **Status** | Running autonomously (see [polling cadence](#a-note-on-polling-cadence)) |

---

## The problem

FAssets turns XRP into FXRP on Flare, and the whole system is backed by **agents** who post collateral. When an agent's collateral ratio falls, they get liquidated — and liquidation is where money is made and lost.

Today, at the time of writing, **6 agents back ~1,855,673 XRP** of minted FXRP on mainnet. All of that state is readable on-chain, and **none of it is pushed to anyone.** If you have exposure, your only options are to poll a block explorer by hand or write your own indexer.

Three groups feel this directly:

- **Agent operators** *(primary user)* — collateral drifts over hours and days as prices move. Getting told "you are approaching your minimum" while there is still time to top up is the difference between adding collateral and being liquidated.
- **Collateral pool providers** — their capital absorbs the loss when an agent fails, and they have no way to know their chosen agent is deteriorating.
- **Minters / FXRP holders** — exposed to the specific agent backing their position, including backing shortfalls that precede a default.

Claxon is the missing push notification. It watches every FXRP agent and messages you on Telegram the moment something changes — **before** the loss, not after.

**On latency, honestly.** Claxon polls roughly every five minutes, which suits the problem it targets: collateral erosion is a slow-moving risk measured in hours, and a five-minute warning band is early enough to act on. It is deliberately **not** built to win liquidation races — those are decided in milliseconds by bots with private mempool access, and any project claiming otherwise on a cron schedule is overselling. The liquidation-opportunity alert exists for humans who want visibility into what is happening, not to front-run automated liquidators. Closing that gap properly means event-log ingestion, which is the top item on the roadmap.

## Why this belongs in "Interoperable Asset Products"

FAssets **is** Flare's interoperable asset system — it is how a non-smart-contract chain's asset (XRP) becomes usable on Flare. FXRP is only as trustworthy as the collateral behind it, and that collateral is maintained by a handful of agents whose health is, today, invisible unless you write your own indexer.

An interoperable asset nobody can monitor is an interoperable asset nobody should hold at size. Claxon is not a separate product sitting beside FAssets; it operates directly on `AssetManagerFXRP` state and makes the solvency of the bridge legible to the people whose capital secures it. Better-informed agents top up collateral instead of being liquidated, and better-informed pool providers price their risk — both of which make FXRP itself safer to hold.

The submission brief invites products that solve a **"user, developer, ecosystem, or infrastructure problem."** This is the infrastructure case: the asset layer already exists and works; what is missing is the observability that lets people trust it. That gap is filled here for the entire FXRP agent set on mainnet, not a demo subset.

## What it watches

All read-only, straight from the `AssetManagerFXRP` contract:

| Rule | Source fields | Severity |
|---|---|---|
| Agent status transition (NORMAL → LIQUIDATION / FULL_LIQUIDATION) | `getAgentInfo().status` | critical |
| Vault/pool CR entering the warning band above the enforced minimum | `vaultCollateralRatioBIPS`, `getAgentMinVaultCollateralRatioBIPS` (+ pool equivalents) | warning |
| Liquidation opportunity opened (amount **and** premium) | `maxLiquidationAmountUBA`, `liquidationPaymentFactorVaultBIPS` | opportunity |
| Underlying backing shortfall | `underlyingBalanceUBA` < `requiredUnderlyingBalanceUBA` | critical |
| System emergency pause / minting pause | `emergencyPaused()`, `mintingPaused()` | critical / warning |

**Every rule is edge-triggered.** The previous snapshot is stored in Supabase and an alert fires only on a state *transition* — plus a 6-hour dedupe table as a backstop. An agent sitting at a low CR for a week produces **one** alert, not 2,016. This is the difference between a tool people keep installed and one they mute.

## How it uses Flare

This is not a superficial integration — the product *is* Flare state:

- **`FlareContractRegistry` → `AssetManagerFXRP`.** No hardcoded contract address anywhere. The AssetManager is resolved at runtime by name from the registry (`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`, identical on every Flare network). Point `CHAIN_ID` at Coston2 and the same code works with zero edits — and it survives a contract redeployment that would break a hardcoded competitor.
- **No hand-written ABI.** The full `IAssetManager` ABI is imported from the official `@flarenetwork/flare-periphery-contract-artifacts` package, so the interface can't drift from what's deployed.
- **`getAllAgents` + `getAgentInfo`** — paginated agent discovery, then a 40-field struct read per agent that feeds nearly every rule.
- **Agent status enum verified against source** (`flare-foundation/fassets`, `AgentInfo.sol`): `NORMAL(0), LIQUIDATION(1), FULL_LIQUIDATION(2), DESTROYING(3), DESTROYED(4)`. Worth noting: some older documentation implies `LIQUIDATION` is 2 — it is **1**, confirmed against the Solidity source and the FAssets demo dapp. Getting this wrong silently misreports every agent's state.

FAssets itself is powered by FTSO price feeds and the FDC. Claxon makes that machinery **observable** to the people whose money depends on it.

## Architecture

```
External cron  (every 5 min)
        │  Authorization: Bearer POLL_SECRET
        ▼
GET /api/poll ──► viem ──► FlareContractRegistry ──► AssetManagerFXRP
        │            getAllAgents → getAgentInfo per agent
        ▼
   rules.ts  (diff against previous snapshot in Supabase)
        │
        ├──► filterUnsent()  6h dedupe
        ▼
   Telegram broadcast to subscribers

POST /api/telegram ◄── Telegram webhook (/watch, /status, /stop)
```

### A note on polling cadence

The poll endpoint is deliberately a plain secret-gated `GET`, so **any** scheduler can drive it. That decoupling turned out to matter.

Vercel's Hobby tier caps cron at **once per day** — useless here. GitHub Actions accepts a `*/5` schedule for free, so Claxon shipped on that. Measured over a full day of production runs, GitHub honoured almost none of it: **actual gaps between scheduled runs ranged from 50 to 180 minutes**, with two outright failures. GitHub documents scheduled workflows as best-effort and deprioritises them under load; on a free repo that is severe.

This was caught by Claxon's own heartbeat, which is the system working as designed — and it is worth stating plainly rather than quietly papering over, because it changes what the product honestly promises:

- **Alert latency is currently bounded by the scheduler, not by Claxon.** For collateral drift measured in hours this is still useful; it is not a five-minute guarantee.
- The offline threshold is therefore set to **90 minutes** by default. A tighter threshold on a throttled scheduler would fire false "Claxon was offline" notices on every late run — turning the alerting product into the noise it exists to prevent.

**The fix is to drive `/api/poll` from a scheduler that honours short intervals** — [cron-job.org](https://cron-job.org) (free, custom `Authorization` header, down to 1 minute), Better Stack, or any always-on host. Once that is in place, set `STALE_AFTER_MS=1200000` (20 min) and the five-minute claim becomes true. The GitHub Actions workflow is retained as a redundant backstop.

**Bigint-safe persistence.** FAsset UBA amounts routinely exceed `Number.MAX_SAFE_INTEGER`, so snapshots serialise bigints as tagged strings and revive them on read. A naive `JSON.stringify` round-trip corrupts balances silently — which would produce confidently wrong alerts.

**Security.** Supabase RLS is enabled deny-by-default on all three tables; the server holds the `service_role` key (which bypasses RLS), so the public `anon` key can read nothing — notably not the `subscribers` table, which holds Telegram chat IDs.

### Who watches the watchman

A monitoring product that dies quietly is worse than no monitoring at all, because **subscribers read silence as "nothing is wrong."** Claxon is built so that its own failure is detectable:

- Every poll records a heartbeat — success or failure, with the error message.
- **`GET /api/health`** is public and unauthenticated (it exposes no secrets). It returns the age of the last completed poll and **HTTP 503 once that exceeds 20 minutes** — four consecutive missed runs. Point any uptime monitor at it and you get paged when Claxon stops.
- When a poll succeeds after a gap, subscribers are told: *"Claxon was offline for ~N min and has resumed — alerts during that window may have been missed."* Users learn that the silence was a fault, not calm.
- The landing page shows poller state and time since the last check, so liveness is visible rather than assumed.

```bash
curl https://claxon-eta.vercel.app/api/health
```

## Verification against mainnet

Every component has been exercised against live infrastructure. No mocks.

- **Chain reads** — 6 agents discovered and read at block `66302915`; contract resolved from the registry to `0x2a3Fe068cD92178554cabcf7c95ADf49B4B0B6A8`.
- **Alert delivery** — real Telegram messages delivered, through the production `/api/poll` route.
- **Edge-triggering proven** — three consecutive polls returned `alertsEvaluated: 4 → 0 → 0`. The second poll evaluated *zero* alerts (not merely suppressed them), confirming the transition logic works at the rules layer, with dedupe underneath as defence in depth.
- **No false positives** — at the production threshold, healthy agents produce `0` alerts. Claxon stays quiet until something actually happens.
- **Auth** — `/api/poll` returns `401` without the bearer token; the Telegram webhook validates `x-telegram-bot-api-secret-token`.
- **Persistence** — 8/8 store checks pass against live Supabase, including exact round-trip of a 30-digit bigint.

- **Heartbeat / self-monitoring** — verified by backdating the heartbeat 25 minutes: `/api/health` correctly flipped to `503 stale`, the next poll returned `recovered: true` and sent exactly one recovery notice, and an immediate re-poll returned `recovered: false` (no repeat).

**Automated tests.** The rules engine has a 19-test suite covering every alert type and, most importantly, the edge-triggering property itself — a condition that is merely *true* must stay silent; only one that *became* true may fire. Pure functions, no network, no credentials:

```bash
npm test
```

Reproduce the read path yourself in one command, no credentials needed:

```bash
npm install && npm run poll
```

## Smart contracts / deployment

| Item | Value |
|---|---|
| Network | Flare Mainnet (chain ID **14**) |
| FlareContractRegistry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| AssetManagerFXRP (resolved at runtime) | `0x2a3Fe068cD92178554cabcf7c95ADf49B4B0B6A8` |
| Registry lookup name | `AssetManagerFXRP` |
| RPC | `https://flare-api.flare.network/ext/C/rpc` |

Claxon **deploys no contracts of its own** — it is a read-only observability layer over Flare's FAssets system. That is deliberate: it holds no user funds, needs no approvals, and carries no smart-contract risk.

## What was built during the program

Claxon was built **from scratch** during Flare Summer Signal. Nothing pre-existed. Specifically:

- Registry-based contract resolution and typed mainnet reads via the official periphery artifacts
- The edge-triggered rules engine and its dedupe layer — the core intellectual work, and what separates this from a naive polling script
- Telegram bot, webhook handler, and subscriber management
- Bigint-safe snapshot persistence on Supabase with RLS
- Secret-gated poll endpoint and the GitHub Actions cron
- Full mainnet verification, deployment, and the live bot

## Setup (self-hosting)

1. `npm install`
2. Create a Supabase project, run [`supabase.sql`](supabase.sql) in the SQL editor (creates the tables and enables RLS).
3. Create a bot with [@BotFather](https://t.me/BotFather), note the token.
4. Copy `.env.example` → `.env.local` and fill it in.
5. Dry-run against mainnet, no sends, no credentials required: `npm run poll`
6. Deploy to Vercel with the same env vars.
7. Register the webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
8. In the GitHub repo add secret `POLL_SECRET` and variable `APP_URL`, then enable the `claxon-poll` workflow.

Force a demo alert on demand by widening the warning band so healthy agents trip it:

```bash
CR_WARNING_MARGIN_BIPS=7000 TEST_CHAT_ID=<your-chat-id> npm run test:alert
```

## Roadmap

- **Per-agent subscriptions** — `/watch 0xabc…` to follow only the agents you're exposed to, instead of all of them.
- **Event-log ingestion for sub-minute latency.** The highest-value next step. Polling every 5 minutes is fine for collateral drift but slow for liquidation races; subscribing to `LiquidationStarted`, `FullLiquidationStarted`, `RedemptionDefault`, and `UnderlyingBalanceTooLow` would cut alert latency to roughly one block.
- **FBTC / FDOGE asset managers** — the registry pattern means this is largely a config change.
- **Redemption queue depth alerts** — warn minters before redemption congestion, not during.
- **Richer web dashboard** — the landing page already shows live agent health; next is per-agent history and CR trend over time, so you can see an agent sliding rather than only where it stands now.
- **Discord / webhook targets** — teams and funds want alerts in their own channels.

## Traction

Honest status: Claxon went live during the program and is **running autonomously on mainnet**, but distribution work has only just started — it currently has 1 subscriber (the builder). The bot is public and installable today at [@ClaxonFlareBot](https://t.me/ClaxonFlareBot).

The realistic distribution path is the FAssets agent and liquidator community, which is small and reachable: agent operators have direct financial motivation to monitor their own collateral, and liquidators have motivation to be first to an opportunity. Both are addressable through the Flare community channels rather than broad marketing.

## Licence

[MIT](LICENSE) — free to use, fork, and self-host.

