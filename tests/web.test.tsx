import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../apps/web/src/App';

test('rendered page exposes the experimental warning and all planned stages', () => {
  const html = renderToStaticMarkup(<App />);
  assert.match(html, /Experimental classical multisig — local\/devnet only\./);
  assert.match(html, /NOT quantum-resistant/);
  assert.match(html, /classical 2-of-3 SOL vault/);
  assert.match(html, /Classical 2-of-3 independent-key SOL vault/);
  assert.match(html, /Research actual on-chain PQC verification/);
  assert.match(html, /Mandatory PQC authorization only if feasibility passes/);
});
