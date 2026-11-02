import { useEffect, useRef, useState } from 'react';
import { Connection, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import type { Wallet } from '@wallet-standard/base';
import { DEVELOPMENT_STAGES, PROJECT_STATUS } from '@pqc-wallet/sdk';
import { ConfirmedTransactionFailure, WALLET_PROGRAM_ID, approvalInstruction, depositInstruction, describeError, executeInstruction, formatSOL, initializeInstruction,
  loadSnapshot, localEndpoint, parseU64, proposalInstruction, signatureStatus, submitInstructions, validateOwners, vaultAddress, verifyLocalNetwork,
  type Network, type Progress, type PendingReceipt, type Snapshot, type SignerConnection } from '@pqc-wallet/sdk/interface';
import { connectWallet, disconnectWallet, discoverWallets, identities, signerFor, watchIdentityWallet, watchWallets, type WalletIdentity } from './wallets';
import { ProposalCard } from './ProposalCard';
import { TransactionJournal, PENDING_KEY, withTransactionLock } from './journal';
import { SignatureQueue, type SignatureRequest } from './signing';

export function TransactionStatus({ progress }: { progress?: Progress }) {
  if (!progress) return <p>No transaction submitted.</p>;
  return <div role={progress.phase === 'failed' || progress.phase === 'unknown' ? 'alert' : 'status'}>
    <strong>{progress.phase.toUpperCase()}</strong>: {progress.message}
    {progress.signature && <p>Transaction signature: <code>{progress.signature}</code></p>}
  </div>;
}
export function App() {
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8899');
  const [connection, setConnection] = useState<Connection>();
  const [network, setNetwork] = useState<Network>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [connected, setConnected] = useState<Wallet[]>([]);
  const [walletAccounts, setWalletAccounts] = useState<WalletIdentity[]>([]);
  const [activeId, setActiveId] = useState('');
  const [owners, setOwners] = useState(['', '', '']);
  const [vaultId, setVaultId] = useState('0');
  const [vaultInput, setVaultInput] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [loadedAddress, setLoadedAddress] = useState('');
  const [depositAmount, setDepositAmount] = useState('1000000');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1000000');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<Progress>();
  const [signatureRequest, setSignatureRequest] = useState<SignatureRequest>();
  const [walletBusy, setWalletBusy] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<PendingReceipt>();
  const [journalBlocked, setJournalBlocked] = useState(false);
  const journal = useRef<TransactionJournal | undefined>(undefined);
  const pending = useRef<PendingReceipt | undefined>(undefined);
  const actionInFlight = useRef(false);
  const signatureQueue = useRef<SignatureQueue | undefined>(undefined);
  if (!signatureQueue.current) signatureQueue.current = new SignatureQueue(setSignatureRequest);
  const [initReview, setInitReview] = useState<{ owners: string[]; vaultId: bigint; address: string }>();
  const generation = useRef(0);
  const refreshing = useRef(false);
  const dataRequest = useRef(0);
  const active = walletAccounts.find(account => account.id === activeId);
  const unknown = progress?.phase === 'unknown' || !!pendingReceipt;
  const uncertainSignature = progress?.signature ?? pendingReceipt?.signature;
  const disabled = busy || unknown || journalBlocked || !connection || !network;
  useEffect(() => {
    function restore() {
      try {
        journal.current = new TransactionJournal(window.localStorage);
        const receipt = journal.current.read(); pending.current = receipt; setPendingReceipt(receipt);
        if (receipt) {
          setEndpoint(receipt.endpoint);
          setProgress({ phase: 'unknown', signature: receipt.signature, message: 'Unresolved public receipt restored. Verify its original local network and check confirmation before another payment.' });
        }
      } catch (cause) { setJournalBlocked(true); setError(describeError(cause)); }
    }
    restore();
    const changed = (event: StorageEvent) => { if (event.key === PENDING_KEY) restore(); };
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('storage', changed); signatureQueue.current?.cancel(); };
  }, []);

  useEffect(() => { const changed = () => setWallets(discoverWallets()); changed(); return watchWallets(changed); }, []);
  useEffect(() => {
    const changed = () => {
      // A benign wallet account switch must not discard already verified signatures.
      setWalletAccounts(connected.flatMap(identities));
    };
    changed();
    const off = connected.map(wallet => watchIdentityWallet(wallet, changed));
    return () => off.forEach(remove => remove());
  }, [connected]);

  async function refresh(address = loadedAddress, current = connection, expected = network) {
    if (!address || !current || !expected) return;
    const request = generation.current;
    const read = ++dataRequest.current;
    try {
      await verifyLocalNetwork(current, expected.genesis, expected.deployment);
      const result = await loadSnapshot(current, address);
      if (generation.current !== request || dataRequest.current !== read) return;
      setSnapshot(result); setError('');
    } catch (cause) {
      if (generation.current === request && dataRequest.current === read) { setSnapshot(undefined); setError(describeError(cause)); }
    }
  }
  useEffect(() => {
    if (!loadedAddress || !connection || !network) return;
    const timer = setInterval(() => {
      if (refreshing.current || busy) return;
      refreshing.current = true;
      void refresh().finally(() => { refreshing.current = false; });
    }, 5_000);
    return () => clearInterval(timer);
  }, [loadedAddress, connection, network, busy]);

  async function operation(task: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true; setBusy(true); setError('');
    try { await task(); } catch (cause) { const message = describeError(cause); setError(message); if (message.startsWith('RPC unavailable')) setSnapshot(undefined); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  async function walletOperation(task: () => Promise<void>) {
    setWalletBusy(true);
    try { await task(); } catch (cause) { setError(describeError(cause)); }
    finally { setWalletBusy(false); }
  }
  function settleReceipt(signature: string) {
    if (!journal.current) throw new Error('Public transaction journal unavailable.');
    journal.current.clear(signature); pending.current = undefined; setPendingReceipt(undefined);
  }
  function requireConnection() {
    if (!connection || !network) throw new Error('Verify the local network first.');
    return { connection, network };
  }
  function requireSigner() {
    if (!active) throw new Error('Connect and select a wallet first.');
    return signerFor(active);
  }
  async function connectRPC() {
    generation.current++; setSnapshot(undefined); setLoadedAddress(''); setNetwork(undefined); setConnection(undefined); setInitReview(undefined);
    const candidate = new Connection(localEndpoint(endpoint), 'confirmed');
    if (pending.current && localEndpoint(endpoint) !== pending.current.endpoint) throw new Error('Resolve the pending transaction on its original RPC before switching networks.');
    const verified = await verifyLocalNetwork(candidate, pending.current?.genesis);
    setConnection(candidate); setNetwork(verified);
  }
  async function fresh() {
    const current = requireConnection();
    if (!loadedAddress) throw new Error('Load a vault first.');
    const request = generation.current; const read = ++dataRequest.current;
    await verifyLocalNetwork(current.connection, current.network.genesis, current.network.deployment);
    const result = await loadSnapshot(current.connection, loadedAddress);
    if (generation.current !== request) throw new Error('Wallet or network changed; refresh the account state.');
    if (dataRequest.current === read) setSnapshot(result);
    return result;
  }
  async function send(instructions: TransactionInstruction[], signers: SignerConnection[], address = loadedAddress) {
    return withTransactionLock(navigator.locks, async () => {
      const stored = journal.current?.read();
      if (stored) { pending.current = stored; setPendingReceipt(stored); throw new Error('A pending transaction must be reconciled before another payment.'); }
      const current = requireConnection();
      const request = generation.current;
      let final: Progress | undefined;
      if (pending.current) throw new Error('Resolve the previous transaction before another payment.');
      setProgress(undefined);
      try {
        await submitInstructions(current.connection, current.network, instructions, signers, state => {
          if (state.phase === 'submitting') {
            if (!journal.current || !state.receipt) throw new Error('Cannot persist a public transaction receipt. Nothing was submitted.');
            journal.current.record(state.receipt); pending.current = state.receipt; setPendingReceipt(state.receipt);
          }
          if ((state.phase === 'confirmed' || state.phase === 'failed') && state.signature) settleReceipt(state.signature);
          final = state; setProgress(state);
        }, () => { if (generation.current !== request) throw new Error('Network or vault selection changed. Start a fresh signing round.'); });
      } catch (cause) {
        const receipt = pending.current ?? journal.current?.read();
        if (receipt) { pending.current = receipt; setPendingReceipt(receipt); }
        setProgress({ phase: receipt ? 'unknown' : 'failed', message: describeError(cause), ...(receipt ? { signature: receipt.signature } : {}) });
        throw cause;
      }
      if (final && (final as Progress).phase === 'confirmed' && generation.current === request) {
        if (address) { setLoadedAddress(address); setVaultInput(address); await refresh(address, current.connection, current.network); }
      }
    });
  }
  async function onProposal(action: 'approve' | 'execute', address: string) {
    const current = requireConnection(); const signer = requireSigner(); const state = await fresh();
    const proposal = state.proposals.find(item => item.address === address);
    if (!proposal) throw new Error('Proposal is no longer available from the actual vault accounts.');
    const instruction = action === 'approve' ? await approvalInstruction(current.connection, proposal, signer.address) : await executeInstruction(current.connection, proposal);
    await send([instruction], [signer]);
  }
  let derived = '';
  try { derived = vaultAddress(validateOwners(owners)[0], parseU64(vaultId)).toBase58(); } catch { /* Display only when all public inputs are valid. */ }

  return <main>
    <header><p className="eyebrow">Solana wallet research</p><h1>{PROJECT_STATUS.name}</h1><p className="notice">{PROJECT_STATUS.notice}</p>
      <p><strong>{PROJECT_STATUS.security}</strong></p><p>Local transactions only. Devnet and mainnet transactions are disabled.</p></header>
    {error && <div role="alert" className="error">{error}</div>}
    <section aria-labelledby="network-title"><h2 id="network-title">1. Local network and program</h2>
      <form onSubmit={event => { event.preventDefault(); void operation(connectRPC); }}>
        <label>Local RPC URL<input value={endpoint} disabled={busy || unknown} onChange={event => setEndpoint(event.target.value)} /></label>
        <button disabled={busy}>Verify local network</button>
      </form>
      <dl><dt>Network</dt><dd>{network ? 'Verified local validator' : 'Not verified'}</dd>
        <dt>Verified RPC</dt><dd>{network?.endpoint ?? '—'}</dd><dt>Genesis hash</dt><dd><code>{network?.genesis ?? '—'}</code></dd>
        <dt>Program ID</dt><dd><code>{WALLET_PROGRAM_ID.toBase58()}</code></dd>
        <dt>Upgrade trust</dt><dd>{network?.deployment?.kind === 'upgradeable' ? <>Upgradeable: authority <code>{network.deployment.authority}</code> can replace every vault authorization rule.</> : network?.deployment ? 'Immutable program: no upgrade authority reported by its loader.' : 'Not checked'}</dd></dl>
      <p>The compiled program must already be loaded in local genesis. This page cannot deploy it.</p>
    </section>
    <section aria-labelledby="wallet-title"><h2 id="wallet-title">2. Wallet connections</h2>
      <p>Connect Wallet Standard wallets with localnet and legacy sign-transaction support. Signing stays inside the wallets; the app never receives private keys.</p>
      {!wallets.length && <p>No compatible Wallet Standard wallet detected. Open this page in a browser with a compatible wallet installed.</p>}
      <div className="actions">{wallets.map((wallet, index) => <button key={`${wallet.name}-${index}`} disabled={walletBusy || unknown} onClick={() => void walletOperation(async () => {
        await connectWallet(wallet); setConnected(previous => previous.includes(wallet) ? [...previous] : [...previous, wallet]);
      })}>Connect {wallet.name}</button>)}</div>
      <label>Active wallet<select value={activeId} disabled={walletBusy || unknown} onChange={event => setActiveId(event.target.value)}>
        <option value="">Select a connected identity</option>{walletAccounts.map(account => <option key={account.id} value={account.id}>{account.label} — {account.address}</option>)}
      </select></label>
      {active && <p>Active public key: <code>{active.address}</code></p>}
      {connected.map((wallet, index) => <button key={index} disabled={walletBusy || unknown} onClick={() => void walletOperation(async () => {
        await disconnectWallet(wallet); setConnected(previous => previous.filter(item => item !== wallet));
      })}>Disconnect {wallet.name}</button>)}
      <p className="notice">Demonstration only: three identities on one computer do not prove independent device security.</p>
    </section>
    <section aria-labelledby="init-title"><h2 id="init-title">3. Initialize a vault — all three owners sign</h2>
      <p>Enter three distinct authorization public keys. Connect or switch to each identity when its signature is requested. Owner 1 funds the account rent and transaction fee. No owner receives an automatic approval.</p>
      <form onSubmit={event => { event.preventDefault(); void operation(async () => {
        requireConnection(); validateOwners(owners);
        const id = parseU64(vaultId); setInitReview({ owners: [...owners], vaultId: id, address: derived });
      }); }}>
        {owners.map((owner, index) => <label key={index}>Authorization identity {index + 1}<input list="connected-identities" placeholder="Authorization public key only" value={owner} disabled={busy || unknown} onChange={event => {
          setOwners(previous => previous.map((key, position) => position === index ? event.target.value : key)); setInitReview(undefined);
        }} /></label>)}
        <datalist id="connected-identities">{walletAccounts.map(account => <option key={account.id} value={account.address}>{account.label}</option>)}</datalist>
        <label>Vault ID (integer)<input value={vaultId} disabled={busy || unknown} onChange={event => { setVaultId(event.target.value); setInitReview(undefined); }} /></label>
        <p>Derived vault address: <code>{derived || 'Choose valid identities and a vault ID'}</code></p>
        <button disabled={disabled}>Review initialization</button>
      </form>
      {initReview && <div className="review"><h3>Initialization review</h3><p>Vault: <code>{initReview.address}</code>; ID {initReview.vaultId.toString()}</p>
        <ol>{initReview.owners.map(owner => <li key={owner}><code>{owner}</code></li>)}</ol>
        <p>Each wallet will sign the same initialization message. All three valid signatures are required before submission. If signing expires, start again with all three.</p>
        <button disabled={disabled} onClick={() => void operation(async () => {
          const { connection: current } = requireConnection();
          const signers = initReview.owners.map((owner, index) => ({ address: owner, label: `Owner ${index + 1}`,
            sign: (bytes: Uint8Array) => signatureQueue.current!.request(owner, bytes) }));
          const instruction = await initializeInstruction(current, initReview.owners, initReview.vaultId);
          await send([instruction], signers, initReview.address); setInitReview(undefined);
        })}>Collect all 3 signatures and initialize</button>
      </div>}
    </section>
    {signatureRequest && <section aria-label="Initialization signing request">
      <h2>Required authorization signature</h2><p>Connect or switch your external wallet to <code>{signatureRequest.address}</code>. Earlier verified signatures remain in this same message.</p>
      <button disabled={signatureRequest.signing || !walletAccounts.some(account => account.address === signatureRequest.address)} onClick={() => {
        const identity = walletAccounts.find(account => account.address === signatureRequest.address);
        if (!identity) return;
        void signatureQueue.current!.sign(identity.address, async bytes => {
          const current = requireConnection(); await verifyLocalNetwork(current.connection, current.network.genesis, current.network.deployment);
          const blockhash = Transaction.from(bytes).recentBlockhash!;
          if (!(await current.connection.isBlockhashValid(blockhash, { commitment: 'confirmed' })).value) throw new Error('Signing blockhash expired. Rebuild and collect all three signatures again. Nothing was submitted.');
          return signerFor(identity).sign(bytes);
        });
      }}>Sign with requested identity</button>
      <button onClick={() => signatureQueue.current!.cancel()}>Cancel signing round</button>
      <p>If the blockhash expires, restart with the initialization button and all three wallets. Partial signatures are never carried into a new message.</p>
    </section>}
    <section aria-labelledby="vault-title"><h2 id="vault-title">4. Load vault and deposit test SOL</h2>
      <form onSubmit={event => { event.preventDefault(); void operation(async () => {
        const current = requireConnection(); const address = new PublicKey(vaultInput).toBase58();
        generation.current++; setSnapshot(undefined); setLoadedAddress('');
        await verifyLocalNetwork(current.connection, current.network.genesis, current.network.deployment);
        const result = await loadSnapshot(current.connection, address); setLoadedAddress(address); setSnapshot(result);
      }); }}><label>Vault address<input value={vaultInput} disabled={busy || unknown} onChange={event => setVaultInput(event.target.value)} /></label><button disabled={disabled}>Load vault</button></form>
      {snapshot ? <><dl><dt>Loaded vault</dt><dd><code>{snapshot.vault.address}</code></dd>
        <dt>Actual balance</dt><dd>{snapshot.vault.balance.toString()} lamports ({formatSOL(snapshot.vault.balance)} SOL)</dd>
        <dt>Rent reserve</dt><dd>{snapshot.vault.rent.toString()} lamports</dd><dt>Spendable balance</dt><dd>{snapshot.vault.spendable.toString()} lamports</dd>
        <dt>Next proposal nonce</dt><dd>{snapshot.vault.nextNonce.toString()}</dd><dt>Confirmed slot</dt><dd>{snapshot.slot.toString()}</dd></dl>
        <h3>Recorded owners</h3><ol>{snapshot.vault.owners.map(owner => <li key={owner}><code>{owner}</code></li>)}</ol>
        <button disabled={disabled} onClick={() => void operation(async () => { await fresh(); })}>Refresh actual account state</button>
        <form onSubmit={event => { event.preventDefault(); void operation(async () => {
          const { connection: current } = requireConnection(); const signer = requireSigner(); const state = await fresh();
          await send([await depositInstruction(current, state.vault.address, signer.address, parseU64(depositAmount, true))], [signer]);
        }); }}><label>Deposit (integer lamports)<input value={depositAmount} disabled={disabled} onChange={event => setDepositAmount(event.target.value)} /></label>
          <button disabled={disabled || !active}>Deposit test SOL</button></form>
      </> : <p>No current vault data loaded. An RPC failure clears stale balances; zero is not substituted.</p>}
    </section>
    <section aria-labelledby="propose-title"><h2 id="propose-title">5. Propose a transfer</h2>
      <p>Amounts use integer lamports: 1 SOL = 1,000,000,000 lamports. Expiry is an absolute slot, not a timestamp. Proposal rent is paid by the active owner and stays locked.</p>
      <form onSubmit={event => { event.preventDefault(); void operation(async () => {
        const { connection: current } = requireConnection(); const signer = requireSigner(); const state = await fresh();
        const instruction = await proposalInstruction(current, state, signer.address, recipient, parseU64(amount, true), parseU64(expiry, true));
        await send([instruction], [signer]);
      }); }}><label>Recipient public key<input value={recipient} disabled={disabled} onChange={event => setRecipient(event.target.value)} /></label>
        <label>Transfer amount (integer lamports)<input value={amount} disabled={disabled} onChange={event => setAmount(event.target.value)} /></label>
        <label>Expiry slot<input value={expiry} placeholder={snapshot ? `Greater than ${snapshot.slot}` : 'Load a vault first'} disabled={disabled} onChange={event => setExpiry(event.target.value)} /></label>
        <button type="button" disabled={disabled || !snapshot} onClick={() => { if (snapshot) setExpiry((snapshot.slot + 1_000n).toString()); }}>Use current slot + 1000</button>
        <button disabled={disabled || !snapshot || !active || !snapshot.vault.owners.includes(active.address)}>Create immutable proposal</button>
        {snapshot && active && !snapshot.vault.owners.includes(active.address) && <p>Unauthorized wallet: only a recorded owner can propose or approve. Anyone may deposit or pay to execute.</p>}
      </form>
    </section>
    <section aria-labelledby="proposals-title"><h2 id="proposals-title">6. Inspect, approve and execute</h2>
      <p>Read the exact recipient, amount and expiry before approving. Counts come from the on-chain approval bits. This page never adds an optimistic approval.</p>
      {snapshot?.proposals.map(proposal => <ProposalCard key={proposal.address} snapshot={snapshot} proposal={proposal} activeAddress={active?.address} disabled={disabled}
        onApprove={() => void operation(() => onProposal('approve', proposal.address))} onExecute={() => void operation(() => onProposal('execute', proposal.address))} />)}
      {snapshot && !snapshot.proposals.length && <p>No proposals recorded for this vault.</p>}
    </section>
    <section aria-labelledby="transaction-title"><h2 id="transaction-title">Transaction outcome</h2><TransactionStatus progress={progress} />
      {unknown && uncertainSignature && <button disabled={busy} onClick={() => void operation(async () => {
        const { connection: current, network: expected } = requireConnection(); await verifyLocalNetwork(current, expected.genesis, expected.deployment);
        let status: 'confirmed' | 'pending';
        try { status = await signatureStatus(current, uncertainSignature); }
        catch (cause) {
          if (cause instanceof ConfirmedTransactionFailure) { settleReceipt(uncertainSignature); setProgress({ ...progress, phase: 'failed', message: describeError(cause) }); return; }
          throw cause;
        }
        if (status === 'confirmed') { settleReceipt(uncertainSignature); setProgress({ ...progress, phase: 'confirmed', message: 'Transaction confirmed by the local validator.' }); await refresh(); }
        else setError('Transaction is still unconfirmed. Check its signature before retrying.');
      })}>Check transaction confirmation</button>}
    </section>
    <details><summary>Development stages</summary><ol>{DEVELOPMENT_STAGES.map(stage => <li key={stage.id}>{stage.title} — {stage.status}</li>)}</ol></details>
  </main>;
}
