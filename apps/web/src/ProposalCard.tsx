import { actionState, formatSOL, type ProposalView, type Snapshot } from '@pqc-wallet/sdk/interface';

export function ProposalCard({ snapshot, proposal, activeAddress, disabled, onApprove, onExecute }: {
  snapshot: Snapshot; proposal: ProposalView; activeAddress?: string; disabled: boolean;
  onApprove: () => void; onExecute: () => void;
}) {
  const state = actionState(snapshot, proposal, activeAddress);
  return <article className="proposal" aria-label={`Proposal ${proposal.nonce}`}>
    <h3>Proposal {proposal.nonce.toString()} · {proposal.executed ? 'Executed' : state.expired ? 'Expired' : 'Pending'}</h3>
    <dl>
      <dt>Account</dt><dd><code>{proposal.address}</code></dd>
      <dt>Recipient</dt><dd><code>{proposal.recipient}</code></dd>
      <dt>Amount</dt><dd>{proposal.amount.toString()} lamports ({formatSOL(proposal.amount)} SOL)</dd>
      <dt>Expiry slot</dt><dd>{proposal.expirySlot.toString()} · current slot {snapshot.slot.toString()}</dd>
      <dt>Approvals</dt><dd>{state.count} of 3 · 2 required</dd>
    </dl>
    <ul>{snapshot.vault.owners.map((owner, index) => <li key={owner}>
      Owner {index + 1}: <code>{owner}</code> — {proposal.approvals & (1 << index) ? 'Approved' : 'Not approved'}
    </li>)}</ul>
    <div className="actions">
      <button disabled={disabled || !!state.approveReason} onClick={onApprove}>Approve proposal {proposal.nonce.toString()}</button>
      <button disabled={disabled || !!state.executeReason} onClick={onExecute}>Execute proposal {proposal.nonce.toString()}</button>
    </div>
    {state.approveReason && <p>Approval: {state.approveReason}</p>}
    {state.executeReason && <p>Execution: {state.executeReason}</p>}
  </article>;
}
