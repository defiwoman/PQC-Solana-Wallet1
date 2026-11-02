use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("5cLePo1rLF2qCp7Y9B6JByZjrtosDBYBtfBqv8tCjQSm");

#[program]
pub mod wallet {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, vault_id: u64) -> Result<()> {
        let owners = [
            ctx.accounts.owner_a.key(),
            ctx.accounts.owner_b.key(),
            ctx.accounts.owner_c.key(),
        ];
        require!(
            owners[0] != owners[1] && owners[0] != owners[2] && owners[1] != owners[2],
            VaultError::DuplicateOwners
        );
        // A PDA signer supplied by another program is not an Ed25519 authorization key.
        require!(
            owners.iter().all(Pubkey::is_on_curve),
            VaultError::InvalidOwnerKey
        );
        ctx.accounts.vault.set_inner(Vault {
            owners,
            vault_id,
            next_nonce: 0,
        });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        ctx.accounts
            .vault
            .to_account_info()
            .lamports()
            .checked_add(amount)
            .ok_or(VaultError::ArithmeticOverflow)?;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        nonce: u64,
        recipient: Pubkey,
        amount: u64,
        expiry_slot: u64,
    ) -> Result<()> {
        ctx.accounts
            .vault
            .owner_index(&ctx.accounts.proposer.key())?;
        require!(
            nonce == ctx.accounts.vault.next_nonce,
            VaultError::InvalidNonce
        );
        require!(amount > 0, VaultError::InvalidAmount);
        require!(expiry_slot > Clock::get()?.slot, VaultError::Expired);
        require!(
            recipient != Pubkey::default()
                && recipient != ctx.accounts.vault.key()
                && recipient != ctx.accounts.proposal.key(),
            VaultError::InvalidRecipient
        );
        let next_nonce = nonce.checked_add(1).ok_or(VaultError::ArithmeticOverflow)?;
        ctx.accounts.proposal.set_inner(TransferProposal {
            vault: ctx.accounts.vault.key(),
            nonce,
            recipient,
            amount,
            expiry_slot,
            proposer: ctx.accounts.proposer.key(),
            approvals: 0,
            executed: false,
        });
        ctx.accounts.vault.next_nonce = next_nonce;
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        ctx.accounts.proposal.require_live()?;
        let index = ctx
            .accounts
            .vault
            .owner_index(&ctx.accounts.authority.key())?;
        let bit = 1u8 << index; // owner_index only returns 0, 1, or 2.
        require!(
            ctx.accounts.proposal.approvals & bit == 0,
            VaultError::AlreadyApproved
        );
        ctx.accounts.proposal.approvals |= bit;
        Ok(())
    }

    pub fn execute_transfer(ctx: Context<ExecuteTransfer>, expected_amount: u64) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        proposal.require_live()?;
        require!(
            proposal.amount == expected_amount,
            VaultError::AmountMismatch
        );
        require!(
            proposal.approvals.count_ones() >= 2,
            VaultError::InsufficientApprovals
        );
        let source = ctx.accounts.vault.to_account_info();
        let destination = ctx.accounts.recipient.to_account_info();
        let rent = Rent::get()?;
        let remaining = source
            .lamports()
            .checked_sub(proposal.amount)
            .ok_or(VaultError::InsufficientFunds)?;
        require!(
            remaining >= rent.minimum_balance(source.data_len()),
            VaultError::RentReserve
        );
        let receiving = destination
            .lamports()
            .checked_add(proposal.amount)
            .ok_or(VaultError::ArithmeticOverflow)?;
        require!(
            receiving >= rent.minimum_balance(destination.data_len()),
            VaultError::RecipientRent
        );

        // Vault is program-owned with data: debit directly, not via a System Program CPI.
        // All balance checks precede writes. Solana rolls back these writes and the
        // consumed marker together if this instruction or a later instruction fails.
        **source.try_borrow_mut_lamports()? = remaining;
        **destination.try_borrow_mut_lamports()? = receiving;
        proposal.executed = true;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct InitializeVault<'info> {
    #[account(init, payer = payer, space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", owner_a.key().as_ref(), &vault_id.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner_a: Signer<'info>,
    pub owner_b: Signer<'info>,
    pub owner_c: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"vault", vault.owners[0].as_ref(), &vault.vault_id.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, owner = system_program::ID)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateProposal<'info> {
    #[account(mut, seeds = [b"vault", vault.owners[0].as_ref(), &vault.vault_id.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(init, payer = payer, space = 8 + TransferProposal::INIT_SPACE,
        seeds = [b"proposal", vault.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub proposal: Account<'info, TransferProposal>,
    pub proposer: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(seeds = [b"vault", vault.owners[0].as_ref(), &vault.vault_id.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = vault, seeds = [b"proposal", vault.key().as_ref(), &proposal.nonce.to_le_bytes()], bump)]
    pub proposal: Account<'info, TransferProposal>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteTransfer<'info> {
    #[account(mut, seeds = [b"vault", vault.owners[0].as_ref(), &vault.vault_id.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = vault, seeds = [b"proposal", vault.key().as_ref(), &proposal.nonce.to_le_bytes()], bump)]
    pub proposal: Account<'info, TransferProposal>,
    #[account(mut, address = proposal.recipient @ VaultError::RecipientMismatch)]
    pub recipient: SystemAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owners: [Pubkey; 3],
    pub vault_id: u64,
    pub next_nonce: u64,
}

impl Vault {
    pub fn owner_index(&self, key: &Pubkey) -> Result<usize> {
        self.owners
            .iter()
            .position(|owner| owner == key)
            .ok_or_else(|| error!(VaultError::Unauthorized))
    }
}

#[account]
#[derive(InitSpace)]
pub struct TransferProposal {
    pub vault: Pubkey,
    pub nonce: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    pub expiry_slot: u64,
    pub proposer: Pubkey,
    pub approvals: u8,
    pub executed: bool,
}

impl TransferProposal {
    pub fn require_live(&self) -> Result<()> {
        require!(!self.executed, VaultError::AlreadyExecuted);
        require!(Clock::get()?.slot < self.expiry_slot, VaultError::Expired);
        Ok(())
    }
}

#[error_code]
pub enum VaultError {
    #[msg("Authorization keys must be distinct")]
    DuplicateOwners,
    #[msg("Authorization keys must be on-curve Ed25519 keys")]
    InvalidOwnerKey,
    #[msg("Signer is not a vault owner")]
    Unauthorized,
    #[msg("Lamport amount must be positive")]
    InvalidAmount,
    #[msg("Nonce must equal the vault's next unused nonce")]
    InvalidNonce,
    #[msg("Checked arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Proposal has expired")]
    Expired,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("This owner has already approved")]
    AlreadyApproved,
    #[msg("Proposal has already executed")]
    AlreadyExecuted,
    #[msg("Two distinct owner approvals are required")]
    InsufficientApprovals,
    #[msg("Execution amount differs from the immutable proposal")]
    AmountMismatch,
    #[msg("Recipient differs from the immutable proposal")]
    RecipientMismatch,
    #[msg("Vault has insufficient lamports")]
    InsufficientFunds,
    #[msg("Execution would spend the vault's rent reserve")]
    RentReserve,
    #[msg("Recipient would not be rent exempt")]
    RecipientRent,
}
