import { useState } from 'react';
import type { AuthorityState } from './authority';

export function AuthorityPanel({ state, disabled, onApprove }: { state: AuthorityState; disabled: boolean; onApprove: (input: string, review: { reviewed: boolean; note: string }) => void }) {
  const [input, setInput] = useState(''); const [note, setNote] = useState(''); const [reviewed, setReviewed] = useState(false);
  return <section aria-labelledby="baseline-title"><h2 id="baseline-title">Approved authority baseline</h2>
    <p>This browser check cannot stop the actual upgrade authority from replacing the on-chain program or changing spending rules.</p>
    {state.hold && <p role="alert">New signing blocked. {state.hold}</p>}
    <dl><dt>Expected network</dt><dd>{state.baseline ? `${state.baseline.network} · ${state.baseline.genesisHash}` : 'Not approved'}</dd>
      <dt>Expected program</dt><dd><code>{state.baseline?.programId ?? 'Not approved'}</code></dd>
      <dt>Expected upgrade authority</dt><dd><code>{state.baseline ? state.baseline.expectedAuthority ?? 'None — explicit immutable local fixture expectation' : 'Not approved'}</code></dd></dl>
    <p>Paste the public baseline from the local validator terminal/file that you started and reviewed. This form never copies the RPC-reported authority. A replacement is an explicit trust decision, not a network refresh.</p>
    <label>Reviewed public baseline JSON<textarea rows={7} value={input} disabled={disabled} onChange={event => { setInput(event.target.value); setReviewed(false); }} /></label>
    <label>Baseline review note<input value={note} disabled={disabled} placeholder="For example: reviewed my new disposable local validator" onChange={event => setNote(event.target.value)} /></label>
    <label><input type="checkbox" checked={reviewed} disabled={disabled} onChange={event => setReviewed(event.target.checked)} />I independently verified this public baseline, including its network, program and authority.</label>
    <button disabled={disabled || !reviewed} onClick={() => onApprove(input, { reviewed, note })}>Approve reviewed baseline</button>
  </section>;
}
