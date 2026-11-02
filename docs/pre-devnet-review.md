# Pre-devnet security and correctness review

Reviewed 3 November 2026 on `feature/classical-vault`, starting from verified
remote commit `298a476f66860eb2beea00f2bf6b3840a785d9aa`. The working tree was
clean. This is an engineering review with regression tests, not an independent
audit or proof of security. No merge or external deployment was performed.

**Decision: not yet ready for a devnet experiment through this interface.**
Local checks pass, but actual external-wallet signing and an explicit upgrade
trust decision remain gates. Public-network writes intentionally remain disabled.
The classical vault is NOT quantum-resistant.

## 1. Findings and fixes

### Concrete findings

| ID | Impact | Finding and change |
| --- | --- | --- |
| F1 | High: unsafe retry after lost UI state | Unknown outcomes existed only in React memory. Reloading removed the retry lock. The app now persists a **public receipt before broadcast**, restores it on reload, pins its original RPC/genesis, and blocks new transactions until its outcome is reconciled. Storage failure prevents broadcast. Web Locks serialize signing/submission across same-origin tabs, and an immediate operation ref prevents same-page double invocation. No signed transaction bytes, partial signatures, seeds or private keys are stored. |
| F2 | Medium: initialization/account-switch availability | Any wallet change invalidated the round, all owners had to be exposed simultaneously, and signer closures retained stale WalletAccount objects. Initialization now takes three fixed public keys and requests each signature explicitly. Wallets can expose A, then B, then C; the SDK preserves earlier verified signatures on the same message. The live account, chain, features and signer are checked for each turn. Wallet controls remain usable while waiting. Cancellation defeats a late wallet response. |
| F3 | Medium: fork-sensitive retry classification | Any RPC status containing an error was treated as a final failure. A processed or merely confirmed failure may disappear on a fork. Such errors now remain pending; **only a finalized landed failure unlocks a replacement**. Successful transactions still use the explicitly selected confirmed commitment; there is no automatic retry. A trusted preflight rejection before broadcast is handled separately. |
| F4 | Defense against changed signing intent | The SDK already compared each wallet's returned message and verified signatures. Added a final comparison of the **complete** assembled message immediately before fully signed serialization. Tests mutate the original message at the last response, omit signatures, return invalid signatures, and change a wallet-returned message. All are rejected. All three signer requirements remain in the unchanged on-chain initialization instruction. |
| F5 | High trust decision; unresolved for future deployment | The UI only checked executable presence and did not expose upgrade trust. It now validates the program loader and, for the upgradeable loader, Program/ProgramData tags, owners and canonical relationship. It displays the upgrade authority and warns that it can replace every vault rule. Deployment slot/authority/loader metadata is pinned across signing; a change requires reverification. This visibility does **not** make upgrade authority subject to the vault's two-of-three rule. No external authority has been selected or configured. |
| F6 | Coverage gap, no contract defect found | Sequential replay and rollback tests did not exercise competing transactions. Added real-validator races for the same proposal, competing approved proposals that jointly exceed spendable funds, and duplicate approvals. Added wrong-owner and noncanonical proposal-account regressions. The existing account locks and consumed marker behaved correctly; no Rust change was necessary. |

### Vault correctness review

| Area | Reviewed enforcement and evidence |
| --- | --- |
| Initialization | Three `Signer` accounts, distinct owner keys and on-curve checks. Each missing signature privilege and duplicate owners fail on the actual program. Public-key distinctness cannot prove independent generation/storage. |
| Two of three | Membership in the immutable owner array; one indexed approval bit per owner; duplicate rejection; two set bits required. No proposer, initializer or payer gets an implicit bit. All three owner pairs are tested. |
| Owners and addresses | Typed Anchor account/discriminator/owner validation, canonical `bump` derivation on every vault/proposal path, proposal `has_one = vault`. Cross-vault, wrong-owner and alternative-PDA substitutions fail. |
| Immutable intent | Vault, nonce, recipient, integer lamports, proposer and expiry are created once. Later instructions modify only approval bits or executed state. Execution compares the recipient account and expected amount with stored values. |
| Nonce, expiry and replay | Per-vault sequential nonce with checked increment; proposal address includes vault and nonce; slot deadline enforced during creation/approval/execution. Executed accounts remain allocated; no close, reset or edit API exists. |
| Concurrent execution | Vault/proposal writable account locks serialize conflicting transactions. Exactly one same-proposal race succeeds. Competing proposals cannot jointly overspend. A failed execution remains unconsumed. |
| SOL custody | SOL lives in the program-owned vault data account. Deposits correctly use a System Program CPI from a system-owned signer. Execution correctly debits the program-owned source directly; it does not misuse a System Program transfer for that data account. |
| Arithmetic and rent | Positive u64 amounts, checked source subtraction/recipient addition/deposit addition/nonce increment. Vault and recipient rent exemption are checked before writes. Rent cannot be withdrawn. u64 maximum, zero, overflow, insufficient funds and exact rent-boundary cases are exercised. |
| Atomicity | Debit, credit and consumed state are in one instruction/transaction. A later instruction failure rolls all of them back. Balance assertions exclude transaction fees, which a failed transaction can still charge its fee payer. |
| Reentrancy/CPI scope | Execution calls no recipient-controlled program; there is no arbitrary CPI/instruction executor. Only the known System Program deposit CPI is used. This is source review, not exhaustive adversarial CPI fuzzing. |
| Frontend construction | Generated IDL and strict account builders are retained. Integer inputs use bigint/BN. Account reads validate canonical relationships; unsafe numeric balances fail closed instead of being rounded. Real account bits drive approval counts. |
| Network | Credential-free loopback RPC only, known public genesis rejection, pinned local genesis, loader/program presence checks and rechecks before signing/submission. A malicious local RPC can lie; this is not RPC attestation or bytecode verification. |

The Rust program, its ABI/generated IDL, Cargo.lock and Anchor configuration were
preserved. The rebuilt SBF binary remains 179,264 bytes with SHA-256
`f5cf87dbbd607aaa9d32670312eeaa889fe98256cf79349629fe2f98e96961ce`.
Upgradeable loader decoding was checked against the locked
`solana-loader-v3-interface 6.1.1` state enum and 36/45-byte metadata layouts.

### Build and runtime warnings

| Warning | Classification and action |
| --- | --- |
| Vite externalizes Anchor's `fs` and `process` imports | Browser compatibility/latent runtime risk, **not evidence of a vault authorization bypass**. These belong to Node wallet helpers exported by Anchor. The app supplies explicit connections and external signers and never calls Node wallet loading. Chromium account reads pass, but that is not proof of external-wallet signing. Keep the manual signing gate; do not hide the warning with dummy filesystem or secret-loading shims. |
| JavaScript chunk above 500 KB | Performance/maintenance issue. Final bundle is about 729 KB minified / 215 KB gzip. This does not alter signer requirements. Future code splitting is appropriate; raising the warning limit would not fix size. |
| Upstream `uuid@8.3.2` deprecation | Dependency maintenance warning in the supported Anchor/web3.js v1 graph. Versions remain pinned. The warning alone establishes neither a vulnerability nor safety; no comprehensive advisory audit was run. Do not substitute incompatible web3.js v3 just to silence it. |
| Validator `--limit-ledger-size` deprecation | Low maintenance risk: the pinned Agave CLI still accepts the alias and tests execute. Migrate the flag alongside a deliberate tooling update, rather than interpreting this as a failed program build. |

## 2. Tests actually run

| Command | Actual result and scope |
| --- | --- |
| `git status`, branch/history and `git ls-remote origin refs/heads/feature/classical-vault` | Clean checkout; parent matched the previously pushed branch. No reset or recreation. |
| `npm run test:validator` | **21 passed, 0 failed/skipped/cancelled; exit 0**. Compiled the SBF program, generated its IDL, loaded the actual binary into a fresh Agave 4.4.0 validator and submitted signed transactions, including expected failures with ledger error logs. Final duration about 85 seconds. |
| `npm test` | **29 passed, 0 failed/skipped/cancelled; exit 0**. SDK/signature, account-switch queue, public journal, same-origin locking, finality, metadata and React DOM tests. Wallet/RPC fixtures here are mocks; Ed25519 signature verification uses real disposable keys in Node memory. These are not external-wallet or validator tests. |
| `npm run build` | Passed SDK build, full TypeScript checking and Vite production build. Warnings classified above remain. |
| `npm run validator:local`, local RPC `getHealth` | Disposable browser fixture started and reported healthy. An initial concurrent fixture attempt collided on gossip port 8000; after the program suite stopped, a new fixture was started successfully. The initial refused browser RPC connection is not counted as a passing check. |
| `npm run preview --workspace @pqc-wallet/web` and `npm run test:browser` | Passed in system Chromium 154 against actual local RPC. Read the real balance/recipient/one-vote proposal, kept execution disabled, restored a public receipt after reload, blocked another payment, reconciled its confirmed signature on the original chain, cleared the receipt and rejected a mainnet URL. |
| `git diff --check`, source/ABI comparison, SBF SHA-256 | Passed; Rust/ABI unchanged, hash matches the tested program. |

Evidence is retained locally under ignored `target/pre-devnet-validator.log`,
`target/pre-devnet-frontend.log`, `target/pre-devnet-build.log`,
`target/pre-devnet-browser.log`, `target/validator-runs/1793653778722-45019`, and
`target/interface-browser-smoke`. Reproducible test source is committed; generated
ledgers, browser profiles and logs are not.

**Browser scope:** the browser reads actual accounts and checks public receipt
recovery. Its setup runs real local program transactions with disposable keys
only in the Node test process. No key, seed or signing wallet is injected into
Chromium. **No installed wallet extension or physical device signing was tested.**

## 3. Remaining limitations

- This review is not independent audit, formal verification, exhaustive fuzzing,
  hardware-wallet validation or production approval. The vault is classical,
  not quantum-resistant; there is no PQC verifier.
- Public-network writes remain disabled. No devnet/mainnet program was deployed,
  inspected or assigned an upgrade authority. An immutable local genesis loader
  says nothing about a future upgradeable devnet deployment.
- An upgrade authority can replace code and bypass owner approvals. Metadata
  pinning detects an observed deployment change; it does not authenticate RPC,
  verify ELF against source on a public chain, or constrain the authority itself.
- Normal recent-blockhash lifetime may be too short for three slow human prompts.
  Expiry requires a new message and **all three signatures again**. There is no
  durable-nonce/offline co-signing protocol and partial signatures are memory-only.
- Local public receipts and Web Locks protect one browser origin, including its
  port. Separate browser profiles/origins/devices or user-cleared storage do not
  share an intent ledger. Deposits have no on-chain payment-intent idempotency key.
  There is no automatic resubmission or automatic proof of non-execution.
- If a receipt never reaches the ledger, its original RPC is lost, history is
  pruned, or its local genesis is discarded, it stays blocked for **manual ledger
  reconciliation**. Do not delete it merely to enable another payment. Corrupt or
  unavailable storage and missing Web Locks fail closed for writes.
- Successful transaction reporting uses `confirmed`, not guaranteed finality;
  landed errors require `finalized` before a failure unlocks retry. RPC loss keeps
  the outcome unknown. All of this assumes the selected local RPC is trustworthy.
- Balances above the RPC client's exact safe-integer range are refused. Recipients
  are system-owned only. Proposals reserve no SOL; competing proposals may become
  unfunded. Proposal rent remains locked; no cleanup, recovery or rotation exists.

## 4. Required manual wallet tests

Before any devnet enablement, record exact wallet/device versions and public test
addresses, never seeds/private keys. Use disposable local keys and no real funds.

1. Exercise the intended Wallet Standard wallets: advertised `solana:localnet`,
   legacy `solana:signTransaction`, account change events, and partial transaction
   serialization. Feature metadata is not evidence of actual interoperability.
2. Initialize with three simultaneous independent signers, then with a wallet
   exposing only A, then B, then C. Use **Sign with requested identity** each turn.
   Confirm previous signatures persist when earlier accounts disappear and that
   the fully serialized transaction still contains exactly the three required
   owner signatures on the same owner list, vault ID, program ID and blockhash.
3. Reject at each turn; disconnect; cancel while a popup is open; return a late
   response; return only the latest signature; attempt message alteration. Verify
   no incomplete or altered initialization reaches the ledger.
4. Deliberately wait past the signing blockhash lifetime. Rebuild using the same
   public initialization intent and confirm every owner must sign again, with no
   old signature reused for the new blockhash. Never lower signer requirements.
5. Test wrong wallet chain, a changed local genesis/deployment, fee shortage,
   authorization errors, expiry, and the full deposit/propose/approve/execute flow.
   Three identities on one computer are a demonstration, not independent devices.
6. Interrupt submission/confirmation, reload, and open a second same-origin tab.
   Verify the stored public signature remains, new payments stay blocked, and
   only status reconciliation clears it. Test a processed/confirmed error that
   changes before finalization. Verify denied storage/Web Locks prevent sends.
7. For actual independent-device claims, repeat using independent physical
   devices/key generation and backups, including their real prompts and message
   display. Automated Node fixtures and read-only Chromium checks do not satisfy
   this requirement.

## 5. Devnet readiness decision

**Not yet ready as configured.** The local implementation and regression suite
support further controlled local testing. No reviewed on-chain authorization
bypass was found, but that is a scoped review conclusion, not a security guarantee.

A devnet experiment requires all of these separate gates:

- Complete and record the intended real-wallet/device tests above.
- Choose and document the experiment's upgrade authority and trust model. Do not
  claim a single-key upgrade authority is governed by this vault's two-of-three
  rule. Do not irrevocably freeze experimental code without a separate decision.
- Review an explicit devnet-only configuration/deployment change with a known
  program ID, expected genesis, binary/IDL verification, disposable authorities,
  test SOL only and a confirmation/history plan. Mainnet must remain disabled.

This task does not make those deployment decisions, enable devnet writes, merge
code or deploy anything. The next action is the manual local-wallet checklist,
not deployment.
