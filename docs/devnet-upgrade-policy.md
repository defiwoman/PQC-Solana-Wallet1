# Proposed devnet program upgrade policy

Prepared 3 November 2026 for `feature/classical-vault`.
**Status: proposal only; no key has been created or selected, no public authority
address has been recorded, and no on-chain authority has been set or changed.**
This document authorizes no deployment, upgrade, authority transfer or permanent
freeze. The current application remains local-only. Mainnet is out of scope.

Read this with the [pre-devnet review](pre-devnet-review.md),
[threat model](threat-model.md) and [walkthrough](frontend-walkthrough.md).
The initial classical vault is NOT quantum-resistant.

## Authority and trust

The proposed experiment retains an upgradeable program controlled by **one
dedicated development signing key**. It must be newly dedicated to this project's
devnet upgrade role, not a real funded wallet, an existing personal key, the
program-address keypair, the default Solana CLI wallet, or any of the three vault
authorization identities. Do not derive it from their shared recovery material.
Its public key must differ from all three vault owner keys. Separation must also
be checked when initializing each experiment vault.

The holder can replace program code and therefore change or bypass spending,
approval, expiry and rent rules. Under the unchanged program, the upgrade key
receives no vault approval merely because it is upgrade authority. However, it can
replace that program with different rules. **The vault's two-of-three approvals
do not govern program upgrades.** Distinct keys separate roles; they do not turn
this into a two-of-three-secured upgrade authority or remove trust in its holder.
The on-chain vault currently does not enforce this separation of roles; operator
and future frontend/deployment checks must enforce the proposed policy.

This is an accepted *proposed trust model for test SOL*, not a production security
claim. The dedicated key must never become a mainnet authority or be reused for
production assets. The experiment retains upgrade ability; making it immutable
is a separate, irreversible decision and is not authorized here.

## Exact proposed custody locations

Signing would take place on the named operator's **own persistent workstation**,
not in this managed cloud checkout, an application backend, or CI. On a personal
Linux/macOS workstation (or a persistent personal WSL profile), the proposed
primary file is:

```text
~/.config/pqc-solana-wallet1/devnet/upgrade-authority-keypair.json
```

Here `~` means the operator's personal OS home directory, not the cloud agent's
home. This directory and file have **not** been created by this task. Confirm the
operator, machine and OS before any later authorized key creation. The private
file must stay outside every repository, web project, web-served directory,
Docker build context and shared/synchronized project folder.

A Solana keypair JSON is normally a **plaintext private signing key**. A mnemonic
passphrase must not be mistaken for encryption of that JSON file. Use full-disk
encryption, a locked personal OS account, directory permissions `0700`, and file
permissions `0600` on systems supporting those modes. Only the designated operator
should have ordinary access. These measures do not protect a running, unlocked
machine from malware or a privileged administrator.

The required second durable copy is an **encrypted attachment** in the operator's
chosen password manager, under this exact logical entry:

```text
Entry:      PQC-Solana-Wallet1 / devnet / upgrade authority
Attachment: upgrade-authority-keypair.json
Public field: upgrade authority public address
```

Choose a manager with client-side, end-to-end encrypted attachments and a usable
export/recovery process.
The attachment contains the same sensitive keypair file; the public field contains
only the public address. The manager must be accessible from another trusted
personal device, not solely through this workstation or cloud session. Keep its
account recovery/second-factor recovery material in a secure offline location
separate from the workstation. Do not put passwords, recovery codes or attachment
contents in these docs or chat. An additional encrypted offline backup is optional;
if used, record its device and custody location privately.

**Minimum retention:** one primary copy on the persistent encrypted workstation
and one independently accessible encrypted backup. A cloud filesystem, environment
snapshot, Git branch or ignored file in `/workspace` is not a backup plan. Every
usable backup grants the same single-key upgrade authority, so each copy needs
protection. This documentation does not establish that any backup exists yet.

## How access would be retained and checked

After a separately authorized local key-creation step, and **before assigning any
on-chain authority**, the operator would:

1. Store the primary file at the path above without showing its JSON/seed in a
   terminal transcript, chat, screenshot, clipboard-sharing tool or log.
2. Create the encrypted attachment using the manager's secure local attachment
   workflow; confirm the independent account-recovery route works.
3. Restore the attachment on a trusted device to a temporary owner-only directory
   outside the repository, on encrypted storage. Use trusted local Solana tooling
   to derive **only its public address** and compare it with the primary file's
   public address. Do not display or upload the keypair contents. No transaction
   or authority change is needed for this recovery check.
4. Remove the temporary restored copy after checking. Do not promise secure
   erasure on SSDs; encrypted storage and limiting copies remain important.
5. Record the operator, public address, backup service/entry, restore-test date
   and recovery instructions in the private custody record. Put only approved
   public deployment metadata in the repository. Recheck restoration before
   depending on a new machine or after changing the backup arrangement.

If the workstation is lost, recover through the independently accessible backup
on a trusted replacement machine, restore owner-only permissions and recheck the
public address. If every usable copy is lost, the three vault owners cannot
recreate this upgrade key. The chain would still list its public address; key
loss does not automatically make the program immutable or transfer control.

No private key, recovery phrase, restore file or public address was generated or
read from a key file for this documentation task.

## Keeping the key out of Git, logs and web assets

- Keep the primary and restore paths outside the checkout. Do not copy the key
  into `target/deploy`, `apps/web`, `packages/sdk`, `public`, `dist`, fixtures or
  documentation. The existing `target/deploy/wallet-keypair.json` is a generated
  local program-address identity, not this proposed upgrade authority or its
  durable backup. Program address, fee payer, upgrade authority and vault owners
  are separate roles even where tooling permits reuse.
- The existing `.gitignore` rule `**/*keypair*.json` would ignore an accidental
  copy named `upgrade-authority-keypair.json`; ignored secrets directories also
  exist. That is a last defense, not safe storage. Ignore rules do not remove an
  already tracked file and do not prevent force-adding it. Never force-add a key.
- No key bytes in environment variables, `.env`, `VITE_*` values, frontend build
  configuration, source maps, package/IDL generation, GitHub Actions, cloud secret
  bindings or application storage. Browser assets contain only public program,
  network and authority data. The application's public pending-receipt journal
  must never contain upgrade signing material.
- The future deployment/upgrade signer runs on the operator's workstation. It
  receives reviewed public build artifacts, not a key from this cloud session.
  Supply a key-file **path** to supported local tooling rather than key contents
  on a command line. Do not use shell tracing, environment dumps, `cat`/`echo` of
  the file, diagnostic uploads or recorded seed-printing workflows.
- Before committing or distributing artifacts, inspect file names/diffs and the
  export list for accidental key material without printing secrets into logs.
  Only the public authority address may appear in the deployment record, UI,
  review notes and transaction receipts.

This document deliberately contains no runnable key-generation, deployment,
upgrade-authority transfer or immutability commands.

## Interface requirements and authority-change hold

For a later, separately reviewed devnet configuration, record an approved **public**
baseline in version control: devnet genesis/network, program ID, ProgramData
address, upgrade authority public address, reviewed build commit/hash and expected
deployment metadata. Future operator tooling must select the dedicated upgrade authority explicitly
rather than inherit a CLI default, and verify the resulting public ProgramData
authority after an authorized deployment. That operation is not performed here.
No address placeholder is an approved authority. Compare the
authority against the three vault public keys; reject reuse of one of those keys.

The interface must:

1. Read and validate loader ownership and the canonical Program/ProgramData
   relationship; show the **observed public authority address**, the approved
   expected address, and a plain-language warning: "This development key holder
   can replace program code and change the spending rules. Vault approvals do not
   control upgrades."
2. Require a match to the approved devnet baseline before new signing, including
   after reload or RPC reconnect. A public baseline is not a secret. It must not
   be silently replaced with whichever address an RPC happens to report.
3. On an unexpected authority, removal of authority, invalid metadata or unexpected
   deployment change, enter a persistent **security hold** for new signing and
   submission. Discard partial signing rounds; never reuse signatures on a changed
   message. Keep read-only investigation and pending-transaction reconciliation
   available without treating them as approval of the change.
4. Require documented operator review of the observed program, authority and code
   before changing the approved baseline. Clicking "Verify network", reloading,
   switching accounts or automatically accepting a new RPC value must not clear
   an authority mismatch. Even a planned upgrade with the same authority needs
   review of its new code/deployment metadata.

**Current implementation versus proposal:** the local interface already displays
validated observed authority metadata and pins it through a verified session and
signing round. It does not yet have an approved persistent **devnet** authority
baseline; explicit reverification can establish a new local session baseline.
That is not sufficient to enforce this proposed devnet policy across reloads.
Adding the reviewed public baseline, separation checks and persistent mismatch
hold is a required later code/configuration task before devnet enablement. No
frontend behavior is changed by this documentation commit. Public writes remain
disabled.

A frontend hold does not freeze the on-chain program, revoke an upgrade key or
stop external clients/the authority holder. It protects this interface from
continuing without review; the underlying upgrade trust still exists. A malicious
RPC can lie about metadata, so retain a trusted RPC and independently verify a
future deployment's public record and binary.

## Future changes and remaining decisions

Every future deployment, code upgrade, authority change or permanent freeze needs
its own explicit authorization and a concrete reviewed result. This proposal does
not authorize later actions automatically. On suspected key compromise, stop new
signing, preserve public evidence and investigate; do not silently substitute a
new authority or claim the frontend hold protects funds on-chain.

The proposed role and trust model are documented, but these decisions remain:

- Name the single responsible operator and trusted personal workstation/OS.
- Choose the encrypted-attachment password manager, independent recovery route
  and any additional offline-backup custodian/location.
- Separately authorize local creation of the dedicated development key, verify
  backup restoration, then record **only** its public address and confirm it
  differs from all experiment vault identities.
- Decide who reviews normal/emergency upgrades and how approval/evidence is
  recorded. The proposed single-key authority provides no on-chain quorum or
  timelock; procedural review is not cryptographic enforcement.
- Complete the public devnet deployment record, baseline/mismatch-hold code review,
  and required real-wallet/device tests from the pre-devnet review.

Mainnet, real funds, authority reassignment and making the program immutable
remain outside this proposal and outside the actions performed here.
