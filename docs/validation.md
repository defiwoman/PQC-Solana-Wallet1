# Pre-devnet review validation — 3 November 2026

See [the review](pre-devnet-review.md) for findings, fixes, warning classifications,
remaining limitations, required manual wallet tests and the **not yet ready for
devnet** decision. No external wallet signing, merge or deployment was performed.

- `npm run test:validator`: **21 real-program local-validator tests passed**, no
  failures or skips, including competing execution/approval transactions.
- `npm test`: **29 frontend/SDK tests passed**, no failures or skips. RPC/wallet
  responses in this suite are fixtures; signatures use disposable Node-only keys.
- `npm run build`: passed SDK, TypeScript and production frontend build. Existing
  fs/process externalization and chunk-size warnings remain classified in review.
- `npm run test:browser`: passed actual-account Chromium reads and public-receipt
  reload/reconciliation; **not** an external-wallet signing test.
- Rust program, ABI/IDL and SBF hash remain unchanged. Public-network writes remain
  disabled. Loader/upgrade-authority metadata is now checked and shown; no devnet
  upgrade policy was selected.

Earlier dated results below are historical and describe their original versions.

---

# Classical vault interface validation — 2 November 2026

## Preservation and scope

Continued `feature/classical-vault` from its verified pushed commit
`13fa5e02eeb9e99092db1846735d3c1b341928c4`, with a clean starting working tree.
The Rust program, Cargo manifests/lockfile, Anchor configuration, generated program
IDL and all existing validator tests remain unchanged. The initial classical
vault is NOT quantum-resistant. No external deployment or public-network write
was performed.

The status page is now a real-account interface for local initialization, balance
and rent display, deposits, immutable proposals, recorded approval inspection,
wallet approval and execution. Wallet connections use Wallet Standard. Writes
are deliberately local-only, despite the retained local/devnet project label.

## Commands actually run and results

| Command / check | Result |
| --- | --- |
| Git status, branch/history inspection and `git ls-remote origin refs/heads/feature/classical-vault` | Clean starting state; local and remote matched the tested parent |
| `npm view` and exact npm installs | Verified compatible Wallet Standard and DOM-test releases; updated the real npm lockfile |
| `npm run test:validator` | **17 passed, 0 failed, 0 skipped, 0 cancelled; exit 0**, executing the unchanged compiled program on a fresh local Agave validator |
| `npm test` | **20 passed, 0 failed/skipped/cancelled; exit 0**, covering SDK, actual signature verification, wallet feature guards, interactive DOM controls and failure/confirmation states |
| `npm run build` | SDK declarations/JavaScript, full TypeScript checks and frontend production build passed |
| `npm run validator:local` | New disposable loopback validator started with the unchanged compiled program in genesis; no external deployment |
| `npm run preview --workspace @pqc-wallet/web` | Built frontend served internally on port 4173 for testing |
| `npm run test:browser` | **Passed** in system Chromium 154.0.8037.57 against actual local RPC/accounts; expected balance/recipient/one-approval state appeared, execution remained disabled and a mainnet URL was rejected |
| Compare source/ABI against tested parent | No changes to `programs/wallet`, Cargo.toml/Cargo.lock, Anchor.toml or generated program interface |
| `git diff --check` | Passed |

Pinned additions: Wallet Standard app/base/features **1.1.1**, Solana Wallet
Standard features **1.5.0**, Buffer **6.0.3**, React Testing Library **16.3.3**,
DOM Testing Library **10.4.2**, jsdom **30.1.3**, jsdom types **30.0.0**. Existing
Node 24.19.0, npm 11.9.0, React 19.3.1, TypeScript 7.0.2, Vite 8.3.5,
Anchor 1.2.2 and web3.js 1.98.4 were retained.

## Signing and frontend coverage

Tests verify all three initialization signatures cryptographically on one unchanged
message; two signatures, duplicate identities, missing/invalid signatures,
message changes, wallet rejection and expired blockhash all prevent submission.
They also verify public-RPC/changed-genesis rejection, safe integer inputs,
unsupported wallet networks, disconnected accounts, deterministic signature
retention after uncertain submission, and confirmed-failure versus RPC-uncertainty
handling. Mock RPC responses in these unit tests are not program-execution tests.

React DOM tests click important approval/execution controls: one approval cannot
execute, a repeat approval is disabled, a second distinct owner can approve,
clicking does not invent an on-chain vote, two recorded votes enable execution,
unauthorized approval is disabled, execution remains permissionless after two
approvals, expiry/consumption disable actions, and insufficient spendable funds
blocks execution. Failure/unknown/confirmed transaction results remain visible.

The Chromium smoke check sets up local accounts using disposable keys only in the
Node test process. Through the same SDK it collects three signatures, initializes,
deposits, creates a proposal and records one approval on the actual validator.
It then opens the production app and verifies real RPC state. **No key, seed,
signing fixture or test wallet is injected into the browser.** No application
backend was added. Browser storage stays empty. The screenshot and public result
JSON are retained in ignored `target/interface-browser-smoke`.

Existing validator evidence is in ignored `target/interface-validator.log` and
`target/validator-runs/1793642924942-33112`. It remains distinct from the frontend
and browser checks. None of those frontend checks replace the 17 program tests.

## Diagnosed issues and remaining limits

The first restricted test-runner invocation hit an IPC sandbox permission error;
it passed through the supported native execution path. The initial Chromium
harness queried the document before its body existed; it was fixed to await the
body. The real browser then exposed a missing global Buffer used by Anchor's
browser coder/dependencies. Added an explicit Buffer byte-serialization polyfill;
subsequent Chromium account reads passed. The jsdom test environment also needed
its own Event/CustomEvent constructors to match its window realm; the final suite
has no Wallet Standard event-dispatch error.

Actual installed wallet extensions and physical hardware devices were **not**
automated. They must advertise localnet plus legacy sign-transaction support;
unsupported wallets are rejected rather than relabeled. Three identities on one
computer are visibly labeled as demonstration, not independent device security.
No real recovery phrase or production key was requested or used.

Build warnings remain for Anchor's exported Node-only fs/process helpers being
externalized and for a bundle above 500 KB. This app never invokes Node wallet
loading; its production account-read path was checked in Chromium. The previously
recorded upstream uuid deprecation also remains. No independent audit, public
chain operation, PQC verification or production-safety claim is supplied.

No hosted preview URL is available. See `frontend-walkthrough.md` for exact local
startup, wallet requirements, test airdrops and the three-signature workflow.

---

# Stage A validation — 2 November 2026

## Branch and preservation

`feature/wallet-foundation` was verified against GitHub at
`43263b2b4d5ac21435006a826b0e32c245c7cf05`. The working tree was clean.
`feature/classical-vault` did not exist locally or remotely and was created from
that foundation, not from the README-only main branch. The README, original root
frontend and legacy program remain unchanged. No reset, merge, environment
publication or external deployment was performed.

## Program and test environment

The Rust/Anchor/frontend toolchain remains pinned to the foundation versions.
Added Anchor TypeScript client **1.2.2** and its compatible web3.js **1.98.4**
(v1 is required by this Anchor client), with exact direct pins and a real updated
npm lockfile. Rust dependencies and Cargo.lock were unchanged.

Installed **solana-test-validator 4.4.0**, source `9ef63128`, from the official
[Agave release](https://github.com/anza-xyz/agave/releases/tag/v4.4.0).
The downloaded Linux x86_64 archive was verified against its published SHA-256:
`3363f4728fe786ac7036e342a20df928aa2e3e43f807fbdce67814840538c574`.
GitHub API access returned a policy denial; the official GitHub release page and
asset downloads worked. No network-policy workaround or verification bypass was
used. The existing SBF helper is 4.5.0, with platform-tools v1.57/Rust 1.95.0;
host Rust/Cargo remain 1.99.1.

## Actual commands and results

| Command | Final observed result |
| --- | --- |
| `git ls-remote origin refs/heads/feature/wallet-foundation refs/heads/feature/classical-vault` and `git fetch origin feature/wallet-foundation` | Verified the pushed foundation and absence of the new branch |
| `git switch -c feature/classical-vault feature/wallet-foundation` | Created from the verified foundation commit |
| `npm install` with exact `@anchor-lang/core@1.2.2` and `@solana/web3.js@1.98.4` | Registry downloads succeeded; SDK dependencies and root test dev dependencies recorded in package-lock.json |
| `cargo check --locked -p wallet` / `npm run check:program` | Host compilation passed |
| `npm run build:program` | Actual SBF build, Anchor IDL generation and SDK IDL synchronization passed; also run by the validator command |
| `npm run test:validator` | **17 passed, 0 failed, 0 skipped, 0 cancelled; exit 0**. Executed the compiled program on a fresh local validator; final duration about 72 seconds |
| `npm run build` | SDK JavaScript/types, TypeScript checks including integration-test source, and React production build passed |
| `npm test` | **5 passed, 0 failed/skipped**, covering SDK boundaries/address derivation and status/UI rendering; these are separate from program execution |
| `rustup component add rustfmt --toolchain 1.99.1` and `cargo fmt --all` | Installed the matching formatter and formatted only the active Rust workspace |
| `cargo fmt --all -- --check` | Passed |
| `git diff --check` | Passed |
| Compare original files to `feature/wallet-foundation` | README, original root frontend and legacy program unchanged |
| Compare built IDL to SDK public IDL | Byte-for-byte match; five instructions present |

The final compiled `target/deploy/wallet.so` is 179,264 bytes, SHA-256
`f5cf87dbbd607aaa9d32670312eeaa889fe98256cf79349629fe2f98e96961ce`.
The program ID remains `5cLePo1rLF2qCp7Y9B6JByZjrtosDBYBtfBqv8tCjQSm`.
The validator loads this binary at local genesis and verifies it is executable.
No external program deployment command was used.

## Integration coverage

The 17 real-ledger tests cover:

- Initialization with all three distinct signing keys and exact rent funding;
  deposits increase the vault by the exact integer lamports.
- Duplicate owners and each missing initialization signer rejected on-chain.
- Noncanonical vault PDA and a wrong-owner account rejected.
- Proposer/payer get zero approvals, including when an owner is simultaneously
  proposer, rent payer and transaction fee payer; zero/one approval cannot spend.
- All three possible two-owner combinations spend the correct amount.
- Duplicate, unauthorized and unsigned approval rejected.
- Unauthorized proposal creation rejected without advancing the nonce or leaving
  the proposal account allocated.
- Recipient/amount substitution, cross-vault use, expiry and replay rejected.
- Consumed proposals persist; their rent stays funded; same-nonce reuse fails.
- Insufficient funds, u64 maximum transfer amount, deposit overflow, zero amounts,
  skipped nonce, exhausted u64 nonce and rent reserve enforcement.
- Spending exactly the deposited amount leaves the vault's rent reserve intact.
- New-recipient rent enforcement and rejection of program-owned recipients.
- Failed execution preserves vault/recipient balances and full account data.
- A valid execution followed by a failing instruction in the same transaction
  rolls back balances and the consumed marker; the proposal can then execute once.

Expected errors are transactions confirmed in the validator ledger; the harness
asserts program error logs. Signature-privilege tests remove the signer privilege
as well as omitting the signature, so they execute the program's rejection path
instead of stopping only in the client serializer. Transaction uniqueness is
ensured by a varying compute-budget instruction so replay attempts are submitted
as new transactions rather than returned as cached transaction signatures.

A public canonical genesis fixture sets `next_nonce = u64::MAX` to test overflow
without billions of transactions; another fixture deliberately has the wrong
account owner. Neither fixture represents a successful initialization path or
contains signing keys. All successful normal vault flows initialize via the real
three-signature program instruction.

Final detailed evidence is retained locally in ignored
`target/stage-a-validator-final.log` and
`target/validator-runs/1793636209998-29404/validator.log` plus its local ledger.
These generated logs/ledgers are not committed; the reproducible tests are.

## Diagnosed failures and unresolved limits

The initial validator run completed all 17 test bodies but hung during shutdown
because web3.js kept a WebSocket reconnect loop alive. That run was interrupted
and is **not** counted as a completed pass. Confirmation was changed to HTTP
status polling; the final runner terminated its own validator cleanly and exited
0 with 17/17 passing. The earlier compile used an older CpiContext constructor
shape; it was corrected to Anchor 1.2.2's program-ID argument before SBF testing.

Installation emitted an upstream `uuid@8.3.2` deprecation warning in the supported
Anchor/web3.js dependency graph. It remains locked; web3.js v3 was not substituted
for Anchor's required v1 API. This warning is not a failing integration check.

No independent audit, public devnet/mainnet deployment, hardware-wallet testing,
formal verification, browser signing-flow testing, PQC verification or production
safety claim is supplied. The UI is a status page. There are no Rust unit tests;
program behavior was tested by the separate validator suite, not a zero-test host
run. Key-generation/storage independence cannot be verified on-chain. Proposal
rent remains locked because closure/cleanup is deliberately not implemented.
The initial classical vault is NOT quantum-resistant.

---

# Historical foundation validation — 2 November 2026

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
