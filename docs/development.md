# Development guide

## What you have

An experimental classical 2-of-3 SOL vault, a typed TypeScript SDK, and a React
wallet interface. The compiled program supports local SOL transfers after two
distinct approvals; the interface connects external Wallet Standard signers and
reads actual accounts. See [the beginner walkthrough](frontend-walkthrough.md).
Experimental classical multisig — local/devnet only.
The initial classical vault is NOT quantum-resistant.
The README is preserved as the original project plan.

## Frontend: quickest start

Open a terminal in `PQC-Solana-Wallet1` and use Node.js **24.19.0** and npm
**11.9.0** (the versions used here). `.nvmrc` records the Node version.

```sh
npm ci
npm run build
npm test
npm run dev
```

`npm ci` installs the versions in the lockfile. `build` checks TypeScript, emits
the SDK's JavaScript/types, and bundles the web page. `test` runs SDK/UI unit checks, including rendering the interface; these do not
execute a Solana program. `dev` builds the SDK and serves the
React page on port **5173**. Leave that terminal running; Ctrl+C stops it.
On your own computer, open `http://localhost:5173` in a browser. If port 5173 is
occupied, stop your earlier server or choose another port intentionally.

The cloud onboarding interface does not provide a browser preview link here.
A server running inside the cloud is not your computer's localhost. To view it,
use a port-forwarding/preview feature if your coding client provides one, or run
these commands on your own computer. Wallet connections are needed only for signing actions, not reading a vault.

After changing SDK source while the frontend is running, run `npm run build:sdk`
again. To serve the production bundle, first build, then run:

```sh
npm run preview --workspace @pqc-wallet/web
```

That server uses port 4173. Generated SDK output is in `packages/sdk/dist`;
frontend output is in `apps/web/dist`. Both are ignored by Git.

## Rust and Anchor

Rust **1.99.1** is pinned by `rust-toolchain.toml`. Install Rust through its
[official installer](https://www.rust-lang.org/tools/install); rustup will select
the pinned version when you enter this repository. Anchor CLI and `anchor-lang`
are both pinned to **1.2.2**. The npm CLI distribution used here is for Linux x86_64;
on other platforms install the same Anchor version using the official AVM route.

In this cloud session Rust was installed outside the repository. In each new
cloud terminal activate it with:

```sh
export CARGO_HOME=/workspace/wallet-toolchain/cargo
export RUSTUP_HOME=/workspace/wallet-toolchain/rustup
export PATH="$CARGO_HOME/bin:$PATH"
```

The official SBF build helper used here is **cargo-build-sbf 4.5.0**. Install it
with Cargo if it is missing (this was run successfully in this session):

```sh
cargo install cargo-build-sbf --version 4.5.0 --locked -j 3
```

The program build script pins **platform-tools v1.57**, which Anchor 1.2.2 uses
by default. These tools include their own **Rust 1.95.0** compiler for Solana;
the host Rust pin remains 1.99.1. Platform tools are downloaded on the first
Solana build. An SBF compiler builds programs; it is not a validator or deployment.
The full **Agave 4.4.0** CLI and local validator were also installed for Stage A
from its official GitHub release after verifying the published SHA-256. They are
not needed just to render the page; account reads and signing need the local validator.

Then, from the repository root:

```sh
npm run check:program
npm run test:program
npm run build:program
```

The first command checks a host build. The second currently runs **zero Rust
unit/doc tests**; the meaningful program coverage is in the separate validator
suite below. A successful zero-test run is not wallet validation. The last command requires the separate Solana SBF build
helper and platform tools, and generates an Anchor IDL as well as a Solana binary.
The combined script runs `build:program:sbf` and `build:program:idl` separately so
Cargo's `--locked` option reaches the correct process in each command. Outputs
are `target/deploy/wallet.so`, `target/wallet.json`, and `target/wallet.ts`.
The IDL is a machine-readable program interface with five Stage A instructions.
The build copies its public JSON and TypeScript type into
`packages/sdk/src/generated`; keep these public files synchronized and tracked.
The generated types contain no signing keys.
See `docs/validation.md` for the actual results from this session.

Anchor can generate `target/deploy/wallet-keypair.json` for a local program
identity. That file is secret and ignored; only its public program address belongs
in `declare_id!` and `Anchor.toml`. A fresh checkout will not contain this key.
If Anchor reports an address mismatch, run `npm exec -- anchor keys sync` after
it has generated a fresh local program key, then rerun checks. This changes public
address configuration; it does not deploy anything. Never copy a production key
or share a recovery phrase to make a scaffold build pass.

## Real local-validator tests

Install Agave 4.4.0 through its [official release](https://github.com/anza-xyz/agave/releases/tag/v4.4.0)
and verify the archive's published SHA-256 before extracting. Add its `bin` folder
to PATH. In this cloud session, after activating Rust above:

```sh
export PATH="/workspace/wallet-toolchain/agave-v4.4.0/solana-release/bin:$PATH"
solana-test-validator --version
npm run test:validator
```

This single command builds the actual program, rebuilds the SDK, launches its own
validator on loopback, loads the compiled binary into that local genesis, and
runs signed-transaction integration tests. It does not use your Solana config,
read your wallet, connect to public RPC, or run an external deployment. Test keys
are newly generated in memory; local airdrops have no real value. Let it finish
before closing the terminal. No wallet recovery phrase is needed.

Logs and the temporary validator ledger are kept under ignored
`target/validator-runs/<run-id>`. The runner stops only the validator it started.
If the validator binary is absent, startup fails; tests are not silently skipped.
Direct command execution may require the cloud client's supported sandbox
escalation because native executables and loopback sockets are restricted.

The suite includes valid flows, missing/duplicate signers, each owner pair,
unauthorized and repeat approvals, recipient/amount/cross-vault substitution,
expiry, replay, insufficient funds, rent reserves, u64 boundaries, and atomic
rollback. A public genesis fixture sets the canonical vault nonce to u64::MAX
so overflow can be tested without creating 2^64 proposals; another fixture has
intentionally wrong account ownership. These fixtures contain no signing keys
and are not production initialization paths.

Only local genesis loading was used. Nothing was deployed to devnet or mainnet.
Rendering the page needs no validator; reading accounts and submitting transactions
requires the documented local validator. `npm run validator:local` starts a
disposable instance with the compiled program in local genesis. See
`frontend-walkthrough.md` for wallet requirements, airdrops and three-signature
initialization. Public-network transactions remain disabled.

## Calling the local program

Import `createWalletClient`, `vaultAddress`, `proposalAddress` and `u64LE` from
`@pqc-wallet/sdk/client`. The generated client's methods are `initializeVault`,
`deposit`, `createProposal`, `approve`, and `executeTransfer`. Read the actual
transactions in `tests/integration/vault.test.ts` as local examples.

Use bigint or Anchor BN for u64 values, not floating-point SOL or rounded numbers.
Amounts are integer **lamports** (1 SOL = 1,000,000,000 lamports). Initialization
needs signatures from all three authorization keys. Proposals start with zero
approvals; any two owners must approve in separate or combined transactions.
Execution is permissionless after approval but cannot change the recipient or
amount. The expiry slot itself is expired. Rent cannot be withdrawn, and proposal
accounts remain after execution. Read `architecture.md` before changing custody
or transfer logic.

## Version sources and compatibility

Versions were checked on 2 November 2026 against official project sources and
registry metadata. Documentation web hosts returned HTTP 403, so official GitHub
sources were used instead; package downloads succeeded through the session proxy.

| Component | Exact version | Evidence |
| --- | --- | --- |
| Anchor Rust + CLI | 1.2.2 | [Official release changelog](https://github.com/otter-sec/anchor/blob/v1.2.2/CHANGELOG.md), crates.io index, npm metadata |
| Solana SBF helper / platform tools | 4.5.0 / v1.57 | crates.io package and `cargo-build-sbf --version`; [Anchor platform-tools map](https://github.com/otter-sec/anchor/blob/v1.2.2/avm/platform-tools-map.toml) |
| Rust | 1.99.1 | [Official stable release manifest](https://static.rust-lang.org/dist/channel-rust-stable.toml); Anchor 1.2.2 declares Rust minimum 1.89 |
| React + React DOM | 19.3.1 | [Official React version documentation](https://github.com/reactjs/react.dev/blob/main/src/content/versions.md), npm metadata and matching peer requirement |
| Vite | 8.3.5 | [Official getting-started guide](https://github.com/vitejs/vite/blob/main/docs/guide/index.md), npm engine metadata |
| Vite React plugin | 6.2.1 | npm peer metadata explicitly supports Vite 8 |
| TypeScript | 7.0.2 | [Official installation instructions](https://github.com/microsoft/TypeScript/blob/main/README.md), npm stable metadata |
| tsx | 4.23.15 | npm stable and engine metadata |
| Node type definitions | 24.19.2 | npm metadata for the installed Node major |
| React / React DOM types | 19.3.0 | npm metadata matching React major/minor |

Node 24.19.0 satisfies Vite/plugin's `^20.19.0 || >=22.12.0` requirement and tsx's
Node 18+ requirement. Direct versions are exact in manifests; transitive versions
and integrity data are captured by npm/Cargo-generated lockfiles. Keep both
lockfiles tracked. Use package managers to update them rather than editing them.

## Existing scaffold material

The original `src`, root `index.html`, root `vite.config.ts`, and
`programs/pqc-solana-wallet` are retained, but are not active build targets.
Use the commands above for the new workspace layout. Historical instructions in
`DEVELOPMENT.md` refer to the earlier scaffold and its older Anchor version.
