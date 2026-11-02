# Development

This scaffold contains a React/TypeScript frontend and an empty Anchor program.
It has no wallet connection, transfers, account state, or PQC implementation.
The existing README is preserved as the original project plan.

## Frontend

Use Node.js 22.12+ (validated with Node.js 24) and npm.

```sh
npm ci
npm run build
npm run dev
```

`npm run typecheck` checks TypeScript. There is no test suite yet.

## Anchor program

Install Rust, Anchor CLI 0.31.1 and a compatible Solana/Agave CLI including
`cargo build-sbf` separately before running:

```sh
npm run check:program
npm run build:program
```

The program module intentionally has no instructions. Its checked-in address is
a scaffold placeholder, not a deployment. Before future local deployment,
generate the program keypair locally and use `anchor keys sync` to synchronize
the public program address. Never commit signing keys. No deployment is part of
this scaffold. Keep development on localnet or devnet.
