import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, StandardDisconnect, StandardEvents, type StandardConnectFeature, type StandardDisconnectFeature, type StandardEventsFeature } from '@wallet-standard/features';
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from '@solana/wallet-standard-features';
import { LOCAL_CHAIN, type SignerConnection } from '@pqc-wallet/sdk/interface';

export interface WalletIdentity { id: string; address: string; label: string; wallet: Wallet; account: WalletAccount }
export function discoverWallets(): Wallet[] { return [...getWallets().get()].filter(wallet => StandardConnect in wallet.features && SolanaSignTransaction in wallet.features); }
export function watchWallets(changed: () => void) {
  const wallets = getWallets();
  const offRegister = wallets.on('register', changed), offUnregister = wallets.on('unregister', changed);
  return () => { offRegister(); offUnregister(); };
}
export function identities(wallet: Wallet): WalletIdentity[] {
  return wallet.accounts.filter(account => account.features.includes(SolanaSignTransaction)).map(account => ({
    id: `${wallet.name}:${account.address}`, address: account.address, label: `${wallet.name} · ${account.label ?? account.address.slice(0, 8)}`, wallet, account,
  }));
}
export async function connectWallet(wallet: Wallet) {
  const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
  await feature.connect();
  return identities(wallet);
}
export function watchIdentityWallet(wallet: Wallet, changed: () => void) {
  const events = wallet.features[StandardEvents] as StandardEventsFeature[typeof StandardEvents] | undefined;
  return events?.on('change', changed) ?? (() => {});
}
export async function disconnectWallet(wallet: Wallet) {
  const feature = wallet.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect] | undefined;
  await feature?.disconnect();
}
export function signerFor(identity: WalletIdentity): SignerConnection {
  const feature = identity.wallet.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
  if (!identity.wallet.accounts.some(account => account.address === identity.address)) throw new Error('Wallet account disconnected or changed. Reconnect it before signing.');
  if (!identity.account.chains.includes(LOCAL_CHAIN) || !identity.wallet.chains.includes(LOCAL_CHAIN)) {
    throw new Error('Wrong network: this wallet identity does not advertise localnet support. Use a compatible wallet/custom local network; do not switch to real funds.');
  }
  if (!feature?.supportedTransactionVersions.includes('legacy')) throw new Error('Wallet must support Wallet Standard legacy transaction signing.');
  return { address: identity.address, label: identity.label, sign: async transaction => {
    if (!identity.wallet.accounts.some(account => account.address === identity.address)) throw new Error('Wallet account changed while signing.');
    const [result] = await feature.signTransaction({ account: identity.account, transaction, chain: LOCAL_CHAIN });
    if (!result) throw new Error('Wallet did not return a signed transaction.');
    return result.signedTransaction;
  } };
}
