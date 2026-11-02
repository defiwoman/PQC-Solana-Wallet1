/** Public project metadata only. This SDK cannot sign or send transactions. */
export const PROJECT_STATUS = Object.freeze({
  name: 'PQC Solana Wallet',
  notice: 'Experimental — local/devnet only.',
  security: 'The initial classical vault is NOT quantum-resistant.',
  implementation: 'Foundation scaffold. No vault, transfers, or PQC implemented.',
});

export const DEVELOPMENT_STAGES = Object.freeze([
  Object.freeze({ id: 1, title: 'Classical 2-of-3 independent-key SOL vault', status: 'Planned' }),
  Object.freeze({ id: 2, title: 'Research actual on-chain PQC verification', status: 'Not started' }),
  Object.freeze({ id: 3, title: 'Mandatory PQC authorization only if feasibility passes', status: 'Conditional' }),
] as const);
