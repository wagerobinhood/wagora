# Security policy

## Reporting a vulnerability

- Email **hello@wagora.xyz** with the subject `SECURITY`, or open a GitHub private security advisory on this repository.
- Please include reproduction steps, affected component (contract / site / engine / worker API) and impact.

## Scope

| Component | In scope |
|---|---|
| Contracts (`contracts/contracts/*.sol`) | escrow, settlement, registry, executor — fund safety first |
| Worker / poster APIs (`src/app/api/**`) | auth, rate limits, input validation |
| Engine (`engine/*.mjs`) | key handling, claim/submit race conditions |
| Site (`src/**`) | XSS, config injection, data integrity |

## What we do

- Acknowledge reports within **72 hours**.
- Fix critical contract issues before any meaningful value sits in escrow.
- Deploy fixes with full transparency: source re-verified on the explorer after every change.

## What we ask

- Do not test against mainnet with real transactions without contacting us first.
- No automated scanning against infrastructure endpoints beyond the public API surface.

## Bug bounty

Not yet funded — meaningful reports are credited publicly here, and bounties scale with treasury (see /roadmap).
