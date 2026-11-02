import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, PublicKey, Transaction, Connection } from '@solana/web3.js';
import { utils } from '@anchor-lang/core';
import { collectSignatures, initializeInstruction, signatureStatus, submitInstructions, verifyLocalNetwork, WALLET_PROGRAM_ID,
  LEGACY_LOADER, UPGRADEABLE_LOADER, type Progress, type PendingReceipt } from '@pqc-wallet/sdk/interface';
import { SignatureQueue } from '../apps/web/src/signing';
import { TransactionJournal, PENDING_KEY, withTransactionLock } from '../apps/web/src/journal';
import { signerFor, type WalletIdentity } from '../apps/web/src/wallets';

// Development-only keys in Node test memory; no app/backend/browser signing keys.
const keys = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
const addresses = keys.map(key => key.publicKey.toBase58());
const endpoint = 'http://127.0.0.1:8899/';
const genesis = 'local-test-genesis';
const hash = () => Keypair.generate().publicKey.toBase58();
async function fixture() {
  const instruction = await initializeInstruction(new Connection(endpoint), addresses, 9n);
  const transaction = new Transaction({ recentBlockhash: hash(), feePayer: keys[0].publicKey }).add(instruction);
  return { instruction, transaction };
}
function signed(bytes: Uint8Array, key = keys[0]) {
  const tx = Transaction.from(bytes); for (const entry of tx.signatures) entry.signature = null;
  tx.partialSign(key); return tx.serialize({ requireAllSignatures: false });
}
function rpc(overrides = {}) {
  return { rpcEndpoint: endpoint, getGenesisHash: async () => genesis,
    getAccountInfo: async () => ({ executable: true, owner: LEGACY_LOADER, data: Buffer.alloc(0) }),
    getLatestBlockhash: async () => ({ blockhash: hash(), lastValidBlockHeight: 100 }),
    isBlockhashValid: async () => ({ value: true }), ...overrides } as unknown as Connection;
}
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const receipt = (): PendingReceipt => ({ endpoint, genesis, signature: '3'.repeat(88), blockhash: hash(), lastValidBlockHeight: 100 });

test('processed and confirmed errors stay pending; only finalized errors unlock failure handling', async () => {
  let status = { confirmationStatus: 'processed', err: { InstructionError: [0, { Custom: 6013 }] } };
  const connection = rpc({ getSignatureStatuses: async () => ({ value: [status] }) });
  assert.equal(await signatureStatus(connection, 'public-signature'), 'pending');
  status = { ...status, confirmationStatus: 'confirmed' };
  assert.equal(await signatureStatus(connection, 'public-signature'), 'pending');
  status = { ...status, confirmationStatus: 'finalized' };
  await assert.rejects(signatureStatus(connection, 'public-signature'), /insufficient/i);
});

test('account switching keeps earlier signatures and uses the live WalletAccount object', async () => {
  const { transaction } = await fixture();
  const accounts = keys.map(key => ({ address: key.publicKey.toBase58(), publicKey: key.publicKey.toBytes(),
    chains: ['solana:localnet'], features: ['solana:signTransaction'] }));
  let requested: string | undefined;
  const queue = new SignatureQueue(request => { requested = request?.address; });
  let current = 0;
  const wallet = { accounts: [accounts[0]], chains: ['solana:localnet'], features: {
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], signTransaction: async ({ account, transaction: bytes }: { account: object; transaction: Uint8Array }) => {
      assert.equal(account, wallet.accounts[0], 'must pass current account metadata, not stale selection');
      return [{ signedTransaction: signed(bytes, keys[current]) }];
    } },
  } };
  const signers = addresses.map((address, index) => ({ address, label: `Owner ${index + 1}`, sign: (bytes: Uint8Array) => queue.request(address, bytes) }));
  const collection = collectSignatures(transaction, signers, () => {});
  for (let index = 0; index < 3; index++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requested, addresses[index]);
    current = index;
    // Only one account is exposed at a time. Earlier owners can disappear.
    wallet.accounts = [{ ...accounts[index] }];
    const identity = { wallet, account: accounts[index], address: addresses[index], label: 'Node fixture', id: String(index) } as unknown as WalletIdentity;
    await queue.sign(addresses[index], bytes => signerFor(identity).sign(bytes));
  }
  const result = Transaction.from(await collection);
  assert.equal(result.signatures.length, 3); assert(result.verifySignatures(true));
});

test('cancelling an initialization defeats a late wallet response', async () => {
  const queue = new SignatureQueue(() => {});
  const pending = queue.request(addresses[0], new Uint8Array([1]));
  const rejection = assert.rejects(pending, /cancelled/);
  let release!: (bytes: Uint8Array) => void;
  const signing = queue.sign(addresses[0], () => new Promise(resolve => { release = resolve; }));
  queue.cancel(); release(new Uint8Array([2])); await signing; await rejection;
});

test('the complete message is checked after the final wallet response', async () => {
  const { transaction } = await fixture();
  const signers = keys.map((key, index) => ({ address: addresses[index], label: 'Node fixture', sign: async (bytes: Uint8Array) => {
    const response = signed(bytes, key);
    if (index === 2) transaction.recentBlockhash = hash();
    return response;
  } }));
  await assert.rejects(collectSignatures(transaction, signers, () => {}), /Complete signed message changed/);
});

test('expired-round retry rebuilds the message and collects all three signatures again', async () => {
  const { instruction } = await fixture(); let valid = false, sends = 0, signingCalls = 0;
  const messages: string[] = [];
  const connection = rpc({ isBlockhashValid: async () => ({ value: valid }),
    sendRawTransaction: async (bytes: Uint8Array) => { sends++; return utils.bytes.bs58.encode(Transaction.from(bytes).signature!); },
    getSignatureStatuses: async () => ({ value: [{ confirmationStatus: 'confirmed', err: null }] }),
  });
  const signers = keys.map((key, index) => ({ address: addresses[index], label: 'Node fixture', sign: async (bytes: Uint8Array) => {
    signingCalls++; messages.push(Transaction.from(bytes).serializeMessage().toString('hex')); return signed(bytes, key);
  } }));
  await assert.rejects(submitInstructions(connection, { endpoint, genesis }, [instruction], signers, () => {}), /blockhash expired/);
  assert.equal(sends, 0); valid = true;
  await submitInstructions(connection, { endpoint, genesis }, [instruction], signers, () => {});
  assert.equal(signingCalls, 6); assert.equal(sends, 1); assert.equal(new Set(messages.slice(0, 3)).size, 1);
  assert.equal(new Set(messages.slice(3)).size, 1); assert.notEqual(messages[0], messages[3]);
});

test('a public receipt survives reload and refuses a second uncertain payment', () => {
  const store = storage(); const first = receipt();
  new TransactionJournal(store).record({ ...first, transactionBytes: 'must-not-persist' } as PendingReceipt);
  const reloaded = new TransactionJournal(store); assert.deepEqual(reloaded.read(), first);
  assert.throws(() => reloaded.record({ ...first, signature: '4'.repeat(88) }), /pending/);
  assert(!store.getItem(PENDING_KEY)!.includes('transactionBytes'));
  reloaded.clear(first.signature); assert.equal(reloaded.read(), undefined);
});

test('public receipt persistence must succeed before broadcasting', async () => {
  const { instruction } = await fixture(); let sends = 0;
  const store = storage(); store.setItem = () => { throw new Error('Storage unavailable'); };
  const journal = new TransactionJournal(store);
  const connection = rpc({ sendRawTransaction: async () => { sends++; return 'unexpected'; } });
  const signers = keys.map((key, index) => ({ address: addresses[index], label: 'Node fixture', sign: async (bytes: Uint8Array) => signed(bytes, key) }));
  await assert.rejects(submitInstructions(connection, { endpoint, genesis }, [instruction], signers, state => {
    if (state.receipt && state.phase === 'submitting') journal.record(state.receipt);
  }), /Storage unavailable/);
  assert.equal(sends, 0);
});

test('upgrade metadata validates loader ownership, ProgramData relationship and authority', async () => {
  const authority = keys[0].publicKey;
  const dataAddress = PublicKey.findProgramAddressSync([WALLET_PROGRAM_ID.toBuffer()], UPGRADEABLE_LOADER)[0];
  const programData = Buffer.alloc(45); programData.writeUInt32LE(3); programData.writeBigUInt64LE(12n, 4); programData[12] = 1; authority.toBuffer().copy(programData, 13);
  const program = Buffer.alloc(36); program.writeUInt32LE(2); dataAddress.toBuffer().copy(program, 4);
  const connection = rpc({ getAccountInfo: async (key: PublicKey) => key.equals(WALLET_PROGRAM_ID)
    ? { executable: true, owner: UPGRADEABLE_LOADER, data: program } : { executable: false, owner: UPGRADEABLE_LOADER, data: programData } });
  const network = await verifyLocalNetwork(connection); assert.equal(network.deployment?.authority, authority.toBase58());
  assert.equal(network.deployment?.kind, 'upgradeable');
  programData.writeBigUInt64LE(13n, 4);
  await assert.rejects(verifyLocalNetwork(connection, genesis, network.deployment), /Program deployment or upgrade authority changed/);
  programData[12] = 0;
  assert.equal((await verifyLocalNetwork(connection)).deployment?.kind, 'immutable');
  program.writeUInt8(program[4] ^ 1, 4);
  await assert.rejects(verifyLocalNetwork(connection), /Noncanonical ProgramData/);
  await assert.rejects(verifyLocalNetwork(rpc({ getAccountInfo: async () => ({ executable: true, owner: keys[0].publicKey }) })), /Unexpected program loader/);
});


test('same-origin browser submissions are serialized; unsupported locks fail before signing', async () => {
  let held = false;
  const locks = { request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
    if (held) return callback(null);
    held = true;
    try { return await callback({}); } finally { held = false; }
  } } as unknown as Pick<LockManager, 'request'>;
  let release!: () => void;
  const first = withTransactionLock(locks, () => new Promise<void>(resolve => { release = resolve; }));
  await assert.rejects(withTransactionLock(locks, async () => {}), /Another tab/);
  release(); await first;
  await assert.rejects(withTransactionLock(undefined, async () => {}), /Web Locks/);
});
