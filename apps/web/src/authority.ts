import { PublicKey } from '@solana/web3.js';
import { UPGRADEABLE_LOADER, WALLET_PROGRAM_ID, verifyLocalNetwork, type Network } from '@pqc-wallet/sdk/interface';
import type { Connection } from '@solana/web3.js';

export const AUTHORITY_KEY = 'pqc-vault.approved-authority.v1';
export const AUTHORITY_HOLD_KEY = 'pqc-vault.authority-hold.v1';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface AuthorityBaseline {
  version: 1; network: 'solana:localnet'; genesisHash: string; programId: string;
  loader: 'legacy' | 'upgradeable'; expectedAuthority: string | null;
  programData: string | null; deploymentSlot: string | null;
}
export interface AuthorityState { baseline?: AuthorityBaseline; hold?: string; reviewNote?: string }

/** Only public configuration. Never derives expected authority from RPC. */
export function parseAuthorityBaseline(input: string | unknown): AuthorityBaseline {
  const value = (typeof input === 'string' ? JSON.parse(input) : input) as AuthorityBaseline;
  if (!value || value.version !== 1 || value.network !== 'solana:localnet') throw new Error('Baseline must explicitly select version 1 and solana:localnet. Public networks are disabled.');
  if (value.programId !== WALLET_PROGRAM_ID.toBase58()) throw new Error('Incorrect baseline program ID; it must match the compiled program interface.');
  if (typeof value.genesisHash !== 'string' || new PublicKey(value.genesisHash).toBase58() !== value.genesisHash) throw new Error('Invalid baseline genesis hash.');
  if (value.loader === 'legacy') {
    if (value.expectedAuthority !== null || value.programData !== null || value.deploymentSlot !== null) throw new Error('Legacy local fixture baseline must explicitly expect no upgrade authority.');
  } else if (value.loader === 'upgradeable') {
    if (value.expectedAuthority !== null && (typeof value.expectedAuthority !== 'string' || new PublicKey(value.expectedAuthority).toBase58() !== value.expectedAuthority)) throw new Error('Invalid expected authority public key.');
    if (typeof value.deploymentSlot !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value.deploymentSlot) || BigInt(value.deploymentSlot) > (1n << 64n) - 1n) throw new Error('Expected deployment slot must be an exact u64 string.');
    const canonical = PublicKey.findProgramAddressSync([WALLET_PROGRAM_ID.toBuffer()], UPGRADEABLE_LOADER)[0].toBase58();
    if (value.programData !== canonical) throw new Error('Incorrect baseline ProgramData address.');
  } else throw new Error('Unsupported baseline loader.');
  return { version: 1, network: value.network, genesisHash: value.genesisHash, programId: value.programId,
    loader: value.loader, expectedAuthority: value.expectedAuthority, programData: value.programData, deploymentSlot: value.deploymentSlot };
}
export function assertAuthorityMatches(baseline: AuthorityBaseline, observed: Network) {
  if (observed.programId !== baseline.programId || observed.genesis !== baseline.genesisHash) throw new Error('Security hold: observed network/program does not match the approved baseline.');
  const deployment = observed.deployment;
  if (!deployment) throw new Error('Security hold: upgrade authority cannot be verified.');
  if ((deployment.authority ?? null) !== baseline.expectedAuthority
      || (deployment.programData ?? null) !== baseline.programData
      || (deployment.slot ?? null) !== baseline.deploymentSlot
      || deployment.kind !== (baseline.expectedAuthority === null ? 'immutable' : 'upgradeable')) {
    throw new Error('Security hold: upgrade authority or deployment differs from the approved baseline. Review is required; Verify network does not approve a replacement.');
  }
}
export class AuthorityStore {
  constructor(private storage: Store) {}
  read(): AuthorityState {
    const raw = this.storage.getItem(AUTHORITY_KEY);
    const record = raw ? JSON.parse(raw) : undefined;
    const hold = this.storage.getItem(AUTHORITY_HOLD_KEY);
    return { ...(record ? { baseline: parseAuthorityBaseline(record.baseline), reviewNote: String(record.reviewNote) } : {}),
      ...(hold ? { hold } : {}) };
  }
  block(reason: string) {
    if (!this.storage.getItem(AUTHORITY_HOLD_KEY)) this.storage.setItem(AUTHORITY_HOLD_KEY, reason);
    return this.read();
  }
  approve(input: string, confirmation: { reviewed: boolean; note: string }) {
    const baseline = parseAuthorityBaseline(input);
    if (!confirmation.reviewed || confirmation.note.trim().length < 10) throw new Error('Explicit independent review and a review note are required to approve a baseline.');
    const raw = JSON.stringify({ baseline, reviewNote: confirmation.note.trim() });
    this.storage.setItem(AUTHORITY_KEY, raw);
    if (this.storage.getItem(AUTHORITY_KEY) !== raw) throw new Error('Approved baseline could not be persisted. Signing remains blocked.');
    this.storage.removeItem(AUTHORITY_HOLD_KEY);
    if (this.storage.getItem(AUTHORITY_HOLD_KEY)) throw new Error('Authority hold could not be cleared.');
    return this.read();
  }
  requireMatch(observed: Network) {
    const state = this.read();
    if (!state.baseline) throw new Error('Approve an independently reviewed public authority baseline before signing.');
    try { assertAuthorityMatches(state.baseline, observed); }
    catch (cause) { this.block((cause as Error).message); throw cause; }
    if (state.hold) throw new Error(`Security hold pending review: ${state.hold}`);
  }
}
export async function verifyExpectedAuthority(connection: Connection, store: AuthorityStore): Promise<Network> {
  try {
    const observed = await verifyLocalNetwork(connection);
    store.requireMatch(observed);
    return observed;
  } catch (cause) {
    store.block(`Authority verification unavailable or mismatched: ${cause instanceof Error ? cause.message : 'RPC failure'}`);
    throw cause;
  }
}
