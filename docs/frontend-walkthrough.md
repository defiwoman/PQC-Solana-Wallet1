# Use the classical vault interface locally

Experimental classical multisig — local/devnet only.
The initial vault is NOT quantum-resistant. This walkthrough uses only a disposable
local validator and test SOL. Nothing here deploys to a public network.

For the proposed future devnet authority, read the
[development upgrade-key policy](devnet-upgrade-policy.md). It separates the
upgrade key from the three vault owners, specifies personal-workstation custody
and an encrypted durable backup, and requires an approved public authority
baseline plus a signing hold on unexpected changes. This walkthrough remains
local-only; the policy has not created a key or enabled deployment.

For installation on your own Windows computer, follow
[the Windows local guide](windows-local-testing.md).
[Official wallet evidence and the manual NOT RUN checklist](real-wallet-test-plan.md)
are recorded separately; no current extension release has been certified.

## What you need

Use the pinned Node/npm, Rust/Anchor and Agave tools in `development.md`.
You also need external Wallet Standard wallets that support **legacy
`solana:signTransaction` signing** and advertise **`solana:localnet`** for both the
wallet and selected accounts. Wallet Standard support by itself does not guarantee
localnet support. The app reports an error for unsupported wallets; it does not
pretend that a devnet/mainnet-only connection is localnet. No particular extension
or hardware device was certified by the automated tests.

Keep signing keys inside the external wallets. The app has no seed phrase, private
key, key-file upload, key generation, or wallet-import form, and has no backend.
Use disposable development identities, never a real recovery phrase or funded
production wallet. Wallets that can only sign-and-send, or must change the message
for meta-transactions, are not supported by this fixed-message signing flow.

## Start the local program and interface

From the repository root, install the locked packages:

```sh
npm ci
```

In the cloud terminal, activate the tools already installed for this project:

```sh
export CARGO_HOME=/workspace/wallet-toolchain/cargo
export RUSTUP_HOME=/workspace/wallet-toolchain/rustup
export PATH="/workspace/wallet-toolchain/agave-v4.4.0/solana-release/bin:$CARGO_HOME/bin:$PATH"
npm run validator:local
```

On your own computer, install the same pinned tools first and put their binaries
on PATH; the `/workspace/...` paths above are specific to this cloud machine.

`validator:local` builds the unchanged program and loads it into a **new local
genesis** on loopback RPC port 8899. It does not run `anchor deploy`, read your
personal wallet, replace an existing ledger, or connect to devnet/mainnet. It
creates an ignored ledger under `target/browser-validator`. If port 8899 is busy,
inspect the process using it instead of deleting somebody else's ledger. Keep
this terminal running. A new run creates a fresh chain and previous local vaults
will not be present.

In another terminal:

```sh
npm run dev
```

On your own computer, open `http://localhost:5173`. No hosted cloud preview URL is
provided. Cloud processes are not your computer's localhost; use your client's
port-forwarding feature for both the web port and RPC port if available, or run
this project on your own computer. Browser loopback addresses refer to the
computer running the browser.

## Connect and fund three demonstration identities

1. Click **Verify local network** with the local RPC URL. The interface checks
   the loopback URL, rejects known public-chain genesis hashes, verifies the
   program is executable, and displays the actual genesis hash and program ID.
   It pins that genesis and the observed loader/deployment metadata for subsequent
   actions. The upgrade-trust row reports any upgrade authority: that authority
   can replace the vault rules regardless of the two-of-three approval policy.
   Before signing, paste the helper's PUBLIC `target/local-authority-baseline.json`
   into **Reviewed public baseline JSON**, review genesis/program/authority against
   your own validator terminal, enter a review note and tick the explicit review
   checkbox. Click **Approve reviewed baseline**, then **Verify local network**.
   The local genesis recipe expects the fixed System Program placeholder address
   `11111111111111111111111111111111`, not a newly generated development key.
   Expected configuration and a verification-failure hold persist across reloads.
   Refresh/reverify never accepts a new RPC authority automatically. If a hold
   occurs, investigate before explicitly reviewing the configuration again.
   This UI guard cannot prevent an actual upgrade authority replacing the program.
2. Configure compatible external wallets for the local validator. Connect the
   wallets. You may expose the three identities simultaneously, or enter their
   three public addresses and switch to each account when its signature is
   requested. Earlier verified signatures remain in memory on the same message;
   the earlier account does not have to remain exposed. Reloading discards partial
   signatures and always requires a fresh complete signing round.
3. Copy each public address and fund it with local test SOL:

   ```sh
   solana airdrop 1 PUBLIC_ADDRESS --url http://127.0.0.1:8899
   ```

   Repeat for the three public addresses. These local airdrops have no market
   value. This command does not need a recovery phrase or private key. Each
   active wallet needs test SOL for its transaction fees; Owner 1 also funds vault
   rent, and a proposer funds proposal rent.

**Three identities on one computer are a demonstration, not evidence of
independent device security.** Separate public keys do not prove independent
randomness, backups, devices or recovery paths. The permanent interface label
makes this limitation visible. Independent external signers can use compatible
wallet/hardware connections, but physical-device behavior requires manual testing.

## Initialize: how all three signatures are collected

1. Enter the three authorization public keys in order (the connected-identity list can help). Enter an integer
   vault ID, such as `0`. The first key plus this ID determine the vault address.
2. Click **Review initialization**. Check all three public keys, the derived vault
   address, network and program ID. Owner 1 will pay rent and the transaction fee.
3. Click **Collect all 3 signatures and initialize**. The app constructs exactly
   one legacy transaction with the unchanged program's three required signer
   accounts. Each selected identity is requested in turn. Connect or switch to
   the displayed public key, then click **Sign with requested identity**.
4. Approve each external-wallet request. The app verifies the returned message
   bytes and Ed25519 signatures. Earlier valid signatures are retained even if
   a wallet returns only its own signature. A wallet may not alter the message.
5. Only after all three signatures verify does the app serialize a fully signed
   transaction and submit it to the same verified local validator. It checks the
   blockhash again first. A rejected signature, unavailable requested identity,
   missing signature, message change or expired blockhash stops submission.
   Start a fresh signing round if the blockhash expires; there is no reduced
   two-signature initialization path.

Signing material consists only of public keys, public transaction bytes and
signatures in app memory. Private keys stay in external wallets. Partial signatures
and transaction bytes are never persisted. Before broadcast the app stores only a
public receipt (signature, endpoint, genesis, blockhash and last valid height) so
reloading cannot silently discard an unknown payment outcome. Writes require
working localStorage and Web Locks on a secure localhost browser. Same-origin tabs
share the submission lock; other profiles/origins/devices do not.

After confirmation the interface loads the actual program-owned vault account.
Its initial balance is the rent reserve, with zero spendable lamports. Creating
and paying for it grants no proposal approval.

## Deposit, propose, approve and execute

1. Select an **Active wallet** and deposit `10000000` lamports (0.01 local test
   SOL). The app shows actual balance, protected rent reserve and spendable
   balance from RPC. Anyone can deposit; deposits do not grant approvals.
2. If using an existing vault, paste its address and click **Load vault**.
   Owner lists and next nonce are decoded from the actual account, not typed by
   the user. The app refuses noncanonical or wrong-owner accounts.
3. Select an authorized owner. Enter a recipient public key and `1000000`
   lamports (0.001 SOL), for example. Amounts accept whole decimal lamports only,
   never floating-point SOL. The recipient must be system-owned. A new empty
   recipient needs enough value to meet its own rent requirement.
4. Choose a future absolute expiry slot. **Use current slot + 1000** provides a
   starting point; slots are not seconds. Click **Create immutable proposal**
   and sign in the active wallet. The proposal starts at zero approvals, even
   when that owner pays both rent and the transaction fee.
5. Inspect the proposal account, recipient, exact amount, expiry, current slot,
   each owner's approval and the actual count. Click **Approve** using one
   authorized wallet, then switch the active selection to another authorized
   wallet and approve again. One identity cannot count twice.
6. With two distinct recorded approvals, click **Execute** using a connected,
   fee-funded wallet. Execution is permissionless after approval, but the stored
   recipient and amount cannot be substituted. The program preserves vault rent.
7. Wait for **CONFIRMED** and the account refresh. The executed proposal remains
   visible and cannot execute again. Proposal rent remains locked; no cleanup or
   account closure was added.

The app refreshes loaded accounts every five seconds and after confirmation. It
never invents an optimistic balance or vote. RPC read failure clears displayed
account data and disables account actions. A newer read supersedes an older one.
Large balances outside the RPC client's exact safe-integer range are rejected
rather than displayed rounded.

## When something fails

- **Wrong network:** use the loopback validator and a wallet advertising localnet.
  Public-network writes are disabled. If the local genesis changes, investigate
  and explicitly approve its reviewed public manifest before signing. Network
  refresh does not replace the saved expectation or clear a hold.
- **Rejected signature:** nothing is broadcast until all required signatures are
  present. Review the inputs and try a fresh signing round when ready.
- **Unauthorized wallet:** select a recorded owner to propose or approve.
  Nonowners may deposit or pay to execute an already-approved proposal.
- **Expired proposal:** it cannot be approved or executed. Create a new proposal
  with the next nonce and a future slot; the old account is retained.
- **Insufficient funds:** fund the active wallet for fees/proposal rent, deposit
  more test SOL, or reduce a new proposal's amount. Vault rent cannot be spent.
- **RPC failure or unknown confirmation:** inspect the displayed transaction
  signature and use **Check transaction confirmation**. New transactions stay
  disabled while the outcome is unknown. Do not retry a deposit/payment blindly.
  You can also inspect locally with:

  ```sh
  solana confirm TRANSACTION_SIGNATURE --url http://127.0.0.1:8899
  ```

  The app does not automatically resubmit. Reloading restores an unresolved
  public receipt and blocks new transactions. Verify the original RPC/genesis,
  then check confirmation. Landed errors stay pending until finalized; processed
  or merely confirmed errors do not enable retry. If the original ledger/history
  is lost or the transaction never landed, preserve the receipt for manual ledger
  reconciliation rather than deleting it to force another payment.

## Reproduce the checks

```sh
npm test
npm run build
npm run test:validator
```

The validator suite executes the compiled program; frontend tests are separate.
For the production Chromium check, keep the disposable validator running, build,
and run `npm run preview --workspace @pqc-wallet/web` in another terminal. Then
run `npm run test:browser` with system Chromium on PATH (or set CHROMIUM_PATH).
That smoke test creates a local fixture using keys only in the Node test process,
then uses the actual production page to read its balance and proposal. No keys
or signing fixture are injected into Chromium and no application backend is
created. It also tests explicit public baseline approval, reload persistence and
a mismatch hold without injecting a wallet. It does not certify external wallet
extensions or hardware devices.

See `validation.md` for observed results and remaining build warnings.

Read `pre-devnet-review.md` before any devnet experiment; manual wallet tests and an upgrade-authority decision remain gates.
