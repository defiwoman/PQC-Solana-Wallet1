import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, writeFile, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AnchorProvider, BN, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram, type TransactionInstruction } from '@solana/web3.js';
import { createWalletClient, proposalAddress, vaultAddress, WALLET_PROGRAM_ID, U64_MAX, u64LE } from '@pqc-wallet/sdk/client';

// This suite always launches its own validator and never accepts an external RPC URL.
const payer = Keypair.generate();
const owners = [Keypair.generate(), Keypair.generate(), Keypair.generate()] as const;
const stranger = Keypair.generate();
const runDirectory = resolve('target/validator-runs', `${Date.now()}-${process.pid}`);
let validator: ChildProcess | undefined;
let connection: Connection;
let client: ReturnType<typeof createWalletClient>;
let vaultId = 1n;
let transactionSequence = 0;
const boundaryVault = vaultAddress(owners[0].publicKey, U64_MAX);
const wrongProposal = proposalAddress(boundaryVault, 0n);
const wrongOwnerVault = vaultAddress(owners[0].publicKey, U64_MAX - 1n);
const bn = (n: bigint) => new BN(n.toString());

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  return port;
}

class LandedFailure extends Error {
  constructor(readonly signature: string, readonly logs: string[], readonly detail: unknown) {
    super(`Confirmed transaction failed: ${JSON.stringify(detail)}\n${logs.join('\n')}`);
  }
}

async function confirmed(signature: string) {
  // HTTP polling avoids lingering WebSocket reconnects after validator shutdown.
  for (let attempt = 0; attempt < 300; attempt++) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
    await delay(100);
  }
  throw new Error(`Local transaction confirmation timed out: ${signature}`);
}

async function send(instructions: TransactionInstruction[], signers: readonly Keypair[] = [], feePayer = payer) {
  const latest = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ ...latest, feePayer: feePayer.publicKey }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 + transactionSequence++ }), ...instructions,
  );
  const unique = new Map([feePayer, ...signers].map(key => [key.publicKey.toBase58(), key]));
  tx.sign(...unique.values());
  // No simulated/mocked success: even expected failures must reach the local ledger.
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  await confirmed(signature);
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (result?.meta) {
      if (result.meta.err) throw new LandedFailure(signature, result.meta.logMessages ?? [], result.meta.err);
      assert(result.meta.logMessages?.some(log => log.includes(`Program ${WALLET_PROGRAM_ID.toBase58()} invoke`)));
      return signature;
    }
    await delay(100);
  }
  throw new Error('Confirmed transaction metadata was not available');
}

async function rejected(instructions: TransactionInstruction[], signers: readonly Keypair[], ...codes: string[]) {
  await assert.rejects(send(instructions, signers), error => {
    assert(error instanceof LandedFailure, 'Expected a real confirmed program failure, not a client error');
    if (codes.length) assert(codes.some(code => error.logs.some(log => log.includes(`Error Code: ${code}.`))), error.message);
    return true;
  });
}

async function initializeInstruction(id: bigint, keys: readonly Keypair[] = owners, address?: PublicKey) {
  return client.methods.initializeVault(bn(id)).accountsStrict({
    vault: address ?? vaultAddress(keys[0].publicKey, id), payer: payer.publicKey,
    ownerA: keys[0].publicKey, ownerB: keys[1].publicKey, ownerC: keys[2].publicKey,
    systemProgram: SystemProgram.programId,
  }).instruction();
}

async function initialize() {
  const id = vaultId++;
  const vault = vaultAddress(owners[0].publicKey, id);
  await send([await initializeInstruction(id)], owners);
  return vault;
}

async function depositInstruction(vault: PublicKey, amount: bigint, depositor = payer.publicKey) {
  return client.methods.deposit(bn(amount)).accountsStrict({ vault, depositor, systemProgram: SystemProgram.programId }).instruction();
}

async function proposeInstruction(vault: PublicKey, nonce: bigint, recipient: PublicKey, amount: bigint, expiry: bigint, proposer = owners[0].publicKey) {
  return client.methods.createProposal(bn(nonce), recipient, bn(amount), bn(expiry)).accountsStrict({
    vault, proposal: proposalAddress(vault, nonce), proposer, payer: payer.publicKey, systemProgram: SystemProgram.programId,
  }).instruction();
}

async function propose(vault: PublicKey, recipient: PublicKey, amount = 100_000n, expiry?: bigint) {
  const state = await client.account.vault.fetch(vault);
  const nonce = BigInt(state.nextNonce.toString());
  const deadline = expiry ?? BigInt(await connection.getSlot('confirmed')) + 1_000n;
  await send([await proposeInstruction(vault, nonce, recipient, amount, deadline)], [owners[0]]);
  return proposalAddress(vault, nonce);
}

async function approval(vault: PublicKey, proposal: PublicKey, authority = owners[0].publicKey) {
  return client.methods.approve().accountsStrict({ vault, proposal, authority }).instruction();
}

async function approveTwo(vault: PublicKey, proposal: PublicKey, indices = [0, 1]) {
  for (const index of indices) await send([await approval(vault, proposal, owners[index].publicKey)], [owners[index]]);
}

async function execution(vault: PublicKey, proposal: PublicKey, recipient: PublicKey, expectedAmount = 100_000n) {
  return client.methods.executeTransfer(bn(expectedAmount)).accountsStrict({ vault, proposal, recipient }).instruction();
}

async function recipient() {
  const key = Keypair.generate().publicKey;
  await confirmed(await connection.requestAirdrop(key, 2_000_000));
  return key;
}

async function funded() {
  const vault = await initialize();
  await send([await depositInstruction(vault, 5_000_000n)]);
  return vault;
}

async function snapshot(vault: PublicKey, proposal: PublicKey, destination: PublicKey) {
  const accounts = await connection.getMultipleAccountsInfo([vault, proposal, destination], 'confirmed');
  return accounts.map(account => account && ({ lamports: account.lamports, owner: account.owner.toBase58(), data: account.data.toString('base64') }));
}

async function unchangedFailure(vault: PublicKey, proposal: PublicKey, destination: PublicKey, instructions: TransactionInstruction[], signers: readonly Keypair[], ...codes: string[]) {
  const beforeState = await snapshot(vault, proposal, destination);
  await rejected(instructions, signers, ...codes);
  assert.deepEqual(await snapshot(vault, proposal, destination), beforeState);
}

before(async () => {
  const binary = resolve('target/deploy/wallet.so');
  assert((await readFile(binary)).length > 0, 'Run the real program build first');
  await mkdir(runDirectory, { recursive: true });
  const port = await freePort();
  connection = new Connection(`http://127.0.0.1:${port}`, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: 'confirmed' });
  client = createWalletClient(provider);
  // Public, program-owned genesis fixture to reach nonce overflow without 2^64 transactions.
  const fixtureData = await client.coder.accounts.encode('vault', {
    owners: owners.map(owner => owner.publicKey), vaultId: bn(U64_MAX), nextNonce: bn(U64_MAX),
  });
  const fixture = (data: Buffer, owner: PublicKey) => ({
    pubkey: boundaryVault.toBase58(), account: { lamports: 10_000_000,
      data: [data.toString('base64'), 'base64'], owner: owner.toBase58(), executable: false, rentEpoch: 0 },
  });
  await writeFile(resolve(runDirectory, 'nonce-boundary.json'), JSON.stringify(fixture(fixtureData, WALLET_PROGRAM_ID)));
  const wrongData = await client.coder.accounts.encode('vault', {
    owners: owners.map(owner => owner.publicKey), vaultId: bn(U64_MAX - 1n), nextNonce: bn(0n),
  });
  await writeFile(resolve(runDirectory, 'wrong-owner.json'), JSON.stringify({ ...fixture(wrongData, SystemProgram.programId), pubkey: wrongOwnerVault.toBase58() }));
  const wrongProposalData = await client.coder.accounts.encode('transferProposal', {
    vault: boundaryVault, nonce: bn(0n), recipient: payer.publicKey, amount: bn(1n), expirySlot: bn(U64_MAX),
    proposer: owners[0].publicKey, approvals: 0, executed: false,
  });
  await writeFile(resolve(runDirectory, 'wrong-proposal-owner.json'), JSON.stringify({
    ...fixture(wrongProposalData, SystemProgram.programId), pubkey: wrongProposal.toBase58(),
  }));
  const log = await open(resolve(runDirectory, 'validator.log'), 'w');
  validator = spawn('solana-test-validator', [
    '--reset', '--quiet', '--ledger', resolve(runDirectory, 'ledger'),
    '--bind-address', '127.0.0.1', '--rpc-port', String(port),
    '--faucet-port', String(await freePort()), '--gossip-port', String(await freePort()),
    '--dynamic-port-range', '12000-12100', '--limit-ledger-size', '10000',
    '--bpf-program', WALLET_PROGRAM_ID.toBase58(), binary,
    '--account', boundaryVault.toBase58(), resolve(runDirectory, 'nonce-boundary.json'),
    '--account', wrongOwnerVault.toBase58(), resolve(runDirectory, 'wrong-owner.json'),
    '--account', wrongProposal.toBase58(), resolve(runDirectory, 'wrong-proposal-owner.json'),
  ], { stdio: ['ignore', log.fd, log.fd] });
  await log.close();
  let startupError: Error | undefined;
  validator.once('error', error => { startupError = error; });
  for (let attempt = 0; attempt < 600; attempt++) {
    if (startupError || validator.exitCode !== null || validator.signalCode !== null) {
      throw new Error(`Local validator failed: ${startupError ?? validator.exitCode}\n${await readFile(resolve(runDirectory, 'validator.log'), 'utf8')}`);
    }
    try {
      await connection.getLatestBlockhash('confirmed');
      const loaded = await connection.getAccountInfo(WALLET_PROGRAM_ID);
      assert(loaded?.executable, 'Compiled program must be loaded in the actual validator');
      await confirmed(await connection.requestAirdrop(payer.publicKey, 20_000_000_000));
      console.log(`Local validator executing compiled wallet.so; evidence directory: ${runDirectory}`);
      return;
    } catch { await delay(150); }
  }
  throw new Error(`Validator readiness timed out; inspect ${runDirectory}/validator.log`);
}, { timeout: 120_000 });

after(async () => {
  if (validator?.pid && validator.exitCode === null && validator.signalCode === null) {
    const exited = once(validator, 'exit');
    validator.kill('SIGTERM');
    await Promise.race([exited, delay(8_000)]);
    if (validator.exitCode === null && validator.signalCode === null) { validator.kill('SIGKILL'); await exited; }
  }
});

test('all three distinct keys initialize a canonical, rent-exempt vault; deposits add exact SOL', async () => {
  const vault = await initialize();
  const state = await client.account.vault.fetch(vault);
  assert.deepEqual(state.owners.map(key => key.toBase58()), owners.map(key => key.publicKey.toBase58()));
  assert.equal(state.nextNonce.toString(), '0');
  const beforeBalance = await connection.getBalance(vault);
  const account = await connection.getAccountInfo(vault);
  assert(account && account.owner.equals(WALLET_PROGRAM_ID));
  assert.equal(beforeBalance, await connection.getMinimumBalanceForRentExemption(account.data.length));
  await send([await depositInstruction(vault, 3_000_000n)]);
  assert.equal(await connection.getBalance(vault), beforeBalance + 3_000_000);
});

test('duplicate initialization keys are rejected and no vault account survives', async () => {
  const id = vaultId++;
  const keys = [owners[0], owners[0], owners[2]];
  await rejected([await initializeInstruction(id, keys)], [owners[0], owners[2]], 'DuplicateOwners');
  assert.equal(await connection.getAccountInfo(vaultAddress(owners[0].publicKey, id)), null);
});

test('each of the three initialization signatures is mandatory on-chain', async () => {
  for (let missing = 0; missing < 3; missing++) {
    const id = vaultId++;
    const ix = await initializeInstruction(id);
    // Remove the signature privilege too, so this reaches the program rather than
    // failing only in the client's transaction serializer/signature verifier.
    for (const meta of ix.keys) if (meta.pubkey.equals(owners[missing].publicKey)) meta.isSigner = false;
    await rejected([ix], owners.filter((_, index) => index !== missing), 'AccountNotSigner');
    assert.equal(await connection.getAccountInfo(vaultAddress(owners[0].publicKey, id)), null);
  }
});

test('noncanonical vault PDA and wrong account owner are rejected', async () => {
  const id = vaultId++;
  const seeds = [Buffer.from('vault'), owners[0].publicKey.toBuffer(), u64LE(id)];
  const canonical = vaultAddress(owners[0].publicKey, id);
  let alternate: PublicKey | undefined;
  for (let bump = 255; bump >= 0; bump--) {
    try { const candidate = PublicKey.createProgramAddressSync([...seeds, Buffer.from([bump])], WALLET_PROGRAM_ID); if (!candidate.equals(canonical)) { alternate = candidate; break; } } catch { /* on-curve candidates are invalid */ }
  }
  assert(alternate);
  await rejected([await initializeInstruction(id, owners, alternate)], owners, 'ConstraintSeeds');
  await rejected([await depositInstruction(wrongOwnerVault, 1n)], [], 'AccountOwnedByWrongProgram');
});

test('proposal creation and payment give zero approvals; zero and one approval cannot spend', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  assert.equal((await client.account.transferProposal.fetch(proposal)).approvals, 0);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to)], [], 'InsufficientApprovals');
  await send([await approval(vault, proposal)], [owners[0]]);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to)], [], 'InsufficientApprovals');
  // The same owner is proposer, rent payer and transaction fee payer: still zero votes.
  await confirmed(await connection.requestAirdrop(owners[0].publicKey, 5_000_000));
  const next = proposalAddress(vault, 1n);
  const ownerPaid = await client.methods.createProposal(bn(1n), to, bn(100_000n), bn(U64_MAX)).accountsStrict({
    vault, proposal: next, proposer: owners[0].publicKey, payer: owners[0].publicKey, systemProgram: SystemProgram.programId,
  }).instruction();
  await send([ownerPaid], [owners[0]], owners[0]);
  assert.equal((await client.account.transferProposal.fetch(next)).approvals, 0);
  await unchangedFailure(vault, next, to, [await execution(vault, next, to)], [], 'InsufficientApprovals');
});

test('every two-of-three owner combination can spend the exact stored amount and retains the proposal', async () => {
  for (const indices of [[0, 1], [0, 2], [1, 2]]) {
    const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
    await approveTwo(vault, proposal, indices);
    const source = await connection.getBalance(vault), destination = await connection.getBalance(to);
    await send([await execution(vault, proposal, to)]);
    assert.equal(await connection.getBalance(vault), source - 100_000);
    assert.equal(await connection.getBalance(to), destination + 100_000);
    const state = await client.account.transferProposal.fetch(proposal);
    assert.equal(state.executed, true);
    assert.equal(state.recipient.toBase58(), to.toBase58()); assert.equal(state.amount.toString(), '100000');
    assert(state.vault.equals(vault)); assert.equal(state.nonce.toString(), '0');
    assert.equal(await connection.getBalance(proposal), await connection.getMinimumBalanceForRentExemption((await connection.getAccountInfo(proposal))!.data.length));
  }
});

test('a repeated owner approval cannot count twice; unauthorized or unsigned approval is rejected', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  await send([await approval(vault, proposal)], [owners[0]]);
  await unchangedFailure(vault, proposal, to, [await approval(vault, proposal)], [owners[0]], 'AlreadyApproved');
  await unchangedFailure(vault, proposal, to, [await approval(vault, proposal, stranger.publicKey)], [stranger], 'Unauthorized');
  const unsigned = await approval(vault, proposal, owners[1].publicKey);
  for (const meta of unsigned.keys) if (meta.pubkey.equals(owners[1].publicKey)) meta.isSigner = false;
  await rejected([unsigned], [], 'AccountNotSigner');
  assert.equal((await client.account.transferProposal.fetch(proposal)).approvals, 1);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to)], [], 'InsufficientApprovals');
});

test('unauthorized proposers are rejected without incrementing nonce or leaving an account', async () => {
  const vault = await funded(); const to = await recipient();
  await rejected([await proposeInstruction(vault, 0n, to, 1n, U64_MAX, stranger.publicKey)], [stranger], 'Unauthorized');
  assert.equal((await client.account.vault.fetch(vault)).nextNonce.toString(), '0');
  assert.equal(await connection.getAccountInfo(proposalAddress(vault, 0n)), null);
});

test('recipient and amount substitution are rejected without changing any stored state or balance', async () => {
  const vault = await funded(); const to = await recipient(); const other = await recipient(); const proposal = await propose(vault, to);
  await approveTwo(vault, proposal);
  const otherBefore = await connection.getBalance(other);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, other)], [], 'RecipientMismatch');
  assert.equal(await connection.getBalance(other), otherBefore);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to, 100_001n)], [], 'AmountMismatch');
});

test('expired creation, approval and execution are rejected', async () => {
  const vault = await funded(); const to = await recipient();
  const slot = BigInt(await connection.getSlot('confirmed'));
  await rejected([await proposeInstruction(vault, 0n, to, 1n, slot)], [owners[0]], 'Expired');
  const deadline = BigInt(await connection.getSlot('confirmed')) + 12n;
  const proposal = await propose(vault, to, 100_000n, deadline);
  await approveTwo(vault, proposal);
  while (BigInt(await connection.getSlot('confirmed')) < deadline) await delay(100);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to)], [], 'Expired');
  await unchangedFailure(vault, proposal, to, [await approval(vault, proposal, owners[2].publicKey)], [owners[2]], 'Expired');
});

test('execution and approval replay are rejected; consumed proposal account remains', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  await approveTwo(vault, proposal); await send([await execution(vault, proposal, to)]);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to)], [], 'AlreadyExecuted');
  await unchangedFailure(vault, proposal, to, [await approval(vault, proposal, owners[2].publicKey)], [owners[2]], 'AlreadyExecuted');
  assert(await connection.getAccountInfo(proposal));
  await rejected([await proposeInstruction(vault, 0n, to, 100_000n, U64_MAX)], [owners[0]]);
  assert.equal((await client.account.vault.fetch(vault)).nextNonce.toString(), '1');
});

test('cross-vault proposal substitution cannot approve or execute', async () => {
  const vault = await funded(); const otherVault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  await approveTwo(vault, proposal);
  const otherBefore = await connection.getBalance(otherVault);
  await unchangedFailure(vault, proposal, to, [await approval(otherVault, proposal, owners[2].publicKey)], [owners[2]], 'ConstraintHasOne', 'ConstraintSeeds');
  await unchangedFailure(vault, proposal, to, [await execution(otherVault, proposal, to)], [], 'ConstraintHasOne', 'ConstraintSeeds');
  assert.equal(await connection.getBalance(otherVault), otherBefore);
});

test('insufficient funds, u64 max amount, and rent-reserve spending fail atomically', async () => {
  const vault = await initialize(); const to = await recipient();
  for (const amount of [U64_MAX, 100_000_000n, 1n]) {
    const proposal = await propose(vault, to, amount, U64_MAX); await approveTwo(vault, proposal);
    await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to, amount)], [], amount === 1n ? 'RentReserve' : 'InsufficientFunds');
  }
});

test('the entire deposit can be withdrawn while leaving exactly the vault rent reserve', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to, 5_000_000n);
  await approveTwo(vault, proposal); await send([await execution(vault, proposal, to, 5_000_000n)]);
  const account = await connection.getAccountInfo(vault); assert(account);
  assert.equal(account.lamports, await connection.getMinimumBalanceForRentExemption(account.data.length));
});

test('zero amount, skipped nonce, and exhausted u64 nonce are rejected without partial state', async () => {
  const vault = await funded(); const to = await recipient();
  await rejected([await depositInstruction(vault, 0n)], [], 'InvalidAmount');
  await rejected([await depositInstruction(vault, U64_MAX)], [], 'ArithmeticOverflow');
  await rejected([await proposeInstruction(vault, 0n, to, 0n, U64_MAX)], [owners[0]], 'InvalidAmount');
  await rejected([await proposeInstruction(vault, 1n, to, 1n, U64_MAX)], [owners[0]], 'InvalidNonce');
  const beforeVault = await connection.getAccountInfo(boundaryVault);
  await rejected([await proposeInstruction(boundaryVault, U64_MAX, to, 1n, U64_MAX)], [owners[0]], 'ArithmeticOverflow');
  assert.deepEqual(await connection.getAccountInfo(boundaryVault), beforeVault);
  assert.equal(await connection.getAccountInfo(proposalAddress(boundaryVault, U64_MAX)), null);
  assert.equal((await client.account.vault.fetch(vault)).nextNonce.toString(), '0');
});

test('a new recipient must remain rent exempt; program-owned recipients are rejected', async () => {
  const vault = await funded(); const fresh = Keypair.generate().publicKey; const tiny = await propose(vault, fresh, 1n);
  await approveTwo(vault, tiny);
  await unchangedFailure(vault, tiny, fresh, [await execution(vault, tiny, fresh, 1n)], [], 'RecipientRent');
  const otherVault = await funded(); const invalid = await propose(vault, otherVault);
  await approveTwo(vault, invalid);
  await unchangedFailure(vault, invalid, otherVault, [await execution(vault, invalid, otherVault)], [], 'AccountNotSystemOwned');
});

test('a later failure rolls back an earlier successful execution in the same transaction', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  await approveTwo(vault, proposal);
  const transfer = await execution(vault, proposal, to);
  await unchangedFailure(vault, proposal, to, [transfer, transfer], [], 'AlreadyExecuted');
  assert.equal((await client.account.transferProposal.fetch(proposal)).executed, false);
  // Retrying just the valid instruction succeeds, proving the failed tx did not consume it.
  await send([transfer]);
  assert.equal((await client.account.transferProposal.fetch(proposal)).executed, true);
});


function failures(results: PromiseSettledResult<string>[], code: string) {
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert(failed.reason instanceof LandedFailure);
  assert(failed.reason.logs.some((log: string) => log.includes(`Error Code: ${code}.`)), failed.reason.message);
}

test('concurrent execution transactions spend a proposal exactly once', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  await approveTwo(vault, proposal);
  const source = await connection.getBalance(vault), destination = await connection.getBalance(to);
  const ix = await execution(vault, proposal, to);
  failures(await Promise.allSettled([send([ix]), send([ix])]), 'AlreadyExecuted');
  assert.equal(await connection.getBalance(vault), source - 100_000);
  assert.equal(await connection.getBalance(to), destination + 100_000);
  assert.equal((await client.account.transferProposal.fetch(proposal)).executed, true);
});

test('competing approved proposals cannot jointly overspend; losing execution remains unconsumed', async () => {
  const vault = await funded(); const to = await recipient();
  const first = await propose(vault, to, 3_000_000n), second = await propose(vault, to, 3_000_000n);
  await approveTwo(vault, first); await approveTwo(vault, second);
  const before = [await client.account.transferProposal.fetch(first), await client.account.transferProposal.fetch(second)];
  const source = await connection.getBalance(vault), destination = await connection.getBalance(to);
  failures(await Promise.allSettled([send([await execution(vault, first, to, 3_000_000n)]), send([await execution(vault, second, to, 3_000_000n)])]), 'RentReserve');
  const after = [await client.account.transferProposal.fetch(first), await client.account.transferProposal.fetch(second)];
  assert.equal(after.filter(proposal => proposal.executed).length, 1);
  for (let index = 0; index < 2; index++) {
    const { executed: _old, ...immutableBefore } = before[index];
    const { executed: _new, ...immutableAfter } = after[index];
    assert.deepEqual(immutableAfter, immutableBefore);
  }
  assert.equal(await connection.getBalance(vault), source - 3_000_000);
  assert.equal(await connection.getBalance(to), destination + 3_000_000);
});

test('concurrent repeated approvals cannot count the same owner twice', async () => {
  const vault = await funded(); const to = await recipient(); const proposal = await propose(vault, to);
  const ix = await approval(vault, proposal);
  failures(await Promise.allSettled([send([ix], [owners[0]]), send([ix], [owners[0]])]), 'AlreadyApproved');
  assert.equal((await client.account.transferProposal.fetch(proposal)).approvals, 1);
  await unchangedFailure(vault, proposal, to, [await execution(vault, proposal, to)], [], 'InsufficientApprovals');
});

test('proposal owner and canonical PDA checks reject fabricated substitutions', async () => {
  await rejected([await approval(boundaryVault, wrongProposal)], [owners[0]], 'AccountOwnedByWrongProgram');
  const vault = await funded(); const to = await recipient();
  const seeds = [Buffer.from('proposal'), vault.toBuffer(), u64LE(0n)];
  const canonical = proposalAddress(vault, 0n); let alternate: PublicKey | undefined;
  for (let bump = 255; bump >= 0; bump--) {
    try { const candidate = PublicKey.createProgramAddressSync([...seeds, Buffer.from([bump])], WALLET_PROGRAM_ID); if (!candidate.equals(canonical)) { alternate = candidate; break; } } catch { /* invalid on-curve candidate */ }
  }
  assert(alternate);
  const ix = await proposeInstruction(vault, 0n, to, 1n, U64_MAX);
  for (const meta of ix.keys) if (meta.pubkey.equals(canonical)) meta.pubkey = alternate;
  await rejected([ix], [owners[0]], 'ConstraintSeeds');
  assert.equal((await client.account.vault.fetch(vault)).nextNonce.toString(), '0');
  assert.equal(await connection.getAccountInfo(alternate), null);
});
