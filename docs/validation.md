# Validation record — 2 November 2026

## Environment and scope

Branch: `feature/wallet-foundation`, based on the earlier scaffold branch.
Linux x86_64; Node v24.19.0; npm 11.9.0; rustc 1.99.1; Cargo 1.99.1;
Anchor CLI/anchor-lang 1.2.2; cargo-build-sbf 4.5.0; platform-tools v1.57
(with Rust 1.95.0). TypeScript 7.0.2; React/React DOM 19.3.1; Vite 8.3.5;
Vite React plugin 6.2.1; tsx 4.23.15.

This is a scaffold. Successful compilation does not validate a vault. The initial
classical 2-of-3 vault is NOT quantum-resistant and is not implemented yet.

## Commands actually run

| Command / operation | Observed result |
| --- | --- |
| `git ls-remote origin HEAD refs/heads/main refs/heads/feature/wallet-foundation` | GitHub read access succeeded; main pointed to the original README commit; the requested branch did not yet exist remotely |
| `git switch -c feature/wallet-foundation` | Created the branch from the existing clean scaffold |
| `npm view` for selected package versions, engines, and peer dependencies | Registry access succeeded; exact versions and Node/Vite/React compatibility checked |
| Fetch official GitHub framework documentation and release metadata | Succeeded; direct Anchor/Vite/React documentation websites returned HTTP 403 |
| Download official rustup installer and run `sha256sum -c rustup-init.sha256` | Checksum matched; installed Rust 1.99.1 with a minimal profile outside the repository |
| `npm install --no-audit --no-fund` | Installed pinned workspace dependencies and generated/updated the real npm lockfile |
| `cargo generate-lockfile` | Generated the real Cargo lockfile using crates.io |
| `cargo install cargo-build-sbf --version 4.5.0 --locked --root /workspace/wallet-toolchain/cargo -j 3` | Built and installed the official helper from registry source |
| `npm exec -- anchor keys sync` with Rust activated | Synchronized only the new program's public address with the generated ignored local program key |
| `npm ci --offline --no-audit --no-fund` | Clean reinstall from the npm lockfile and populated cache succeeded |
| `npm run build` | SDK JavaScript/declarations, TypeScript checks, and React production build succeeded |
| `npm test` | 3 scaffold tests passed; 0 failed/skipped |
| `npm run check:program` | Host Rust/Anchor compile check succeeded with `--locked` |
| `npm run test:program` | Command completed; **0 Rust unit tests and 0 doc tests** exist; no vault behavior was tested |
| `npm run build:program` (final split script) | Solana SBF build and Anchor IDL/type generation both succeeded with locked dependencies |
| Inspect current generated outputs | `target/deploy/wallet.so` exists (49,856 bytes); IDL names `wallet`, matches its public address, and has **0 instructions**; TypeScript IDL type also exists |
| `npm run dev` | Development server started on port 5173 |
| Local HTTP requests to `/`, `/src/main.tsx`, `/src/App.tsx`, and the built SDK module | All returned HTTP 200 with the expected page/module/status content |
| `git diff --check` | No whitespace errors in the final diff |
| Compare README and original frontend/program files against the starting commit | Unchanged; old scaffold material preserved |
| `git check-ignore` for secrets/keys/dependencies/build outputs and both lockfiles | Sensitive/generated paths are ignored; neither lockfile is ignored |

The frontend tests server-render React and verify the experimental warning,
non-quantum-resistant status, and staged roadmap. They do not exercise browser
interaction or a Solana validator.

## Diagnosed initial failures

- A first TypeScript check required Vite's CSS import declarations. Added the
  standard `vite/client` reference, then rebuilt successfully.
- Native Anchor/build executables cannot run inside the restrictive command
  sandbox. They ran successfully through the supported escalated command path.
- Rust/SBF tools were initially missing; installed them through official package
  sources without disabling TLS or integrity checks.
- Anchor generated a fresh local program key whose public address differed from
  the placeholder. Used `anchor keys sync`; the original legacy program stayed
  unchanged and the private key remains ignored.
- The initial combined Anchor command forwarded `--locked` incorrectly to the
  build helper, then to the IDL test runner. The final npm script separates SBF
  and IDL generation and passes Cargo arguments correctly. Both steps succeeded.

## Checks not run and limits

No browser automation was available. HTTP checks plus React server rendering
were performed instead. No wallet instruction tests, local-validator integration,
devnet deployment, transfer tests, or PQC feasibility checks were run, since this
branch has no such implementation. The full Solana/Agave CLI and validator are
not installed; the SBF build tools are installed. No mainnet action, merge, or
deployment was performed. Environment publication was not retried.

No hosted preview URL is provided by this environment. See `development.md` for
local viewing and conditional port-forwarding instructions. Live dev-server
processes may stop when the session ends; restart using `npm run dev`.
