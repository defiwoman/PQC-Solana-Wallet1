# Development guide

## What you have

An experimental project foundation: an empty Anchor program, a small TypeScript
SDK containing public status data, and a React status page. It cannot hold or
transfer funds. The initial classical vault is NOT quantum-resistant.
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
the SDK's JavaScript/types, and bundles the web page. `test` runs three scaffold
tests, including rendering the interface. `dev` builds the SDK and serves the
React page on port **5173**. Leave that terminal running; Ctrl+C stops it.
On your own computer, open `http://localhost:5173` in a browser. If port 5173 is
occupied, stop your earlier server or choose another port intentionally.

The cloud onboarding interface does not provide a browser preview link here.
A server running inside the cloud is not your computer's localhost. To view it,
use a port-forwarding/preview feature if your coding client provides one, or run
these commands on your own computer. No wallet connection is needed.

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
The full Solana/Agave CLI is not installed or needed for this status page.

Then, from the repository root:

```sh
npm run check:program
npm run test:program
npm run build:program
```

The first command checks a host build. The second currently runs **zero Rust
unit/doc tests**, because no instructions exist. A successful zero-test run is
not wallet validation. The last command requires the separate Solana SBF build
helper and platform tools, and generates an Anchor IDL as well as a Solana binary.
The combined script runs `build:program:sbf` and `build:program:idl` separately so
Cargo's `--locked` option reaches the correct process in each command. Outputs
are `target/deploy/wallet.so`, `target/wallet.json`, and `target/wallet.ts`.
The IDL is a machine-readable program interface; it has zero instructions here.
See `docs/validation.md` for the actual results from this session.

Anchor can generate `target/deploy/wallet-keypair.json` for a local program
identity. That file is secret and ignored; only its public program address belongs
in `declare_id!` and `Anchor.toml`. A fresh checkout will not contain this key.
If Anchor reports an address mismatch, run `npm exec -- anchor keys sync` after
it has generated a fresh local program key, then rerun checks. This changes public
address configuration; it does not deploy anything. Never copy a production key
or share a recovery phrase to make a scaffold build pass.

No local validator, devnet deployment, or mainnet command is required for the
status page. No program has been deployed by this work.

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
