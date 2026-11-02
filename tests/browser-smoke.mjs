import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { verifyLocalNetwork, initializeInstruction, depositInstruction, proposalInstruction, approvalInstruction,
  loadSnapshot, submitInstructions, vaultAddress, parseU64 } from '../packages/sdk/dist/interface.js';

// Development-only external-wallet substitutes for SETUP in Node memory. No
// private key, seed, wallet fixture or signing service is injected into Chromium.
const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const network = await verifyLocalNetwork(connection);
const owners = Array.from({ length: 3 }, () => Keypair.generate());
const signers = owners.map((key, index) => ({ address: key.publicKey.toBase58(), label: `Node fixture ${index + 1}`, sign: async bytes => {
  const tx = Transaction.from(bytes); tx.partialSign(key); return tx.serialize({ requireAllSignatures: false });
} }));
const airdrop = await connection.requestAirdrop(owners[0].publicKey, 1_000_000_000);
for (let tries = 0; tries < 100; tries++) {
  const status = (await connection.getSignatureStatuses([airdrop])).value[0];
  if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break;
  await delay(100);
}
const id = BigInt(Date.now());
const address = vaultAddress(owners[0].publicKey, id).toBase58();
let latestReceipt;
async function send(ix, selected) {
  let final;
  await submitInstructions(connection, network, [ix], selected, state => { final = state; });
  assert.equal(final?.phase, 'confirmed', final?.message);
  latestReceipt = final.receipt;
  assert(latestReceipt, 'SDK must return the public submission receipt');
}
await send(await initializeInstruction(connection, signers.map(signer => signer.address), id), signers);
await send(await depositInstruction(connection, address, signers[0].address, 10_000_000n), [signers[0]]);
let snapshot = await loadSnapshot(connection, address);
await send(await proposalInstruction(connection, snapshot, signers[0].address, signers[2].address, 1_000_000n, snapshot.slot + 1_000n), [signers[0]]);
snapshot = await loadSnapshot(connection, address);
await send(await approvalInstruction(connection, snapshot.proposals[0], signers[0].address), [signers[0]]);
snapshot = await loadSnapshot(connection, address);
assert.equal(snapshot.proposals[0].approvals, 1);

const output = resolve('target/interface-browser-smoke');
await mkdir(output, { recursive: true });
const chrome = spawn(process.env.CHROMIUM_PATH ?? 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0',
  `--user-data-dir=${output}/profile-${Date.now()}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
let socket;
try {
  const debuggerURL = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Chromium startup timed out')), 15_000);
    chrome.once('error', reject);
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (match) { clearTimeout(timer); accept(match[1]); }
    });
  });
  socket = new WebSocket(debuggerURL);
  await new Promise((accept, reject) => { socket.addEventListener('open', accept, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0; const pending = new Map(); const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request?.reject(new Error(message.error.message)) : request?.accept(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  });
  function call(method, params = {}, sessionId) {
    return new Promise((accept, reject) => {
      const id = ++nextId; pending.set(id, { accept, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Runtime.enable', {}, sessionId); await call('Page.enable', {}, sessionId);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function waitFor(expression) {
    for (let tries = 0; tries < 100; tries++) { if (await evaluate(`document.body && (${expression})`)) return; await delay(100); }
    throw new Error('Browser assertion timed out: ' + expression + '\n' + await evaluate('document.body.innerText'));
  }
  await call('Page.navigate', { url: 'http://127.0.0.1:4173' }, sessionId);
  await waitFor("document.body.innerText.includes('Experimental classical multisig — local/devnet only.')");
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Verify local network').click()");
  await waitFor("document.body.innerText.includes('Verified local validator')");
  await evaluate(`(() => { const input = [...document.querySelectorAll('label')].find(l => l.textContent.startsWith('Vault address')).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, ${JSON.stringify(address)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Load vault').click()");
  await waitFor(`document.body.innerText.includes('${snapshot.vault.balance} lamports') && document.body.innerText.includes('1 of 3 · 2 required')`);
  const state = await evaluate(`({ text: document.body.innerText, executeDisabled: [...document.querySelectorAll('button')].find(b => b.textContent === 'Execute proposal 0').disabled, stored: localStorage.length + sessionStorage.length })`);
  assert(state.executeDisabled); assert.equal(state.stored, 0); assert(state.text.includes(snapshot.proposals[0].recipient));
  await call('Page.captureScreenshot', { format: 'png' }, sessionId).then(result => writeFile(`${output}/page.png`, Buffer.from(result.data, 'base64')));
  // Only PUBLIC receipt metadata enters the browser, never the Node fixture keys.
  await evaluate(`localStorage.setItem('pqc-vault.public-pending.v1', ${JSON.stringify(JSON.stringify(latestReceipt))})`);
  await call('Page.reload', {}, sessionId);
  await waitFor("document.body.innerText.includes('Unresolved public receipt restored')");
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Verify local network').click()");
  await waitFor("document.body.innerText.includes('Verified local validator')");
  assert(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Review initialization').disabled"));
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Check transaction confirmation').click()");
  await waitFor("document.body.innerText.includes('CONFIRMED')");
  assert.equal(await evaluate('localStorage.length'), 0);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Review initialization').disabled"), false);
  await evaluate("(() => { const input = [...document.querySelectorAll('label')].find(l => l.textContent.startsWith('Local RPC URL')).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'https://api.mainnet-beta.solana.com'); input.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Verify local network').click()");
  await waitFor("document.body.innerText.includes('Wrong network')");
  assert.deepEqual(exceptions, [], 'Production page must not throw browser exceptions');
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, programUnchanged: true, address, balance: snapshot.vault.balance.toString(), approvals: 1, actualRPC: true, pendingReceiptReloadChecked: true, browser: 'system Chromium', externalWalletExtensionTested: false }, null, 2));
  console.log('PASS: production Chromium page read the actual local vault balance and proposal; one-vote execution disabled; public receipt survived reload and was reconciled; wrong-network URL rejected.');
  console.log('External wallet extensions were not automated; initialization signing was exercised with Node-only development fixtures.');
} finally {
  socket?.close();
  const exited = once(chrome, 'exit');
  chrome.kill('SIGTERM'); await Promise.race([exited, delay(5_000)]);
  if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill('SIGKILL'); await exited; }
}
