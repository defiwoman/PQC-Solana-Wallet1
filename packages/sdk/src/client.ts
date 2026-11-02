import { Buffer } from 'buffer';
import { Program, type AnchorProvider } from '@anchor-lang/core';
import { PublicKey } from '@solana/web3.js';
import idl from './generated/wallet.json' with { type: 'json' };
import type { Wallet } from './generated/wallet.js';

export const WALLET_PROGRAM_ID = new PublicKey(idl.address);
export const U64_MAX = (1n << 64n) - 1n;

/** Use bigint for lamports/nonces; do not pass rounded JavaScript numbers. */
export function u64LE(value: bigint): Buffer {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) {
    throw new RangeError('Expected an unsigned 64-bit bigint');
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

export function vaultAddress(firstOwner: PublicKey, vaultId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), firstOwner.toBuffer(), u64LE(vaultId)], WALLET_PROGRAM_ID,
  )[0];
}

export function proposalAddress(vault: PublicKey, nonce: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proposal'), vault.toBuffer(), u64LE(nonce)], WALLET_PROGRAM_ID,
  )[0];
}

/** Construct a typed local client; never loads keys or submits a transaction itself. */
export function createWalletClient(provider: AnchorProvider): Program<Wallet> {
  return new Program<Wallet>(idl as unknown as Wallet, provider);
}
