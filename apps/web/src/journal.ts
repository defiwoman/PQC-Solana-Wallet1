import { localEndpoint, type PendingReceipt } from '@pqc-wallet/sdk/interface';
import { PublicKey } from '@solana/web3.js';

export const PENDING_KEY = 'pqc-vault.public-pending.v1';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Public receipt only: never signatures-in-progress, transaction bytes or keys. */
export class TransactionJournal {
  constructor(private storage: StorageAccess) {}
  read(): PendingReceipt | undefined {
    const raw = this.storage.getItem(PENDING_KEY);
    if (!raw) return;
    const value = JSON.parse(raw) as PendingReceipt;
    if (!value || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value.signature) || typeof value.genesis !== 'string'
      || !Number.isSafeInteger(value.lastValidBlockHeight) || value.lastValidBlockHeight < 0
      || localEndpoint(value.endpoint) !== value.endpoint) throw new Error('Invalid pending public receipt. Inspect browser storage before making another payment.');
    new PublicKey(value.blockhash);
    return { signature: value.signature, endpoint: value.endpoint, genesis: value.genesis,
      blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
  }
  record(receipt: PendingReceipt) {
    const old = this.read();
    if (old && old.signature !== receipt.signature) throw new Error('Another transaction outcome is pending. Resolve it before retrying.');
    // Whitelist fields even if a future caller passes an object with extras.
    const raw = JSON.stringify({ signature: receipt.signature, endpoint: receipt.endpoint, genesis: receipt.genesis,
      blockhash: receipt.blockhash, lastValidBlockHeight: receipt.lastValidBlockHeight });
    this.storage.setItem(PENDING_KEY, raw);
    if (this.storage.getItem(PENDING_KEY) !== raw) throw new Error('Public receipt could not be persisted. Nothing was submitted.');
  }
  clear(signature: string) {
    const old = this.read();
    if (old && old.signature !== signature) throw new Error('Another pending transaction must be resolved first.');
    this.storage.removeItem(PENDING_KEY);
    if (this.storage.getItem(PENDING_KEY) !== null) throw new Error('Pending receipt could not be cleared. Verify the outcome before retrying.');
  }
}

/** Serialize signing/submission across tabs on this origin. The public journal
 * remains the lock after an uncertain result or a tab/browser restart. */
export async function withTransactionLock<T>(locks: Pick<LockManager, 'request'> | undefined, action: () => Promise<T>): Promise<T> {
  if (!locks) throw new Error('Web Locks are unavailable. Use a supported secure localhost browser; no transaction was submitted.');
  return locks.request('pqc-vault.submit.v1', { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Another tab is signing or submitting. Resolve that action before retrying.');
    return action();
  });
}
