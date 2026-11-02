import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Connection, PublicKey } from '@solana/web3.js';
import { setTimeout as delay } from 'node:timers/promises';
const idl = JSON.parse(await readFile(new URL('../target/wallet.json', import.meta.url), 'utf8'));
// Do not mistake somebody else's existing RPC for the fixture we are starting.
await new Promise((accept, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(8899, '127.0.0.1', () => probe.close(error => error ? reject(error) : accept()));
});
const ledger = resolve('target/browser-validator', String(Date.now()));
await mkdir(ledger, { recursive: true });
console.log('Starting a fresh LOCAL-ONLY validator on loopback port 8899. No public deployment is performed.');
console.log('Public program ID:', idl.address);
console.log('Use Wallet Standard localnet-capable external wallets. Never import a real seed into this application.');
const child = spawn('solana-test-validator', [
  '--ledger', ledger, '--bind-address', '127.0.0.1', '--rpc-port', '8899',
  '--upgradeable-program', idl.address, resolve('target/deploy/wallet.so'), '11111111111111111111111111111111', '--limit-ledger-size', '10000',
], { stdio: 'inherit' });
child.on('error', error => { console.error('Local validator could not start:', error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });

// The authority expectation comes from this explicit local genesis recipe,
// NOT from an RPC-reported upgrade authority. Operator review is still required.
const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const loader = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const programId = new PublicKey(idl.address);
const programData = PublicKey.findProgramAddressSync([programId.toBuffer()], loader)[0];
let published = false;
for (let attempt = 0; attempt < 120; attempt++) {
  if (child.exitCode !== null || child.signalCode !== null) break;
  try {
    const genesisHash = await connection.getGenesisHash();
    const program = await connection.getAccountInfo(programId, 'confirmed');
    const data = await connection.getAccountInfo(programData, 'confirmed');
    if (!program?.executable || !program.owner.equals(loader) || program.data.length !== 36 || program.data.readUInt32LE(0) !== 2
        || !new PublicKey(program.data.subarray(4)).equals(programData) || !data?.owner.equals(loader) || data.data.length < 45
        || data.data.readUInt32LE(0) !== 3 || data.data.readBigUInt64LE(4) !== 0n || data.data[12] !== 1 || !new PublicKey(data.data.subarray(13, 45)).equals(new PublicKey('11111111111111111111111111111111'))) {
      throw new Error('Fixture does not match the explicit system-address-authority, slot-zero genesis recipe.');
    }
    const baseline = { version: 1, network: 'solana:localnet', genesisHash, programId: idl.address,
      loader: 'upgradeable', expectedAuthority: '11111111111111111111111111111111', programData: programData.toBase58(), deploymentSlot: '0' };
    const destination = resolve('target/local-authority-baseline.json');
    await writeFile(destination, JSON.stringify(baseline, null, 2) + '\n');
    console.log('PUBLIC LOCAL FIXTURE BASELINE — review before approving in the browser:');
    console.log(JSON.stringify(baseline, null, 2));
    console.log('Public file:', destination);
    console.log('Expected authority is the explicit system-address placeholder from this local genesis recipe, not a development key. No existing authority was changed and no devnet upgrade key was generated.');
    published = true; break;
  } catch { await delay(500); }
}

if (!published) {
  console.error('Could not verify our local fixture against its predetermined genesis recipe. No baseline was approved.');
  process.exitCode = 1; child.kill('SIGTERM');
}
