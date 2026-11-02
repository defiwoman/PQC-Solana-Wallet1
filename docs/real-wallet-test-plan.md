# Real-wallet signing test plan

**Manual result: NOT RUN.** No installed wallet extension, real device, Windows
laptop or independent physical-key setup has been exercised by the agent.
Automated Node signers and Chromium account reads are separate checks.

## Requirements imposed by the current integration

The app discovers Wallet Standard `standard:connect` and `solana:signTransaction`.
The wallet and current account must advertise `solana:localnet`; signing feature
version 1.0.0 must advertise legacy transactions. Sign-and-send-only and
message-changing/meta-transaction wallets are intentionally unsupported. Each
returned signature must verify for the requested public key on the exact message.
All three initialization signatures are required, including across account switches.

The interface's metadata precheck is **advertisement only**, not a successful
signing test. Record the extension's actual version from Windows Chrome's
`chrome://extensions` Details page, not the Wallet Standard API version.

## Official evidence and candidate selection

Checked 3 November 2026 using official project repositories. Some documentation
web hosts were blocked in this environment; their official source was consulted.

**Backpack browser extension is the source-documented candidate for the local
manual test. It is not certified as working in its current store release.**
The official source revision reviewed is
`5a538a41d060d2c48507007f96c766483115aecc` (14 February 2024, v0.10.30):

- [Solana chains](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/wallet-standard/src/solana.ts)
  explicitly includes `solana:localnet`.
- [Account features/chains](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/wallet-standard/src/account.ts)
  exposes the same chain list and transaction-signing feature on accounts.
- [Wallet signing implementation](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/wallet-standard/src/wallet.ts)
  advertises legacy signing, accepts localnet, exposes account-change events and
  serializes partial legacy transactions without requiring all signatures.
- [RPC selection](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/app-extension/src/components/Unlocked/Settings/Preferences/Blockchains/ConnectionSwitch.tsx)
  and [custom RPC form](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/app-extension/src/components/Unlocked/Settings/Preferences/Blockchains/CustomRpcUrl.tsx)
  provide a custom connection URL.
- [Wallet creation](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/app-extension/src/components/Unlocked/Settings/AddConnectWallet/index.tsx)
  and [recovery-root creation](https://github.com/coral-xyz/backpack/blob/5a538a41d060d2c48507007f96c766483115aecc/packages/app-extension/src/components/Unlocked/Settings/AddConnectWallet/CreateMnemonic.tsx)
  distinguish new-wallet/derivation flows from creating recovery material.

This is old source evidence, **not a verified mapping to today's distributed
extension binary**. Install only from the current official Backpack website
(`https://backpack.app`) and its linked browser store; record what was installed.
Do not sideload that old development build or follow its obsolete suggestion to
disable localhost TLS verification. If today's release does not expose the
required features/custom RPC, stop and record the incompatibility. Do not disable
chain checks or remove initialization signers to make it work.

Phantom's [official SDK repository](https://github.com/phantom/wallet-sdk) establishes
injected extension support, but the material inspected did not establish this
exact localnet/partial-legacy workflow for the current extension. It is **not**
claimed as a compatible substitute. No compatibility conclusion was established
for Solflare here. Another wallet can be considered only with documented feature
evidence plus a recorded manual test.

## Manual record — all rows remain NOT RUN

Copy this table to a local test record and fill only observed results. Record
public addresses and transaction signatures, never recovery phrases/private keys.

| Test | Status | Evidence to record after performing |
| --- | --- | --- |
| Windows/WSL2 install and tool versions | NOT RUN | OS/WSL architecture and pinned versions |
| Current Backpack install/custom local RPC | NOT RUN | Official installation route and extension version |
| Wallet/active account advertise localnet and legacy signing | NOT RUN | Public metadata precheck |
| Three fresh distinct development addresses | NOT RUN | A/B/C public addresses; whether recovery roots are shared |
| Independently generated/stored identities | NOT RUN | Separate roots/devices/backups, without recording secret values |
| Local faucet funding | NOT RUN | A/B/C public balances |
| Approved public baseline persists across reload | NOT RUN | Expected genesis, program and authority and reviewed manifest |
| Unknown/mismatched authority blocks signing | NOT RUN | Held controls; reverify/reload must not replace baseline |
| Same-message three-signature initialization | NOT RUN | Exactly three requested keys, final confirmed signature |
| A → B → C account switching preserves earlier signatures | NOT RUN | Public wallet-switch events and successful initialization |
| Rejection, cancellation and late response | NOT RUN | No incomplete initialization submitted |
| Expired blockhash, then fresh signing round | NOT RUN | New blockhash and all three requested again |
| Deposit, proposal, one approval cannot spend | NOT RUN | Actual account balances and mask |
| Second owner approval and one successful execution | NOT RUN | Recipient delta, consumed proposal, signature |
| Duplicate/unauthorized approval and replay | NOT RUN | Disabled controls or confirmed program rejection |
| Interrupted confirmation/reload recovery | NOT RUN | Public receipt survives and no blind duplicate payment |

Three identities on one computer are a **demonstration**, not independent-device
security. Three keys under one recovery phrase are also not independent recovery
domains. Do not mark the independence row passed just because three public keys
differ. See [the Windows walkthrough](windows-local-testing.md) and
[pre-devnet review](pre-devnet-review.md). Mainnet and real funds remain excluded.
