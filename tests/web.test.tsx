import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { Keypair } from '@solana/web3.js';
import { type ProposalView, type Snapshot } from '@pqc-wallet/sdk/interface';

// DOM fixtures carry public addresses only, never wallet secret keys.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  Event: { value: dom.window.Event, configurable: true },
  CustomEvent: { value: dom.window.CustomEvent, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true, configurable: true },
});
const { render, cleanup, fireEvent } = await import('@testing-library/react');
const { App, TransactionStatus } = await import('../apps/web/src/App');
const { ProposalCard } = await import('../apps/web/src/ProposalCard');
const { AuthorityPanel } = await import('../apps/web/src/AuthorityPanel');
afterEach(cleanup);
const owners = Array.from({ length: 3 }, () => Keypair.generate().publicKey.toBase58());
const vault = Keypair.generate().publicKey.toBase58(), to = Keypair.generate().publicKey.toBase58();
const base: ProposalView = { address: Keypair.generate().publicKey.toBase58(), vault, nonce: 0n, recipient: to, amount: 10n, expirySlot: 200n, approvals: 0, executed: false };
const snapshot: Snapshot = { vault: { address: vault, owners, vaultId: 0n, nextNonce: 1n, balance: 1_000n, rent: 100n, spendable: 900n }, proposals: [base], slot: 100n };
function card(proposal: ProposalView, activeAddress: string | undefined = owners[0], state = snapshot) {
  let approvals = 0, executions = 0;
  const view = render(<ProposalCard snapshot={state} proposal={proposal} activeAddress={activeAddress} disabled={false} onApprove={() => approvals++} onExecute={() => executions++} />);
  return { view, counts: () => ({ approvals, executions }) };
}
const disabled = (button: HTMLElement) => (button as HTMLButtonElement).disabled;

test('full interface exposes the security label, network, initialization and real-account workflows', () => {
  const view = render(<App />);
  assert(view.getByText('Experimental classical multisig — local/devnet only.'));
  assert(view.getByText(/NOT quantum-resistant/));
  assert.equal(view.queryByRole('button', { name: 'Collect all 3 signatures and initialize' }), null);
  assert(view.getByLabelText('Authorization identity 3'));
  assert(view.getByRole('button', { name: 'Load vault' }));
  assert(view.getByText(/Demonstration only/));
});

test('one approval cannot execute and an already-approved owner cannot approve again', () => {
  const { view, counts } = card({ ...base, approvals: 1 });
  assert(view.getByText('1 of 3 · 2 required'));
  assert(disabled(view.getByRole('button', { name: 'Approve proposal 0' })));
  const execute = view.getByRole('button', { name: 'Execute proposal 0' }); assert(disabled(execute));
  fireEvent.click(execute); assert.equal(counts().executions, 0);
});

test('a second distinct owner can approve; two recorded votes enable execution', () => {
  const first = card({ ...base, approvals: 1 }, owners[1]);
  const approve = first.view.getByRole('button', { name: 'Approve proposal 0' }); assert(!disabled(approve));
  fireEvent.click(approve); assert.equal(first.counts().approvals, 1);
  // Clicking does not invent a second on-chain approval.
  assert(first.view.getByText('1 of 3 · 2 required'));
  cleanup();
  const second = card({ ...base, approvals: 3 });
  const execute = second.view.getByRole('button', { name: 'Execute proposal 0' }); assert(!disabled(execute));
  fireEvent.click(execute); assert.equal(second.counts().executions, 1);
  assert(second.view.getByText(to));
});

test('unauthorized wallets cannot approve, while execution remains permissionless after two votes', () => {
  const { view } = card({ ...base, approvals: 3 }, Keypair.generate().publicKey.toBase58());
  assert(view.getByText('Approval: Unauthorized wallet'));
  assert(disabled(view.getByRole('button', { name: 'Approve proposal 0' })));
  assert(!disabled(view.getByRole('button', { name: 'Execute proposal 0' })));
});

test('expired and consumed proposals disable both actions', () => {
  for (const proposal of [{ ...base, approvals: 3, expirySlot: 100n }, { ...base, approvals: 3, executed: true }]) {
    const { view } = card(proposal);
    assert(disabled(view.getByRole('button', { name: 'Approve proposal 0' })));
    assert(disabled(view.getByRole('button', { name: 'Execute proposal 0' })));
    cleanup();
  }
});

test('insufficient spendable funds disables execution even with two approvals', () => {
  const { view } = card({ ...base, approvals: 3, amount: 901n });
  assert(view.getByText('Execution: Insufficient spendable SOL'));
  assert(disabled(view.getByRole('button', { name: 'Execute proposal 0' })));
});

test('transaction failures and ambiguous RPC outcomes are visible; confirmation is explicit', () => {
  for (const phase of ['failed', 'unknown', 'confirmed'] as const) {
    const view = render(<TransactionStatus progress={{ phase, message: phase === 'unknown' ? 'Check the signature before retrying.' : phase, signature: 'public-transaction-signature' }} />);
    assert(view.getByRole(phase === 'confirmed' ? 'status' : 'alert'));
    assert(view.getByText('public-transaction-signature')); cleanup();
  }
});


test('baseline approval is explicit and never prefilled from the observed authority', () => {
  let calls = 0;
  const view = render(<AuthorityPanel state={{ hold: 'Authority mismatch pending review' }} disabled={false} onApprove={() => { calls++; }} />);
  assert.equal((view.getByLabelText('Reviewed public baseline JSON') as HTMLTextAreaElement).value, '');
  assert(disabled(view.getByRole('button', { name: 'Approve reviewed baseline' })));
  assert(view.getByText(/cannot stop the actual upgrade authority/));
  fireEvent.click(view.getByRole('button', { name: 'Approve reviewed baseline' })); assert.equal(calls, 0);
  assert(view.getByRole('alert'));
});
