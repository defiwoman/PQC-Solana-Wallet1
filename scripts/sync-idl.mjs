import { mkdir, copyFile } from 'node:fs/promises';
const destination = new URL('../packages/sdk/src/generated/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL('../target/wallet.json', import.meta.url), new URL('wallet.json', destination));
await copyFile(new URL('../target/wallet.ts', import.meta.url), new URL('wallet.ts', destination));
