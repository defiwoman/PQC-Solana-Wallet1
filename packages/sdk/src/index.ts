/** Public project metadata. The typed local client is exported separately as /client. */
export const PROJECT_STATUS = Object.freeze({
  name: 'PQC Solana Wallet',
  notice: 'Experimental classical multisig — local/devnet only.',
  security: 'The initial classical vault is NOT quantum-resistant.',
  implementation: 'Stage A: classical 2-of-3 SOL vault. Local validator implementation; PQC is not implemented.',
});

export const DEVELOPMENT_STAGES = Object.freeze([
  Object.freeze({ id: 1, title: 'Classical 2-of-3 independent-key SOL vault', status: 'Stage A implemented' }),
  Object.freeze({ id: 2, title: 'Research actual on-chain PQC verification', status: 'Not started' }),
  Object.freeze({ id: 3, title: 'Mandatory PQC authorization only if feasibility passes', status: 'Conditional' }),
] as const);
