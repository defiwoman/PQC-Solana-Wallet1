import assert from 'node:assert/strict';
import test from 'node:test';
import { U64_MAX, u64LE, vaultAddress, proposalAddress } from '@pqc-wallet/sdk/client';
import { Keypair } from '@solana/web3.js';

test('SDK encodes exact u64 boundaries and rejects rounded numbers or out-of-range seeds', () => {
  assert.equal(u64LE(0n).toString('hex'), '0000000000000000');
  assert.equal(u64LE(U64_MAX).toString('hex'), 'ffffffffffffffff');
  for (const value of [-1n, U64_MAX + 1n, 1 as unknown as bigint]) {
    assert.throws(() => u64LE(value), RangeError);
  }
});

test('vault and proposal addresses bind the owner, vault ID, vault and nonce', () => {
  const first = Keypair.generate().publicKey, second = Keypair.generate().publicKey;
  const vault = vaultAddress(first, 1n);
  assert(!vault.equals(vaultAddress(second, 1n)));
  assert(!vault.equals(vaultAddress(first, 2n)));
  assert(!proposalAddress(vault, 0n).equals(proposalAddress(vault, 1n)));
  assert(!proposalAddress(vault, 0n).equals(proposalAddress(vaultAddress(second, 1n), 0n)));
});
