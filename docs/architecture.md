# Wallet foundation architecture

## Current implementation

This is a scaffold, not a working wallet. There are no instruction handlers,
vault accounts, balances, signing flows, transfers, or PQC verification.
The initial classical vault is NOT quantum-resistant.

- `programs/wallet`: an empty Rust/Anchor program module.
- `packages/sdk`: a TypeScript library of public project status and roadmap data.
  It deliberately has no RPC client or transaction API. Add an Anchor TypeScript
  client matching the Rust version only when an actual IDL/API exists.
- `apps/web`: a React/TypeScript status page consuming the SDK. It does not
  connect to a wallet, request keys, or contact a Solana RPC server.
- `tests`: SDK metadata and rendered-interface checks, not on-chain tests.
- `Cargo.lock` and `package-lock.json`: package-manager-generated dependency
  resolutions. Generated JavaScript, IDLs, binaries, and signing keys stay local.

The original root frontend files and `programs/pqc-solana-wallet` remain intact
as earlier scaffold material. npm targets the new web workspace; Cargo and Anchor
explicitly target only `programs/wallet`.

## Stage 1: classical vault (planned)

Design a program-controlled SOL vault requiring approval by two of three distinct,
independently generated signing keys. Three accounts derived from one recovery
phrase are not three independent recovery domains. The interface must continue
to state that the vault is NOT quantum-resistant.

Before implementing movement of funds, specify account ownership, vault/proposal
addresses, authorized signer checks, duplicate-signer rejection, proposal fields,
nonce/replay protection, expiration, network/program binding, and atomic execution.
Approvals must bind the destination, amount, vault, and exact proposal. Count each
owner at most once, and consume a proposal at most once. Authority rotation and
program upgrades need an explicit security policy rather than implicit bypasses.
These are design requirements, not implemented guarantees.

## Stage 2: actual on-chain PQC feasibility (research only)

Choose candidate schemes with a documented security rationale. Measure public-key
and signature sizes, transaction/account data limits, compute units, memory/stack,
verification cost, and invalid-input behavior on the actual Solana runtime.
Include reproducible positive and negative vectors and an explicit pass/fail gate.
A browser or server verification demo is not on-chain verification. A hash or
reference to a signature is not proof that a signature was verified.

## Stage 3: mandatory PQC (conditional)

Proceed only after feasibility passes. Specify exactly which operations require
PQC and enforce it on-chain, including recovery/rotation and upgrade paths.
Classical-only alternate paths must not silently bypass that requirement. A new
threat model and review are required before making quantum-resistance claims.

Nothing in this scaffold establishes those properties or supports mainnet use.
