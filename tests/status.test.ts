import assert from 'node:assert/strict';
import test from 'node:test';
import { DEVELOPMENT_STAGES, PROJECT_STATUS } from '@pqc-wallet/sdk';

test('public SDK explicitly reports the unimplemented, non-PQC foundation', () => {
  assert.match(PROJECT_STATUS.security, /NOT quantum-resistant/);
  assert.match(PROJECT_STATUS.implementation, /No vault, transfers, or PQC implemented/);
  assert.equal(PROJECT_STATUS.notice, 'Experimental — local/devnet only.');
});

test('roadmap keeps PQC integration conditional on prior research', () => {
  assert.deepEqual(DEVELOPMENT_STAGES.map(stage => stage.id), [1, 2, 3]);
  assert.match(DEVELOPMENT_STAGES[0].title, /2-of-3 independent-key SOL/);
  assert.equal(DEVELOPMENT_STAGES[2].status, 'Conditional');
  assert.match(DEVELOPMENT_STAGES[2].title, /only if feasibility passes/);
});
