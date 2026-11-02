# Repository instructions

## Scope

This is an experimental classical Solana vault for local development and
Solana devnet only. The initial classical vault is NOT quantum-resistant.
Do not imply that naming the project PQC provides quantum resistance.

Stages, in order:
1. Classical 2-of-3 SOL vault using three independently generated keys.
2. Research and measure actual on-chain PQC verification.
3. Add mandatory on-chain PQC authorization only if feasibility passes.

Stage A implements only initialization, deposits, immutable proposals, approvals,
and 2-of-3 SOL execution. Do not add tokens, swaps, recovery, owner rotation,
arbitrary instruction execution, PQC, account closure, or external deployment.
Keep the UI label "Experimental classical multisig — local/devnet only."
Never request or commit a real recovery phrase, private key, or production secret.

## Layout and preservation

Use the existing checkout; cloud tasks are already isolated. Do not create a Git
worktree unless the user explicitly requests one. Preserve pre-existing work.

Active code lives in `programs/wallet`, `packages/sdk`, `apps/web`, and `tests`.
Read `docs/development.md`, `docs/architecture.md`, and `docs/threat-model.md`.
The original README, root `src`, root Vite entry/config, and
`programs/pqc-solana-wallet` are retained from the earlier scaffold. They are not
the active frontend/program targets; do not accidentally build both programs.

## Dependencies and validation

Pin direct dependencies exactly. Generate `package-lock.json` and `Cargo.lock`
using npm and Cargo; commit both. Use `npm ci` and Cargo's `--locked` mode for
repeatable installs/checks. Never disable TLS, checksum, or signature checks.

From the repository root:

- `npm run build`: SDK build, TypeScript checks, and React production bundle.
- `npm test`: TypeScript scaffold tests, including server rendering of the UI.
- `npm run check:program`: host Rust compile check.
- `npm run test:program`: host Rust tests; not validator integration coverage.
- `npm run test:validator`: builds and runs the actual program on a private local
  solana-test-validator; requires the executable on PATH. Never replace this with
  mocks or connect this runner to an external network.
- `npm run build:program`: Solana-target build and Anchor IDL generation; requires
  `cargo-build-sbf` and its platform tools.

Report checks actually run. Host compilation does not establish Solana-target
compatibility or on-chain behavior. The metadata/UI tests do not test a vault.
Do not merge, deploy, send funds, or publish an environment without user scope
that authorizes that action.
