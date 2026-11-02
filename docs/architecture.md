# Classical SOL vault — Stage A

Experimental classical multisig — local/devnet only.
The initial classical vault is NOT quantum-resistant. This is experimental code,
not an audited wallet or permission to use real funds.

## Implemented scope

`programs/wallet` implements initialization, SOL deposits, immutable transfer
proposals, per-owner approvals, and execution after two distinct approvals.
There are no tokens, swaps, arbitrary instructions, PQC, recovery, key rotation,
account closure, or proposal cleanup. `apps/web` now connects external Wallet
Standard identities and builds local-only transactions against these same five
instructions; the Rust program and its checks are unchanged. The legacy root frontend and
`programs/pqc-solana-wallet` remain unchanged and are not active targets.

## Accounts and canonical addresses

All integer seeds are exactly eight little-endian bytes. Anchor checks the
canonical bump with `bump` on every account path; stored bumps are not trusted.

| Account | PDA seeds under this program ID | Immutable identity/data |
| --- | --- | --- |
| Vault | `"vault"`, first authorization key, `vault_id: u64` | Three owner keys, vault ID; mutable next nonce |
| TransferProposal | `"proposal"`, vault public key, `nonce: u64` | Vault, nonce, proposer, recipient, integer lamports, expiry slot; mutable approval bits and executed flag |

Both accounts use Anchor's typed account loading, discriminator checks and
program ownership checks. Proposals additionally have a `has_one = vault`
relationship. There is no account reallocation or closure instruction.

## Initialization and independent keys

All three owner accounts are required signers at initialization. Their keys must
be distinct and on the Ed25519 curve. This excludes off-curve PDA authorization
keys and requires proof of signing authority for all three entries. An arbitrary
payer can fund the rent; payment does not grant authority.

A program cannot prove that different public keys were generated independently or
stored on separate devices. Users must generate, back up, and store independent
keys themselves; three derivations of one recovery phrase share a failure domain.
The local tests generate fresh temporary keys in memory and never use real keys.

## SOL custody and rent

SOL is held directly in the **program-owned Vault data account**, alongside the
owner list and nonce. Initialization funds its full rent exemption. Deposits use
a System Program transfer from a signing, system-owned source to that vault.
Anyone may deposit; a deposit creates no approval.

Execution uses checked **direct lamport mutation**: this program owns the source
and may debit it. A System Program transfer CPI would be incorrect for a source
that is program-owned and contains data. The payout preserves at least
`Rent::minimum_balance(vault.data_len())` in the vault. Proposal rent is separate
and is never spent or returned.

Recipients must be system-owned accounts. This intentionally excludes payouts
to program-owned/token accounts. The recipient's post-transfer balance must meet
its rent exemption, so a new empty address cannot receive a tiny sub-rent payout.
A sufficiently large payout may create/fund a fresh system address. The vault
itself, the proposal account, and the default/System Program address are rejected
as proposal recipients. Rent reserves are not available for spending.

## Proposal and approval lifecycle

1. An authorized owner proposes a positive `u64` lamport amount, recipient and
   expiry slot. A separate rent payer is allowed. The nonce must equal the vault's
   next nonce, which increments with checked addition only on successful creation.
2. Proposals start with **zero approvals**. Neither proposer, initializer, payer,
   nor executor receives implicit approval, even if that person is also an owner.
3. Each authorized signer can set exactly one of three approval bits. Repeated
   approval is an error; a second transaction from the same owner is not a second
   vote. Proposal content has no update instruction.
4. Anyone can execute once two owner bits are set. The recipient account must
   equal the stored recipient, and the caller's `expected_amount` must equal the
   stored amount. Only the stored amount is transferred.
5. The clock must satisfy `current_slot < expiry_slot` for proposal creation,
   approval and execution. The deadline slot itself is expired. Slots are not
   seconds. Consumed proposals reject both further approval and execution.

The unique proposal address plus retained account and monotonic vault nonce
prevent reuse. The immutable account data and account relationships bind approvals
to this program, vault, nonce, recipient, amount, and expiry. No instruction can
close, reset, edit or reuse a proposal. Approval withdrawal is not implemented.

## Atomicity and arithmetic

All balance calculations use checked addition/subtraction, and rent checks precede
balance writes. Execution debits the vault, credits the recipient and sets
`executed = true` in one instruction. Solana's transaction rollback also undoes
all of these if any later instruction fails. Failed transactions still charge the
transaction fee payer; that fee is not a vault payout and is excluded from the
rollback balance assertions.

`u64::MAX` is representable in proposal fields, but an unfunded amount cannot
execute. The final nonce cannot increment beyond `u64::MAX`; exhaustion rejects
creation and rolls back account allocation. There is no overflow wrapping or
floating-point accounting. SDK seed helpers accept bounded `bigint` values.

## SDK and verification

`packages/sdk` exports public status data separately from `@pqc-wallet/sdk/client`.
The client supplies canonical PDA helpers and a typed Anchor Program using the
real generated IDL. It neither loads signing keys nor sends transactions by
itself. Build tooling copies the generated public IDL and TS type into the SDK;
these public files are tracked, while signing keys and binaries are ignored.

`npm run test:validator` builds the actual SBF program, starts a private local
Agave validator with that binary at genesis, and submits signed transactions.
Expected failures must be confirmed in the local ledger with program error logs;
a client-side exception or a mocked success does not satisfy the checks.
See `validation.md` for the actual results and test-only boundary fixtures.

## Wallet interface and initialization signing

The generated IDL is unchanged. `@pqc-wallet/sdk/interface` decodes actual vault
and proposal accounts, verifies canonical relationships and owners, exposes
integer-lamport instruction builders, and coordinates fixed-message signing.
The browser is not an authority: the program still enforces every authorization,
expiry, replay, account and rent check. UI approval counts come only from account
bits; balances and execution state are reread after confirmation, not assumed.

Wallet connections use Wallet Standard `standard:connect`, account-change events,
and legacy `solana:signTransaction`. All three initialization identities must be
distinct and on-curve. Public keys are fixed at review; each identity can be
exposed by its wallet when requested, so account switching preserves earlier
verified signatures. Owner 1 is the rent and transaction fee payer.
The app sequentially collects and cryptographically verifies all three signatures
on the same message, merging earlier verified signatures if a wallet omits them.
Message alteration, missing signatures, rejected signing and expired blockhashes
abort the round. A final complete-message comparison precedes submission. A new
blockhash always requires all three signatures again. It never broadcasts a partially signed initialization.

All signing keys remain in external wallets. There is no app backend, seed-entry
form or key generation/import. Partial signatures and transaction bytes are not
persisted. Public pending receipts, reviewed authority baselines and security
holds are stored for retry and trust checks. Test-only signing substitutes
run in Node memory and are not included in the web bundle. Three identities on
one computer are explicitly labeled as demonstration, not independent devices.

Writes are restricted to credential-free loopback RPC URLs. Known public genesis
hashes are rejected and a local genesis is pinned for subsequent reads/writes;
program executability is verified before signing and again before submission.
Wallets must advertise localnet and legacy signing support. This requires a
trusted local RPC, not an untrusted proxy pretending to be a local validator.
A changed genesis or unsupported wallet produces an error. No public deployment
or public-network write capability was added.

Confirmation uses HTTP status polling. The signature is known before broadcast;
an ambiguous submission/confirmation retains it and blocks new transactions until
checked. Only finalized landed errors unlock a failure retry; processed and confirmed
errors remain pending. Successful reporting uses confirmed commitment. Public
receipts survive reload, and same-origin Web Locks serialize submissions. Neither
mechanism provides global payment-intent deduplication across origins/devices. An RPC read
failure clears current account displays instead of manufacturing zero balances.
See `frontend-walkthrough.md` for initialization details and manual wallet limits.

## Later stages

Actual on-chain PQC verification still needs research: candidate security,
signature/key sizes, transaction/account limits, compute, memory, malformed input,
and reproducible verification vectors. No browser/server verification counts as
that proof. Mandatory PQC authorization is conditional on feasibility passing,
and must cover upgrade/recovery/rotation paths before making PQC claims.

## Pre-devnet gate

See `pre-devnet-review.md` for the current findings, warning classifications,
manual wallet checklist and readiness decision. Program/ProgramData owners and
canonical relationships are checked; upgrade authority and deployment slot are
shown/pinned across signing. An upgrade authority can still replace this code and
bypass its threshold. No devnet authority has been chosen and public writes remain
disabled.

## Proposed devnet upgrade role

The [devnet upgrade policy](devnet-upgrade-policy.md) proposes a dedicated
single development key, separate from vault owners and the program-address
keypair. Its holder can replace all program logic, including spending rules.
The local interface now requires an explicitly reviewed expected authority bound
to the local genesis and compiled program ID, loader, canonical ProgramData and
deployment slot. It persists that public configuration and latches verification
failures/mismatches across reload. Network refresh never approves a replacement.
Every signing/submission path verifies against this expectation; account switching
does not change it. Read-only investigation and receipt reconciliation remain
available. The local helper publishes a predetermined genesis recipe, including
the fixed System Program placeholder authority, for explicit operator review.
No devnet baseline or key has been selected. Custody is on a persistent personal workstation
with an independently accessible encrypted backup, not an ephemeral cloud copy.
No key, deployment, on-chain authority change or frontend code change is made by
this proposal.

See [Windows local testing](windows-local-testing.md) and
[real-wallet evidence and manual checks](real-wallet-test-plan.md). Current
extension signing, Windows installation and independent-device testing are NOT RUN.
