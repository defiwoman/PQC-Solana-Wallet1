import assert from 'node:assert/strict';
import test from 'node:test';
import { utils } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { actionState, collectSignatures, describeError, initializeInstruction, localEndpoint, parseU64, submitInstructions,
  LEGACY_LOADER, verifyLocalNetwork, type SignerConnection, type Snapshot, type ProposalView, type Progress } from '@pqc-wallet/sdk/interface';

// Development-only wallet fixtures. Secret keys exist only inside this Node test
// process, never in the browser bundle, an app backend, files, logs or exports.
const keys = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
const rpc = new Connection('http://127.0.0.1:8899');
async function fixture() {
  const instruction = await initializeInstruction(rpc, keys.map(key => key.publicKey.toBase58()), 7n);
  const transaction = new Transaction({ feePayer: keys[0].publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(instruction);
  return { transaction, instruction };
}
function signers(): SignerConnection[] {
  return keys.map((key, index) => ({ address: key.publicKey.toBase58(), label: `Node-only fixture ${index + 1}`, sign: async bytes => {
    const tx = Transaction.from(bytes);
    // A wallet may return only its own signature: earlier signatures must survive.
    for (const entry of tx.signatures) entry.signature = null;
    tx.partialSign(key);
    return tx.serialize({ requireAllSignatures: false });
  } }));
}
function connection(overrides: Record<string, unknown> = {}) {
  let sent = 0;
  const stub = { rpcEndpoint: 'http://127.0.0.1:8899', getGenesisHash: async () => 'private-local-genesis',
    getAccountInfo: async () => ({ executable: true, owner: LEGACY_LOADER, data: Buffer.alloc(0) }),
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
    isBlockhashValid: async () => ({ value: true }), sendRawTransaction: async () => { sent++; throw new TypeError('fetch failed'); },
    ...overrides } as unknown as Connection;
  return { rpc: stub, sent: () => sent };
}

test('initialization cryptographically requires all three signatures on the exact same message', async () => {
  const { transaction } = await fixture();
  const message = transaction.serializeMessage();
  const prompts: string[] = [];
  const bytes = await collectSignatures(transaction, signers(), message => prompts.push(message));
  const result = Transaction.from(bytes);
  assert(result.verifySignatures(true)); assert.equal(result.signatures.length, 3);
  assert.deepEqual(result.serializeMessage(), message); assert.equal(prompts.length, 3);
});

test('two signatures cannot silently initialize; duplicate signer identities and missing signatures fail', async () => {
  await assert.rejects(collectSignatures((await fixture()).transaction, signers().slice(0, 2), () => {}), /All required/);
  const available = signers();
  await assert.rejects(collectSignatures((await fixture()).transaction, [available[0], available[0], available[2]], () => {}), /distinct/);
  const omitted = signers(); omitted[1] = { ...omitted[1], sign: async bytes => bytes };
  await assert.rejects(collectSignatures((await fixture()).transaction, omitted, () => {}), /missing or invalid/);
});

test('a wallet cannot change the message or return an invalid signature', async () => {
  const changed = signers();
  changed[1].sign = async bytes => {
    const tx = Transaction.from(bytes); tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
    for (const entry of tx.signatures) entry.signature = null;
    tx.partialSign(keys[1]); return tx.serialize({ requireAllSignatures: false });
  };
  await assert.rejects(collectSignatures((await fixture()).transaction, changed, () => {}), /changed the transaction/);
  const invalid = signers(); invalid[0].sign = async bytes => {
    const tx = Transaction.from(bytes); tx.addSignature(keys[0].publicKey, Buffer.alloc(64, 1));
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  };
  await assert.rejects(collectSignatures((await fixture()).transaction, invalid, () => {}), /invalid authorization signature/);
});

test('rejected signatures and expired signing blockhashes never broadcast a transaction', async () => {
  const reject = signers(); reject[1].sign = async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }); };
  const first = connection(); const ix = (await fixture()).instruction;
  await assert.rejects(submitInstructions(first.rpc, { endpoint: first.rpc.rpcEndpoint, genesis: 'private-local-genesis' }, [ix], reject, () => {}));
  assert.equal(first.sent(), 0);
  const expired = connection({ isBlockhashValid: async () => ({ value: false }) });
  await assert.rejects(submitInstructions(expired.rpc, { endpoint: expired.rpc.rpcEndpoint, genesis: 'private-local-genesis' }, [ix], signers(), () => {}), /blockhash expired/);
  assert.equal(expired.sent(), 0);
});

test('submission RPC failure retains the deterministic signature and reports unknown rather than success', async () => {
  const stub = connection(); const states: Progress[] = [];
  await submitInstructions(stub.rpc, { endpoint: stub.rpc.rpcEndpoint, genesis: 'private-local-genesis' }, [(await fixture()).instruction], signers(), state => states.push(state));
  assert.equal(stub.sent(), 1); assert.equal(states.at(-1)?.phase, 'unknown'); assert(states.at(-1)?.signature);
  assert(!states.some(state => state.phase === 'confirmed'));
});

test('wrong network, changed local genesis, public RPC URLs and credential URLs are blocked', async () => {
  for (const url of ['https://api.mainnet-beta.solana.com', 'http://localhost:8899/?key=secret', 'http://user:pass@127.0.0.1:8899']) assert.throws(() => localEndpoint(url), /Wrong network/);
  const publicChain = connection({ getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' });
  await assert.rejects(verifyLocalNetwork(publicChain.rpc), /Wrong network/);
  await assert.rejects(verifyLocalNetwork(connection().rpc, 'previous-validator'), /Wrong network/);
});

test('integer inputs and errors distinguish signature rejection, funds, expiry and RPC failure', () => {
  assert.equal(parseU64('18446744073709551615'), (1n << 64n) - 1n);
  for (const amount of ['1.1', '-1', '1e9', '18446744073709551616']) assert.throws(() => parseU64(amount));
  assert.match(describeError(new Error('User rejected')), /signature rejected/);
  assert.match(describeError({ InstructionError: [0, { Custom: 6006 }] }), /expired/i);
  assert.match(describeError({ InstructionError: [0, { Custom: 6013 }] }), /insufficient/i);
  assert.match(describeError(new TypeError('fetch failed')), /RPC unavailable/);
});


test('confirmation distinguishes a real failure from an uncertain RPC response', async () => {
  for (const outcome of ['confirmed', 'failed', 'unknown'] as const) {
    const states: Progress[] = [];
    const stub = connection({
      sendRawTransaction: async (bytes: Uint8Array) => utils.bytes.bs58.encode(Transaction.from(bytes).signature!),
      getSignatureStatuses: async () => {
        if (outcome === 'unknown') throw new Error('Unexpected RPC response body');
        return { value: [{ confirmationStatus: outcome === 'failed' ? 'finalized' : 'confirmed', err: outcome === 'failed' ? { InstructionError: [0, { Custom: 6013 }] } : null }] };
      },
    });
    await submitInstructions(stub.rpc, { endpoint: stub.rpc.rpcEndpoint, genesis: 'private-local-genesis' }, [(await fixture()).instruction], signers(), state => states.push(state));
    assert.equal(states.at(-1)?.phase, outcome);
    assert(states.at(-1)?.signature);
  }
});
