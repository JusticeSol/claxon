# Claxon

**Claxon sounds before liquidation does.**

Telegram alerts for FXRP agent health on Flare. Built for Flare Summer Signal (Bounty 1 — Interoperable Asset Products).

**Who it's for:** FAssets liquidators, collateral pool providers, and minters with exposure to specific agents. They have money at stake and no push notifications.

**What it watches (all read-only, straight from the `AssetManagerFXRP` contract):**

| Rule | Source fields | Severity |
|---|---|---|
| Agent status transition (NORMAL → LIQUIDATION / FULL_LIQUIDATION) | `getAgentInfo().status` | critical |
| Vault/pool CR entering warning band above enforced minimum | `vaultCollateralRatioBIPS`, `getAgentMinVaultCollateralRatioBIPS` (and pool equivalents) | warning |
| Liquidation opportunity opened (amount + premium) | `maxLiquidationAmountUBA`, `liquidationPaymentFactorVaultBIPS` | opportunity |
| Underlying backing shortfall | `underlyingBalanceUBA` < `requiredUnderlyingBalanceUBA` | critical |
| System emergency pause / minting pause | `emergencyPaused()`, `mintingPaused()` | critical / warning |

All rules are **edge-triggered**: the previous snapshot is stored in Supabase and an alert fires only on state *transitions*, with a 6h dedupe table as backstop. No spam.

## Architecture

```
GitHub Actions cron (*/5 min)
        │  Bearer POLL_SECRET
        ▼
GET /api/poll ──► viem reads ──► FlareContractRegistry ──► AssetManagerFXRP
        │            getAllAgents → getAgentInfo per agent
        ▼
   rules.ts (diff vs previous snapshot in Supabase)
        │
        ▼
   Telegram broadcast to subscribers

POST /api/telegram ◄── Telegram webhook (/watch /status /stop)
```

- **No hand-written ABI.** The full `IAssetManager` ABI is imported from `@flarenetwork/flare-periphery-contract-artifacts` (the artifact JSON is the ABI array).
- **No hardcoded contract address.** Resolved at runtime from the `FlareContractRegistry` (`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`, same on every Flare network) by name `AssetManagerFXRP`, with an env override.
- **Agent status enum** verified against `flare-foundation/fassets` `AgentInfo.sol`: `NORMAL(0), LIQUIDATION(1), FULL_LIQUIDATION(2), DESTROYING(3), DESTROYED(4)`.
- Works on Flare Mainnet (chain 14) or Coston2 (114) via `CHAIN_ID`.

## Setup

1. `npm install`
2. Create a Supabase project, run `supabase.sql` in the SQL editor.
3. Create a bot with @BotFather, note the token.
4. Copy `.env.example` → `.env.local`, fill everything in.
5. Dry run against mainnet (no sends): `npm run poll`
6. Deploy to Vercel, add the env vars.
7. Register the webhook:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
8. In the GitHub repo: add secret `POLL_SECRET` and variable `APP_URL`, enable the `claxon-poll` workflow.

Why GitHub Actions for cron: Vercel Hobby crons run at most once per day; Actions schedules run every 5 minutes for free.

## Hackathon submission notes (fill in before Aug 14)

- What existed before: nothing — built from scratch during the program.
- Flare usage: FlareContractRegistry + AssetManagerFXRP reads (FAssets is powered by FTSO + FDC; this product makes that machinery observable).
- Network: Flare Mainnet (live data), tested on Coston2.
- Traction: screenshot real Telegram subscriber count + alert history.
- Roadmap ideas: per-agent watch filters, FBTC/FDOGE managers, event-log ingestion (`LiquidationStarted`, `RedemptionDefault`) for sub-minute latency, redemption queue depth alerts.
