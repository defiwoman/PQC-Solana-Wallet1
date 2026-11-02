import { BN, Program, utils } from '@anchor-lang/core';
import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, SendTransactionError, type TransactionInstruction } from '@solana/web3.js';
import { WALLET_PROGRAM_ID, U64_MAX, vaultAddress, proposalAddress } from './client.js';
import idl from './generated/wallet.json' with { type: 'json' };
import type { Wallet } from './generated/wallet.js';

export { WALLET_PROGRAM_ID, vaultAddress, proposalAddress };
export const LOCAL_CHAIN = 'solana:localnet' as const;
// Public-chain genesis prefixes also match the CAIP/Wallet Standard references.
const PUBLIC_GENESIS = [
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // mainnet-beta
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // devnet
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQ', // testnet prefix
];
export const LEGACY_LOADER = new PublicKey('BPFLoader2111111111111111111111111111111111');
export const UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
export interface Deployment { kind: 'immutable' | 'upgradeable'; authority?: string; programData?: string; slot?: string }
export interface Network { endpoint: string; genesis: string; deployment?: Deployment; programId?: string }
export interface PendingReceipt { signature: string; endpoint: string; genesis: string; blockhash: string; lastValidBlockHeight: number }
export interface SignerConnection {
  address: string;
  label: string;
  sign(transaction: Uint8Array): Promise<Uint8Array>;
}
export interface VaultView {
  address: string; owners: string[]; vaultId: bigint; nextNonce: bigint;
  balance: bigint; rent: bigint; spendable: bigint;
}
export interface ProposalView {
  address: string; vault: string; nonce: bigint; recipient: string; amount: bigint;
  expirySlot: bigint; approvals: number; executed: boolean;
}
export interface Snapshot { vault: VaultView; proposals: ProposalView[]; slot: bigint }
export interface Progress { phase: 'signing' | 'submitting' | 'confirming' | 'confirmed' | 'failed' | 'unknown'; message: string; signature?: string; receipt?: PendingReceipt }

export function parseU64(text: string, positive = false): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new Error('Enter a whole number of lamports, slots or nonce units. Decimals are not accepted.');
  const value = BigInt(text);
  if (value > U64_MAX || (positive && value === 0n)) throw new Error('Value must fit in u64 and be positive for amounts.');
  return value;
}
export function formatSOL(lamports: bigint): string {
  return `${lamports / 1_000_000_000n}.${(lamports % 1_000_000_000n).toString().padStart(9, '0')}`;
}
export function validateOwners(owners: string[]): PublicKey[] {
  if (owners.length !== 3 || new Set(owners).size !== 3) throw new Error('Select three distinct authorization identities.');
  const keys = owners.map(owner => new PublicKey(owner));
  if (keys.some(key => !PublicKey.isOnCurve(key.toBytes()))) throw new Error('Authorization identities must be on-curve Ed25519 public keys.');
  return keys;
}
export function localEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Wrong network: use a loopback local-validator RPC URL without credentials. Public-network transactions are disabled.');
  }
  return url.toString();
}
export function readClient(connection: Connection) {
  return new Program<Wallet>(idl as unknown as Wallet, { connection });
}
export class NetworkVerificationError extends Error {}
export async function verifyLocalNetwork(connection: Connection, expectedGenesis?: string, expectedDeployment?: Deployment): Promise<Network> {
  try {
    const endpoint = localEndpoint(connection.rpcEndpoint);
    const genesis = await connection.getGenesisHash();
    if (PUBLIC_GENESIS.some(prefix => genesis.startsWith(prefix)) || (expectedGenesis && genesis !== expectedGenesis)) {
      throw new Error('Wrong network: the RPC is a public chain or the local validator was replaced. Reconnect and inspect the network.');
    }
    const program = await connection.getAccountInfo(WALLET_PROGRAM_ID, 'confirmed');
    if (!program?.executable) throw new Error('Vault program is not loaded on this local validator. Start the documented local fixture.');
    let deployment: Deployment;
    if (program.owner.equals(LEGACY_LOADER)) {
      deployment = { kind: 'immutable' };
    } else if (program.owner.equals(UPGRADEABLE_LOADER)) {
      if (program.data.length !== 36 || program.data.readUInt32LE(0) !== 2) throw new Error('Invalid upgradeable Program account.');
      const dataAddress = new PublicKey(program.data.subarray(4, 36));
      const canonical = PublicKey.findProgramAddressSync([WALLET_PROGRAM_ID.toBuffer()], UPGRADEABLE_LOADER)[0];
      if (!canonical.equals(dataAddress)) throw new Error('Noncanonical ProgramData relationship.');
      const data = await connection.getAccountInfo(dataAddress, 'confirmed');
      if (!data || !data.owner.equals(UPGRADEABLE_LOADER) || data.data.length < 45 || data.data.readUInt32LE(0) !== 3 || data.data[12] > 1) {
        throw new Error('Invalid upgradeable ProgramData account.');
      }
      deployment = { kind: data.data[12] === 1 ? 'upgradeable' : 'immutable', programData: dataAddress.toBase58(),
        slot: data.data.readBigUInt64LE(4).toString(), ...(data.data[12] === 1 ? { authority: new PublicKey(data.data.subarray(13, 45)).toBase58() } : {}) };
    } else {
      throw new Error('Unexpected program loader owner. Reverify the local program.');
    }
    if (expectedDeployment && (['kind', 'authority', 'programData', 'slot'] as const).some(field => expectedDeployment[field] !== deployment[field])) {
      throw new Error('Program deployment or upgrade authority changed. Reverify its trust before signing.');
    }
    return { endpoint, genesis, deployment, programId: WALLET_PROGRAM_ID.toBase58() };
  } catch (cause) {
    throw new NetworkVerificationError(cause instanceof Error ? cause.message : 'Network/authority verification unavailable.');
  }
}
const exact = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('RPC returned a balance outside the exact safe-integer range. No rounded balance will be shown.');
  return BigInt(value);
};
export async function loadSnapshot(connection: Connection, address: string): Promise<Snapshot> {
  const key = new PublicKey(address);
  const client = readClient(connection);
  const info = await connection.getAccountInfo(key, 'confirmed');
  if (!info || !info.owner.equals(WALLET_PROGRAM_ID)) throw new Error('Vault was not found or has the wrong program owner.');
  const state = client.coder.accounts.decode('vault', info.data) as { owners: PublicKey[]; vaultId: BN; nextNonce: BN };
  const owners = state.owners.map(owner => owner.toBase58());
  validateOwners(owners);
  const vaultId = BigInt(state.vaultId.toString());
  if (!vaultAddress(state.owners[0], vaultId).equals(key)) throw new Error('Vault address is not the canonical PDA.');
  const balance = exact(info.lamports);
  const rent = exact(await connection.getMinimumBalanceForRentExemption(info.data.length, 'confirmed'));
  const accounts = await client.account.transferProposal.all([{ memcmp: { offset: 8, bytes: address } }]);
  const proposals = accounts.map(({ publicKey, account }) => {
    const nonce = BigInt(account.nonce.toString());
    if (!account.vault.equals(key) || !proposalAddress(key, nonce).equals(publicKey) || account.approvals > 7) {
      throw new Error('RPC returned an invalid proposal relationship or approval mask.');
    }
    return { address: publicKey.toBase58(), vault: address, nonce, recipient: account.recipient.toBase58(),
      amount: BigInt(account.amount.toString()), expirySlot: BigInt(account.expirySlot.toString()),
      approvals: account.approvals, executed: account.executed };
  }).sort((a, b) => a.nonce < b.nonce ? -1 : a.nonce > b.nonce ? 1 : 0);
  return { vault: { address, owners, vaultId, nextNonce: BigInt(state.nextNonce.toString()), balance, rent,
    spendable: balance > rent ? balance - rent : 0n }, proposals, slot: exact(await connection.getSlot('confirmed')) };
}
export function approvalCount(mask: number) { return [0, 1, 2].filter(index => (mask & (1 << index)) !== 0).length; }
export function actionState(snapshot: Snapshot, proposal: ProposalView, activeAddress: string | undefined) {
  const index = snapshot.vault.owners.indexOf(activeAddress ?? '');
  const expired = snapshot.slot >= proposal.expirySlot;
  const count = approvalCount(proposal.approvals);
  const alreadyApproved = index >= 0 && (proposal.approvals & (1 << index)) !== 0;
  const common = proposal.executed ? 'Already executed' : expired ? 'Expired proposal' : '';
  return {
    count, expired, alreadyApproved,
    approveReason: common || (index < 0 ? 'Unauthorized wallet' : alreadyApproved ? 'Already approved by this wallet' : ''),
    executeReason: common || (count < 2 ? 'Two distinct approvals required' : proposal.amount > snapshot.vault.spendable ? 'Insufficient spendable SOL' : !activeAddress ? 'Connect a fee-paying wallet' : ''),
  };
}
const bn = (value: bigint) => new BN(parseU64(value.toString()).toString());
export async function initializeInstruction(connection: Connection, owners: string[], vaultId: bigint) {
  const keys = validateOwners(owners);
  return readClient(connection).methods.initializeVault(bn(vaultId)).accountsStrict({
    vault: vaultAddress(keys[0], vaultId), payer: keys[0], ownerA: keys[0], ownerB: keys[1], ownerC: keys[2], systemProgram: SystemProgram.programId,
  }).instruction();
}
export async function depositInstruction(connection: Connection, vault: string, depositor: string, amount: bigint) {
  parseU64(amount.toString(), true);
  return readClient(connection).methods.deposit(bn(amount)).accountsStrict({ vault: new PublicKey(vault), depositor: new PublicKey(depositor), systemProgram: SystemProgram.programId }).instruction();
}
export async function proposalInstruction(connection: Connection, snapshot: Snapshot, proposer: string, recipient: string, amount: bigint, expiry: bigint) {
  parseU64(amount.toString(), true);
  if (!snapshot.vault.owners.includes(proposer)) throw new Error('Unauthorized wallet: only an owner can propose.');
  if (expiry <= snapshot.slot) throw new Error('Expired proposal: expiry must be a future slot.');
  const vault = new PublicKey(snapshot.vault.address);
  return readClient(connection).methods.createProposal(bn(snapshot.vault.nextNonce), new PublicKey(recipient), bn(amount), bn(expiry)).accountsStrict({
    vault, proposal: proposalAddress(vault, snapshot.vault.nextNonce), proposer: new PublicKey(proposer), payer: new PublicKey(proposer), systemProgram: SystemProgram.programId,
  }).instruction();
}
export async function approvalInstruction(connection: Connection, proposal: ProposalView, authority: string) {
  return readClient(connection).methods.approve().accountsStrict({ vault: new PublicKey(proposal.vault), proposal: new PublicKey(proposal.address), authority: new PublicKey(authority) }).instruction();
}
export async function executeInstruction(connection: Connection, proposal: ProposalView) {
  return readClient(connection).methods.executeTransfer(bn(proposal.amount)).accountsStrict({ vault: new PublicKey(proposal.vault), proposal: new PublicKey(proposal.address), recipient: new PublicKey(proposal.recipient) }).instruction();
}

/** Every wallet signs the same message. Only public signature bytes enter the app. */
export async function collectSignatures(transaction: Transaction, signers: readonly SignerConnection[], progress: (message: string) => void) {
  const message = transaction.serializeMessage();
  if (new Set(signers.map(signer => signer.address)).size !== signers.length) throw new Error('Signing identities must be distinct.');
  for (const [index, signer] of signers.entries()) {
    progress(`Signature ${index + 1} of ${signers.length}: ${signer.label} (${signer.address})`);
    const signed = Transaction.from(await signer.sign(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })));
    if (!Buffer.from(signed.serializeMessage()).equals(message)) throw new Error('Wallet changed the transaction message. All signatures were discarded.');
    const ownSignature = signed.signatures.find(entry => entry.publicKey.toBase58() === signer.address)?.signature;
    if (!ownSignature || !signed.verifySignatures(false)) throw new Error('Wallet returned a missing or invalid authorization signature.');
    // Some wallets omit earlier signatures. Merge verified signatures on the fixed message.
    for (const entry of signed.signatures) if (entry.signature) transaction.addSignature(entry.publicKey, entry.signature);
  }
  if (!Buffer.from(transaction.serializeMessage()).equals(message)) throw new Error('Complete signed message changed. Discard the signing round.');
  if (!transaction.verifySignatures(true)) throw new Error('All required initialization/transaction signatures must be present.');
  return transaction.serialize({ requireAllSignatures: true, verifySignatures: true });
}
export function describeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : JSON.stringify(error);
  const logs = error && typeof error === 'object' && 'logs' in error ? JSON.stringify(error.logs) : '';
  const text = `${detail} ${logs}`;
  if (/user.*reject|wallet.*reject|signature.*reject|declin|4001|cancelled/i.test(text)) return 'Wallet signature rejected. Nothing was submitted; try again when ready.';
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  const custom = /"Custom":\s*(\d+)/.exec(text);
  const code = hex ? parseInt(hex[1], 16) : custom ? Number(custom[1]) : undefined;
  const known = idl.errors.find(item => item.code === code || text.includes(item.name));
  if (known) return known.msg;
  if (/insufficient|rent/i.test(text)) return 'Insufficient test SOL for the amount, rent reserve or transaction fee.';
  if (/fetch|networkerror|timeout|ECONN|429|503/i.test(text)) return 'RPC unavailable. Check the local validator and connection; balances and approvals were not updated.';
  return detail || 'Operation failed. Refresh the account state before trying again.';
}
export class ConfirmedTransactionFailure extends Error {}
export async function signatureStatus(connection: Connection, signature: string): Promise<'confirmed' | 'pending'> {
  const state = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
  // A processed or merely confirmed error can disappear on a fork. Only a
  // finalized landed failure may unlock a replacement payment.
  if (state?.err) {
    if (state.confirmationStatus === 'finalized') throw new ConfirmedTransactionFailure(describeError(state.err));
    return 'pending';
  }
  return state?.confirmationStatus === 'confirmed' || state?.confirmationStatus === 'finalized' ? 'confirmed' : 'pending';
}
export async function submitInstructions(connection: Connection, network: Network, instructions: TransactionInstruction[], signers: readonly SignerConnection[], progress: (state: Progress) => void, ensureCurrent = () => {}) {
  ensureCurrent();
  if (signers.length === 0) throw new Error('Connect a signing wallet.');
  await verifyLocalNetwork(connection, network.genesis, network.deployment);
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ ...latest, feePayer: new PublicKey(signers[0].address) }).add(...instructions);
  const bytes = await collectSignatures(transaction, signers, message => { ensureCurrent(); progress({ phase: 'signing', message }); });
  await verifyLocalNetwork(connection, network.genesis, network.deployment);
  if (!(await connection.isBlockhashValid(latest.blockhash, { commitment: 'confirmed' })).value) {
    throw new Error('Signing blockhash expired. Rebuild the transaction and collect every signature again. Nothing was submitted.');
  }
  ensureCurrent();
  const signature = utils.bytes.bs58.encode(transaction.signature!);
  const receipt: PendingReceipt = { signature, endpoint: localEndpoint(connection.rpcEndpoint), genesis: network.genesis,
    blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight };
  // The application persists this PUBLIC receipt synchronously in the callback.
  // If persistence fails, this call throws before sendRawTransaction is reached.
  progress({ phase: 'submitting', message: 'Submitting signed transaction to the local validator.', signature, receipt });
  try {
    const result = await connection.sendRawTransaction(bytes, { skipPreflight: false, maxRetries: 0 });
    if (result !== signature) throw new Error('RPC returned an unexpected transaction signature.');
  } catch (error) {
    if (error instanceof SendTransactionError && /simulation failed/i.test(error.message)) {
      progress({ phase: 'failed', message: describeError(error), signature });
    } else {
      progress({ phase: 'unknown', message: 'Submission outcome unknown. Check this signature before retrying; do not send a duplicate payment.', signature });
    }
    return;
  }
  progress({ phase: 'confirming', message: 'Waiting for local-validator confirmation.', signature });
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await signatureStatus(connection, signature) === 'confirmed') {
        progress({ phase: 'confirmed', message: 'Transaction confirmed by the local validator.', signature, receipt });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    progress({ phase: 'unknown', message: 'Confirmation timed out. Check the signature before retrying.', signature });
  } catch (error) {
    // A confirmed on-chain failure is final; an unavailable RPC leaves the result unknown.
    progress({ phase: error instanceof ConfirmedTransactionFailure ? 'failed' : 'unknown', message: describeError(error), signature });
  }
}
