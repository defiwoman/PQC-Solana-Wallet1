# Windows beginner walkthrough — local testing only

**Windows setup: NOT RUN. Real-wallet signing: NOT RUN.** This guide is prepared
from the project's pinned versions and official documentation/source; the agent
has not used your laptop or a released wallet extension. Record observations in
[the manual test plan](real-wallet-test-plan.md). Automated Linux/Chromium checks
are listed separately in `validation.md`.

Use Windows 11 x64 (or a supported Windows 10 build) with **WSL 2 Ubuntu**. This
path needs `uname -m` to report `x86_64`: the pinned npm Anchor binary is Linux
x86_64. Windows on ARM/native PowerShell builds are not verified by this guide.
Allow roughly 25 GB free disk space for tools, builds and local ledgers. A local
validator can consume substantial CPU/RAM; close it when testing is finished.

Nothing here creates the proposed devnet upgrade key, changes an upgrade
authority, deploys publicly, enables mainnet, or asks you to share signing secrets.
The current program is classical and NOT quantum-resistant. Three identities on
one computer are a **demonstration**, not independent-device security.

## A. Get Ubuntu and this exact branch

**Application: Windows Terminal, PowerShell tab, Run as administrator.**

```powershell
wsl --install -d Ubuntu
```

Restart Windows if requested. If Ubuntu is already installed, inspect
`wsl --list --verbose` and use WSL 2; do not unregister/delete an existing distro.
Open **Ubuntu** from Start and create its Linux username and password. That
password belongs to Ubuntu; it is not a wallet recovery phrase and should not be
sent to anyone.

**Application: Ubuntu terminal. All remaining shell blocks are Ubuntu/Bash,
not PowerShell.**

```sh
uname -m
sudo apt update
sudo apt install -y git curl ca-certificates build-essential pkg-config libssl-dev libudev-dev xz-utils bzip2
mkdir -p ~/src
cd ~/src
git clone --branch feature/classical-vault --single-branch https://github.com/defiwoman/PQC-Solana-Wallet1.git
cd PQC-Solana-Wallet1
git branch --show-current
git status --short
git rev-parse HEAD
```

Expect branch `feature/classical-vault` and a clean status. The last command is the
exact commit you obtained; record it. If the folder already exists, stop and
inspect its Git status first. Do not reset, overwrite, or delete uncommitted work.
Use the Linux home folder above rather than `/mnt/c/...` for builds. `explorer.exe .`
opens the current folder in Windows File Explorer if you need it.

If GitHub denies access, use GitHub's supported account authentication for this
repository. For example, install Ubuntu's `gh` package and use `gh auth login --web --git-protocol https`, then retry only after access works. Never place a token in
a clone URL, document, screenshot or chat. Cloud-session Git authentication does
not automatically authenticate your laptop.

## B. Install the pinned tools

**Application: Ubuntu terminal.** The following is a user-owned installation;
only Ubuntu package installation uses sudo. Do not disable TLS or checksum checks.
If an expected version/checksum fails, stop instead of changing it just to pass.

### Node.js 24.19.0 and npm 11.9.0

```sh
mkdir -p ~/.cache/pqc-tools/node-24.19.0 ~/.local/share/pqc-tools
cd ~/.cache/pqc-tools/node-24.19.0
curl -fSLO https://nodejs.org/download/release/v24.19.0/node-v24.19.0-linux-x64.tar.xz
curl -fSLO https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt
sha256sum --check --ignore-missing SHASUMS256.txt
```

Continue only when the archive reports **OK**:

```sh
tar -xJf node-v24.19.0-linux-x64.tar.xz -C ~/.local/share/pqc-tools
export PATH="$HOME/.local/share/pqc-tools/node-v24.19.0-linux-x64/bin:$PATH"
node --version
npm --version
```

Expect Node `v24.19.0` and npm `11.9.0`. If npm differs, use the same user-owned
Node installation to run `npm install --global npm@11.9.0`, then verify again.

### Rust 1.99.1

```sh
mkdir -p ~/.cache/pqc-tools/rustup
cd ~/.cache/pqc-tools/rustup
curl -fSLO https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init
curl -fSLO https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init.sha256
sha256sum --check rustup-init.sha256
```

After **OK**, install the compiler, not any wallet key:

```sh
chmod +x rustup-init
./rustup-init -y --no-modify-path --profile minimal --default-toolchain 1.99.1
export PATH="$HOME/.cargo/bin:$PATH"
rustc --version
cargo --version
```

### Agave local validator 4.4.0

```sh
mkdir -p ~/.cache/pqc-tools/agave-4.4.0 ~/.local/share/pqc-tools/agave-4.4.0
cd ~/.cache/pqc-tools/agave-4.4.0
curl -fSLO https://github.com/anza-xyz/agave/releases/download/v4.4.0/solana-release-x86_64-unknown-linux-gnu.tar.bz2
printf '%s  %s\n' '3363f4728fe786ac7036e342a20df928aa2e3e43f807fbdce67814840538c574' 'solana-release-x86_64-unknown-linux-gnu.tar.bz2' | sha256sum --check
```

This digest was checked against the official release assets. After **OK**:

```sh
tar -xjf solana-release-x86_64-unknown-linux-gnu.tar.bz2 -C ~/.local/share/pqc-tools/agave-4.4.0
export PATH="$HOME/.local/share/pqc-tools/agave-4.4.0/solana-release/bin:$PATH"
solana-test-validator --version
```

Expect `4.4.0`. Install the existing project's separate SBF helper with Rust:

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo install cargo-build-sbf --version 4.5.0 --locked --jobs 2
cargo-build-sbf --version
```

Expect helper `4.5.0`, platform-tools `v1.57` (which supplies Solana Rust 1.95.0).
The helper's first build downloads those tools using its supported verification.
This can take several minutes.

### Make PATH available in future Ubuntu terminals

Add the following **once** to the end of your personal `~/.bashrc` using an editor
or this block; it appends and does not replace existing configuration:

```sh
cat >> ~/.bashrc <<'PATHS'
export PATH="$HOME/.local/share/pqc-tools/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$HOME/.local/share/pqc-tools/agave-4.4.0/solana-release/bin:$PATH"
PATHS
source ~/.bashrc
cd ~/src/PQC-Solana-Wallet1
npm ci
npm exec -- anchor --version
npm run build
npm test
```

Expect Anchor `1.2.2`. npm installs it from the lockfile; there is no need for a
second global Anchor/AVM installation. Existing browser build warnings are
classified in `pre-devnet-review.md`; a warning is not a claim that manual signing
has passed. A local program-keypair mismatch warning must not be resolved by
changing this branch's reviewed program ID: genesis loading uses the configured
public ID and compiled binary, not a deployment-key signature. If a build actually
fails, preserve the output and stop rather than editing keys/IDs or skipping tests.

## C. Start the local validator and frontend

**Ubuntu terminal 1 — keep it running:**

```sh
cd ~/src/PQC-Solana-Wallet1
npm run validator:local
```

This compiles the unchanged program and loads it into a fresh private local
genesis on RPC port 8899. It does not deploy to devnet/mainnet or generate a devnet
upgrade authority. Validator infrastructure/local build keys are ignored test
artifacts, not your upgrade authority. The known local recipe explicitly uses
the upgradeable loader with the fixed System Program address `11111111111111111111111111111111`
as a placeholder authority at genesis slot zero. No private development key is
generated for that placeholder. This does not change or freeze a future devnet program.

Wait for the printed **PUBLIC LOCAL FIXTURE BASELINE**. It is also saved as
`target/local-authority-baseline.json`. The expected authority comes from the known
fixture recipe, not from copying a reported RPC authority. The genesis hash binds
that expectation to the particular chain you started. If startup fails or a port
is busy, stop; do not use an old manifest or kill an unknown process. Run the
validator tests separately, not concurrently with this manual fixture.

**Ubuntu terminal 2 — keep it running:**

```sh
cd ~/src/PQC-Solana-Wallet1
npm run dev
```

**Windows Chrome, normal dedicated test profile:** open `http://localhost:5173`.
This is your laptop's local page, not a hosted preview. WSL2 normally forwards
localhost services to Windows. If it does not, consult Microsoft's WSL networking
documentation; do not expose the RPC publicly or switch to a public cluster.

1. Click **Verify local network**. Reads may work, but signing is blocked until
   you explicitly approve the expected baseline.
2. Copy the PUBLIC JSON from Ubuntu terminal 1, or open the public file with
   `explorer.exe target` in another Ubuntu terminal and read it with an editor.
   Paste into **Reviewed public baseline JSON**. Never paste any keypair file.
3. Check the program ID, the genesis from your own local fixture and explicit
   `expectedAuthority: "11111111111111111111111111111111"`. Enter a review note, tick the independent-review
   checkbox, and click **Approve reviewed baseline**, then **Verify local network**.
4. Reload the page. The expected baseline remains. **Verify local network** must
   compare against it, never adopt a new RPC-reported authority. A mismatch or
   verification failure latches a hold. Only an explicit, documented baseline
   review can clear it; reloading/reverifying does not.

Starting a new validator creates a new genesis. Deliberately review its new public
manifest before replacing the old baseline, and never replace it while a previous
transaction outcome remains unresolved. The hold is a frontend guard: an actual
upgrade authority can still replace the on-chain program and external clients can
bypass the UI. No devnet baseline/key exists in this walkthrough.

## D. Prepare three fresh wallet identities — manual test NOT RUN

**Application: Windows Chrome with a dedicated new development-only profile.**
Use the current official Backpack website and its linked browser store, not an
old development ZIP or an advertised third-party download. Backpack is the
source-documented candidate; the current store release is **not yet verified**.
See [the source evidence and status table](real-wallet-test-plan.md). Do not
install an old build or disable TLS/security flags to force compatibility.

Inside the external wallet only, use its current **create new wallet** flow for
fresh development material and choose Solana. Do not import a real wallet. Add
fresh identities labeled `PQC Local A`, `PQC Local B`, `PQC Local C`, then copy
**only their three public addresses** into a private local test note. Wallet
versions may use different menu names; the reviewed source exposes creation and
recovery-root flows but is not proof of today's UI.

Important distinction: “create/add account” may derive B/C from A's recovery
phrase. Those are three distinct signing addresses but **not independent recovery
domains**. Mark them as a shared-root demonstration. If the current release has an
explicit new-root workflow, follow its official instructions to create separate
fresh roots and keep them inside the wallet's secure workflow; otherwise leave
the independence test NOT RUN. Do not invent an import workaround, export private
keys, or put any phrase into this application, a terminal, repository, chat or
screenshots. The three-key protocol can be demonstrated without claiming
independent-device security; actual independence remains a separate manual gate.

In the wallet's Solana connection settings, select its **Custom RPC** facility
(if present in the installed version) and set `http://127.0.0.1:8899`. Do not use
mainnet/devnet. Connect it from the app, select an active identity, and inspect
**Metadata precheck only**. Wallet and account localnet must be yes, legacy signing
yes, signing API 1.0.0. This does not yet mean signatures work. If any requirement
fails or the release lacks custom RPC, stop and record it; do not relax the app's
chain checks or signer requirements. Keep manual signing marked NOT RUN.

## E. Fund and test — manual test NOT RUN

**Ubuntu terminal 3, while terminals 1/2 stay open:**

```sh
solana airdrop 1 ADDRESS_A --url http://127.0.0.1:8899
solana airdrop 1 ADDRESS_B --url http://127.0.0.1:8899
solana airdrop 1 ADDRESS_C --url http://127.0.0.1:8899
```

Replace each ADDRESS with its public address, no angle brackets. The local faucet
needs no wallet key and local SOL has no market value. Never use the proposed
upgrade key as A, B or C. You have not created that key in these steps.

**Windows Chrome — app and external wallet:**

1. Enter A/B/C public addresses under initialization and vault ID `0`. Review the
   derived address and program. Owner A pays rent/fees. Click **Review
   initialization**, check the displayed owner list, then **Collect all 3
   signatures and initialize**.
2. When **Required authorization signature** appears, expose A in the external
   wallet, connect/reconnect if needed, then click **Sign with requested identity**
   and approve its popup. Switch to B and repeat, then C. Earlier verified
   signatures stay on the same message even when the prior account disappears.
   All three signatures are mandatory before broadcast. If the signing blockhash
   expires, start fresh and collect all three again; no old signatures are reused.
3. Wait for CONFIRMED and actual account data. Initial spendable balance is zero;
   rent remains protected. Select active A and deposit `10000000` lamports (0.01
   local SOL), then confirm the displayed vault increase.
4. Propose `1000000` lamports to C's public address. Use **current slot + 1000**
   for a future expiry. Inspect the immutable recipient, amount and deadline.
   Creation/payment gives zero approvals.
5. Approve as A. Verify count one and execution disabled. A cannot count twice.
   Switch active wallet to B and approve. Verify count two, then execute once with
   a fee-funded connected identity. Check C's balance change and retained consumed
   proposal. A second execution must not spend again.
6. Complete rejection, cancellation, expiry, unauthorized signer, wrong network,
   baseline mismatch and interrupted-confirmation rows in the manual test plan.
   Record only actual results and public signatures; never mark unperformed cases
   passed. An unknown outcome must be reconciled, including after reload, before
   another payment. Do not clear browser storage simply to force a retry.

Stop the frontend and validator you started with Ctrl+C when finished. Preserve
public test evidence. No merge, public deployment, upgrade-authority creation or
mainnet action is part of this walkthrough.

## Official references and remaining verification

- [Microsoft WSL installation](https://learn.microsoft.com/windows/wsl/install),
  checked through its [official documentation source](https://github.com/MicrosoftDocs/WSL/blob/main/WSL/install.md).
- [Microsoft WSL networking](https://learn.microsoft.com/windows/wsl/networking).
- [Anchor 1.2.2 installation documentation source](https://github.com/solana-foundation/anchor/blob/v1.2.2/docs/content/docs/installation.mdx)
  explicitly directs Windows development through WSL/Linux. This guide pins the
  project versions instead of its changing all-in-one installer.
- [Node 24.19.0 official downloads/checksums](https://nodejs.org/download/release/v24.19.0/).
- [Rustup official installer](https://rust-lang.github.io/rustup/installation/index.html)
  and [official distribution files](https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/).
- [Agave 4.4.0 release and asset digest](https://github.com/anza-xyz/agave/releases/tag/v4.4.0).
- [Wallet source evidence and manual NOT RUN record](real-wallet-test-plan.md).

The Linux toolchain and automated checks were exercised in the cloud. **Executing
these Windows/WSL install commands, current extension UI, actual partial signing,
account switching and real independent devices remains NOT RUN** until you do it.
