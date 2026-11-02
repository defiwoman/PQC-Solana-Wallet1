use anchor_lang::prelude::*;

// Local scaffold program address only; not deployed and not a usable vault.
declare_id!("5cLePo1rLF2qCp7Y9B6JByZjrtosDBYBtfBqv8tCjQSm");

// Intentionally no instructions, state, custody, transfers, or PQC.
#[program]
pub mod wallet {}
