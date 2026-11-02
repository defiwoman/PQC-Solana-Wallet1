# Preliminary threat model

## Status and boundary

Experimental — local/devnet only. No vault or fund-handling code exists yet.
The initial classical 2-of-3 vault is NOT quantum-resistant. This document is a
planning aid, not an audit or a claim that mitigations have been implemented.

## Assets and assumptions for stage 1

Future assets include vault SOL, approval integrity, owner keys, proposal state,
and program upgrade authority. Solana consensus/runtime and cryptographic
primitives are assumed to operate as specified. A future classical 2-of-3 policy
can tolerate loss or compromise of one independent owner key, but two compromised
owners can authorize a loss. Losing access to two keys can permanently block use.
Independent keys also need independent storage and recovery paths.

## Threats to address before implementing a vault

| Threat | Required design or validation |
| --- | --- |
| One owner counted twice | Three distinct owners; count each signer once |
| Forged approvals or substituted accounts | On-chain signer, ownership, address, and account constraint checks |
| Replay, altered amount/destination, cross-vault use | Bind approvals to full proposal content and domain; consume once atomically |
| Unauthorized key rotation or recovery | Define a policy with no single-key recovery bypass |
| Malicious upgrade authority | Explicit upgrade governance; upgrades can replace all authorization rules |
| Compromised browser/SDK or deceptive RPC | On-chain enforcement; clear transaction review; never trust UI approval counts |
| Key theft, common seed, unsafe backups | Independently generated keys; no secrets in source or logs |
| Resource exhaustion or rent/account abuse | Bounded data and validation; runtime limits and negative tests |
| Dependency or build compromise | Exact direct pins, committed lockfiles, verified downloads, and review |

## Quantum and PQC limits

Solana's classical signatures do not become post-quantum because a vault requires
two signatures. A sufficiently capable quantum attacker remains outside the
protection offered by the planned classical stage. PQC verification must run
on-chain and be mandatory in every relevant authorization path to support a
future PQC authorization claim. Upgrade/recovery bypasses, weak randomness,
implementation bugs, and the underlying chain's security still need analysis.

## Explicitly unverified

No transfer safety, economic safety, availability, quantum resistance, validator
integration, or production suitability has been established. Use no real funds
or real recovery phrases with this scaffold. No mainnet configuration is provided.
