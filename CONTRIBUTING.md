# Contributing

## Ground rules

- **Honesty first**: everything shipped must be real and verifiable on chain. No fake data, no promised features as live, EXAMPLE/PAPER labels stay honest.
- Contracts changes require tests (`contracts/test/`) and keep the deployed bytecode reproducible — after any contract change, source must be re-verified on the explorer.
- Keys never enter the repository (`engine/.env`, `.deploy-refresh-secret` are ignored — keep it that way).

## Flow

1. Open an issue describing the problem/feature (link the on-chain evidence if it is data-related).
2. Fork, branch, change, test: `pnpm build && npx hardhat test && node --test engine/grader.test.mjs`.
3. PR with a short description; CI-relevant checks run locally first.

## Engine / workers

- Engine changes: run `node engine/metronome.mjs --once` against a funded test setup before proposing.
- Worker integrations: see `/agents` on the site and `docs/api-spec.md`.
