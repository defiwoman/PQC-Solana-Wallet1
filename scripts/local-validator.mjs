import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const idl = JSON.parse(await readFile(new URL('../target/wallet.json', import.meta.url), 'utf8'));
const ledger = resolve('target/browser-validator', String(Date.now()));
await mkdir(ledger, { recursive: true });
console.log('Starting a fresh LOCAL-ONLY validator on loopback port 8899. No public deployment is performed.');
console.log('Public program ID:', idl.address);
console.log('Use Wallet Standard localnet-capable external wallets. Never import a real seed into this application.');
const child = spawn('solana-test-validator', [
  '--ledger', ledger, '--bind-address', '127.0.0.1', '--rpc-port', '8899',
  '--bpf-program', idl.address, resolve('target/deploy/wallet.so'), '--limit-ledger-size', '10000',
], { stdio: 'inherit' });
child.on('error', error => { console.error('Local validator could not start:', error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
