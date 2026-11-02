# Classical SOL vault — Stage A

Experimental classical multisig — local/devnet only.
The initial classical vault is NOT quantum-resistant. This is experimental code,
not an audited wallet or permission to use real funds.

## Implemented scope

`programs/wallet` implements initialization, SOL deposits, immutable transfer
proposals, per-owner approvals, and execution after two distinct approvals.
There are no tokens, swaps, arbitrary instructions, PQC, recovery, key rotation,
account closure, or proposal cleanup. `apps/web` remains a status page; it does
not connect to a wallet or submit transfers. The legacy root frontend and
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

## Later stages

Actual on-chain PQC verification still needs research: candidate security,
signature/key sizes, transaction/account limits, compute, memory, malformed input,
and reproducible verification vectors. No browser/server verification counts as
that proof. Mandatory PQC authorization is conditional on feasibility passing,
and must cover upgrade/recovery/rotation paths before making PQC claims.
