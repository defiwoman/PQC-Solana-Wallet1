# Stage A threat model

Experimental classical multisig — local/devnet only.
The initial classical vault is NOT quantum-resistant. This implementation has
local-validator coverage, but has not received an independent security audit.

## Trust and assets

Assets are vault SOL above its rent reserve, approval integrity, three owner keys,
proposal state, and any future program upgrade authority. Solana's consensus,
runtime, transaction signatures and account ownership rules are trusted. A local
validator test does not establish production suitability or protect against
malicious governance of a future deployment.

All three keys sign initialization and must be distinct, on-curve Ed25519 public
keys. The program cannot prove separate key-generation randomness or independent
backup/device storage. If two owner keys are compromised, the attacker can
propose, approve and spend. Losing two keys can make the vault permanently unusable:
there is intentionally no recovery, owner rotation or alternate authorization path.

## Enforced controls and limitations

| Threat | Stage A control / limitation |
| --- | --- |
| One key counted multiple times | Distinct owners, indexed approval bits, duplicate approval rejection |
| Unauthorized approval | Signer account privilege plus membership in the vault's owner list |
| Fake initialization authorization | Three signer constraints and on-curve key checks; missing privileges fail on-chain |
| Implicit proposer/payer approval | Proposals explicitly initialize the approval mask to zero |
| Recipient or amount substitution | Immutable stored content; exact recipient account and expected amount constraints |
| Cross-vault use or fabricated account | Canonical PDAs, typed ownership/discriminator checks and proposal-to-vault relationship |
| Replay or reuse | Monotonic per-vault nonce, retained proposal account and consumed flag; no closure/reset API |
| Expired authorization | Slot deadline enforced during creation, approval and execution |
| Overspending/overflow/rent depletion | Positive u64 amounts, checked arithmetic and rent-reserve checks |
| Partial spend on an error | Transaction atomicity; ledger tests compare balances and full proposal state |
| Malicious UI, SDK or RPC | Authority enforced on-chain, never inferred from UI vote counts; owners must review exact proposal content |
| Program upgrade replacing authorization | No external deployment performed; future upgrade authority/governance must be reviewed separately |
| Key or dependency compromise | No real keys in tests; ignored signing artifacts; pinned dependencies and tracked lockfiles |

Proposals are immutable but an owner may create many proposals if a payer signs
and funds rent. Two owners may approve conflicting proposals against the same
balance; execution order determines which remains funded. A failed or expired
proposal keeps its rent permanently in this version. Approvals cannot be revoked,
and successful transactions are irreversible. These are explicit product limits.

Only system-owned SOL recipients are supported; program-owned/token accounts are
rejected. New recipients need enough lamports for rent exemption. The vault and
proposal rent are not withdrawable. Failed transactions can charge their fee payer
even though the vault/recipient/proposal writes roll back.

## Frontend signing and RPC boundary

The app receives only public keys, transaction bytes and signatures; signing keys
remain in external wallets. It has no backend, seed/private-key input, key-file
upload or persisted partial signing session. Only whitelisted public pending
receipt metadata, reviewed public authority configuration and latched holds persist;
the receipt is stored before broadcast; reload restores its retry lock and
same-origin Web Locks serialize submission. Wallet-provided names are labels,
not proof of independent security. Three identities on one computer are visibly
marked as a demonstration.

All three initialization signatures must verify on one unchanged message before
broadcast. The app rejects message-changing wallets and rebuilds from scratch
when a signing blockhash expires. Wallet account switching preserves earlier verified signatures on the unchanged
message; only the currently requested identity is permitted to sign that turn.
Late responses after cancellation are ignored.
The browser checks each signer's actual signature, not a local approval flag.

Local RPC URLs, public-genesis rejection, a pinned genesis and program-presence
checks prevent accidental public-chain use. A malicious local RPC can lie about
state/network; these checks are not cryptographic RPC attestation. Use a trusted
local validator and disposable keys only. Never connect real funded wallets.

RPC reads are the data source, with canonical account validation and no optimistic
vote/balance changes. A failed read clears current account data. Ambiguous writes
retain their signature and block automatic retry to avoid duplicate deposits.
Landed errors must be finalized before failure retry; merely processed or
confirmed errors stay pending. Separate profiles/origins or cleared storage do not
share payment-intent history. Unlanded/pruned/lost-history outcomes require manual
reconciliation rather than an automatic expiry retry. The app checks again before signing/submission; on-chain checks remain decisive
if displayed state becomes stale or proposals expire while a wallet prompt is open.

## Quantum limits and excluded work

Two classical Ed25519 approvals do not provide post-quantum security. No PQC
algorithm, verifier, token path, swap, arbitrary instruction executor, recovery,
rotation or cleanup is implemented. Before a future PQC claim, verification must
be mandatory on-chain in every relevant authorization path, including any future
upgrade/recovery mechanism. The chain's own classical security remains relevant.

## What remains unverified

The local integration suite tests the compiled program and the stated rejection
paths, not arbitrary adversarial inputs, formal correctness, hardware wallets,
public devnet behavior, production economics, compromised validator/RPC behavior,
or quantum security. The interface builds local-only transactions using external Wallet Standard
signers. Automated coverage includes the signing protocol and Chromium account
reads, but not actual wallet-extension prompts or physical hardware devices.
Use no real funds, real recovery phrases or production keys for this experiment.

Upgrade authority is now displayed from validated loader metadata and observed
metadata is pinned through signing. That detection is not governance: any retained
upgrade authority can replace all vault authorization rules. See
`pre-devnet-review.md` for the unresolved devnet authority decision and required
real-wallet/device tests.

## Proposed devnet authority custody and acceptance

See [the proposed devnet upgrade policy](devnet-upgrade-policy.md) for the
single dedicated development key, its separate operator-controlled storage and
encrypted backup, public authority disclosure, and required change-review hold.
The holder can replace spending rules; this authority is not protected by the
vault's two-of-three approvals. Separation of the authority key from all vault
owner keys is a policy requirement, not currently an on-chain constraint.

The policy does not establish an activated devnet authority or completed custody
setup. The implemented local gate persists an explicitly reviewed public baseline
bound to network/genesis and compiled program ID, loader, canonical ProgramData,
authority and deployment slot. It never trusts a new RPC value automatically.
Unverifiable/mismatched metadata blocks new signing and latches a hold across
reloads; only explicit review clears it. Missing/unavailable storage also blocks
signing. A user can still approve incorrect public values; a review note is not
proof of an independent investigation. Storage clearing, another browser origin
or a compromised frontend can bypass this UI guard. The actual upgrade authority
can still replace program code; this guard does not restrict its on-chain power.
The fixed System Program address used as the local fixture's placeholder is not
the future dedicated development key. No existing program was frozen/changed.
A reviewed devnet record and the [real-wallet tests](real-wallet-test-plan.md)
remain required. Mainnet remains excluded.
