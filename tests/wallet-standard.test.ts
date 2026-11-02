import assert from 'node:assert/strict';
import test from 'node:test';
import { signerFor, type WalletIdentity } from '../apps/web/src/wallets';

// Public metadata only; this fixture does not sign or hold a key.
test('Wallet Standard rejects unsupported networks and disconnected accounts', async () => {
  const account = { address: '11111111111111111111111111111111', chains: ['solana:devnet'], features: ['solana:signTransaction'] };
  const wallet = { accounts: [account], chains: ['solana:devnet'], features: {
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], signTransaction: async () => [] },
  } };
  const identity = { id: 'fixture', address: account.address, label: 'Public test metadata', wallet, account } as unknown as WalletIdentity;
  assert.throws(() => signerFor(identity), /Wrong network/);
  wallet.chains = ['solana:localnet']; account.chains = ['solana:localnet'];
  const signer = signerFor(identity);
  await assert.rejects(signer.sign(new Uint8Array()), /did not return/);
  wallet.accounts = [];
  assert.throws(() => signerFor(identity), /disconnected/);
  await assert.rejects(signer.sign(new Uint8Array()), /disconnected or changed/);
});
