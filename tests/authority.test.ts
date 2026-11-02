import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, Connection } from '@solana/web3.js';
import { AuthorityStore, parseAuthorityBaseline, verifyExpectedAuthority, AUTHORITY_KEY } from '../apps/web/src/authority';
import { LEGACY_LOADER, UPGRADEABLE_LOADER, WALLET_PROGRAM_ID, type Network } from '@pqc-wallet/sdk/interface';
import { PublicKey } from '@solana/web3.js';

const genesis = Keypair.generate().publicKey.toBase58();
const authority = Keypair.generate().publicKey.toBase58();
const baseline = { version: 1, network: 'solana:localnet', genesisHash: genesis, programId: WALLET_PROGRAM_ID.toBase58(),
  loader: 'legacy', expectedAuthority: null, programData: null, deploymentSlot: null } as const;
const observed: Network = { endpoint: 'http://127.0.0.1:8899/', genesis, programId: baseline.programId, deployment: { kind: 'immutable' } };
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }
const review = { reviewed: true, note: 'Independently reviewed my local fixture' };
const rpc = (overrides = {}) => ({ rpcEndpoint: 'http://127.0.0.1:8899', getGenesisHash: async () => genesis,
  getAccountInfo: async () => ({ executable: true, owner: LEGACY_LOADER, data: Buffer.alloc(0) }), ...overrides }) as unknown as Connection;

test('expected authority is absent until explicit review, and survives store/browser reconstruction', () => {
  const data = storage(); const first = new AuthorityStore(data);
  assert.throws(() => first.requireMatch(observed), /Approve an independently/);
  assert.equal(first.read().baseline, undefined, 'observed RPC must not be adopted');
  assert.throws(() => first.approve(JSON.stringify(baseline), { ...review, reviewed: false }), /Explicit/);
  first.approve(JSON.stringify(baseline), review);
  const reloaded = new AuthorityStore(data); reloaded.requireMatch(observed);
  assert.deepEqual(reloaded.read().baseline, baseline);
});

test('unexpected authority produces a persistent hold and never rewrites the expected value', () => {
  const data = storage(); const store = new AuthorityStore(data); store.approve(JSON.stringify(baseline), review);
  const unexpected = { ...observed, deployment: { kind: 'upgradeable' as const, authority } };
  assert.throws(() => store.requireMatch(unexpected), /Security hold/);
  const reloaded = new AuthorityStore(data);
  assert.equal(reloaded.read().baseline?.expectedAuthority, null);
  assert.throws(() => reloaded.requireMatch(observed), /pending review/, 'matching RPC must not erase a latched hold');
  reloaded.approve(JSON.stringify(baseline), review); reloaded.requireMatch(observed);
});

test('RPC unavailable means no verification and a hold that survives reload and recovery', async () => {
  const data = storage(); const store = new AuthorityStore(data); store.approve(JSON.stringify(baseline), review);
  await assert.rejects(verifyExpectedAuthority(rpc({ getGenesisHash: async () => { throw new Error('RPC offline'); } }), store), /RPC offline/);
  const reloaded = new AuthorityStore(data);
  await assert.rejects(verifyExpectedAuthority(rpc(), reloaded), /pending review/);
  assert.equal(reloaded.read().baseline?.genesisHash, genesis);
});

test('incorrect network, program, authority types and ProgramData configuration fail before approval', () => {
  for (const wrong of [ { ...baseline, network: 'solana:devnet' }, { ...baseline, programId: Keypair.generate().publicKey.toBase58() },
    { ...baseline, loader: 'upgradeable', expectedAuthority: authority, deploymentSlot: '1', programData: authority },
    { ...baseline, genesisHash: new Array(32).fill(1) } ]) assert.throws(() => parseAuthorityBaseline(wrong));
  const data = storage(), store = new AuthorityStore(data); store.approve(JSON.stringify(baseline), review);
  assert.throws(() => store.requireMatch({ ...observed, genesis: Keypair.generate().publicKey.toBase58() }), /network\/program/);
  assert.deepEqual(JSON.parse(data.getItem(AUTHORITY_KEY)!).baseline, baseline);
});

test('upgradeable expected authority is independently configured and bound to canonical program metadata', async () => {
  const programData = PublicKey.findProgramAddressSync([WALLET_PROGRAM_ID.toBuffer()], UPGRADEABLE_LOADER)[0];
  const expected = { ...baseline, loader: 'upgradeable', expectedAuthority: authority, programData: programData.toBase58(), deploymentSlot: '19' };
  const store = new AuthorityStore(storage()); store.approve(JSON.stringify(expected), review);
  store.requireMatch({ ...observed, deployment: { kind: 'upgradeable', authority, programData: programData.toBase58(), slot: '19' } });
  assert.throws(() => store.requireMatch({ ...observed, programId: Keypair.generate().publicKey.toBase58(), deployment: { kind: 'upgradeable', authority } }), /network\/program/);
});


test('a changed or removed authority and same-authority redeployment each latch a hold', () => {
  const programData = PublicKey.findProgramAddressSync([WALLET_PROGRAM_ID.toBuffer()], UPGRADEABLE_LOADER)[0].toBase58();
  const expected = { ...baseline, loader: 'upgradeable', expectedAuthority: authority, programData, deploymentSlot: '19' };
  const original = { kind: 'upgradeable' as const, authority, programData, slot: '19' };
  for (const changed of [
    { ...original, authority: Keypair.generate().publicKey.toBase58() },
    { kind: 'immutable' as const, programData, slot: '19' },
    { ...original, slot: '20' },
  ]) {
    const data = storage(), store = new AuthorityStore(data); store.approve(JSON.stringify(expected), review);
    assert.throws(() => store.requireMatch({ ...observed, deployment: changed }), /Security hold/);
    const reloaded = new AuthorityStore(data);
    assert.equal(reloaded.read().baseline?.expectedAuthority, authority);
    assert.throws(() => reloaded.requireMatch({ ...observed, deployment: original }), /pending review/);
  }
});
