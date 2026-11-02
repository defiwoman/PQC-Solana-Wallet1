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
or quantum security. The UI is only a status page and has no live signing flow.
Use no real funds, real recovery phrases or production keys for this experiment.
