/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/wallet.json`.
 */
export type Wallet = {
  "address": "5cLePo1rLF2qCp7Y9B6JByZjrtosDBYBtfBqv8tCjQSm",
  "metadata": {
    "name": "wallet",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Experimental classical Solana wallet foundation; not quantum-resistant"
  },
  "instructions": [
    {
      "name": "approve",
      "discriminator": [
        69,
        74,
        217,
        36,
        115,
        117,
        97,
        76
      ],
      "accounts": [
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owners0",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "proposal.nonce",
                "account": "transferProposal"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createProposal",
      "discriminator": [
        132,
        116,
        68,
        174,
        216,
        160,
        198,
        22
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owners0",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "proposer",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "recipient",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "expirySlot",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owners0",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeTransfer",
      "discriminator": [
        233,
        126,
        160,
        184,
        235,
        206,
        31,
        119
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owners0",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "proposal.nonce",
                "account": "transferProposal"
              }
            ]
          }
        },
        {
          "name": "recipient",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "expectedAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "ownerA"
              },
              {
                "kind": "arg",
                "path": "vaultId"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "ownerA",
          "signer": true
        },
        {
          "name": "ownerB",
          "signer": true
        },
        {
          "name": "ownerC",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vaultId",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "transferProposal",
      "discriminator": [
        4,
        63,
        123,
        17,
        197,
        223,
        149,
        175
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "duplicateOwners",
      "msg": "Authorization keys must be distinct"
    },
    {
      "code": 6001,
      "name": "invalidOwnerKey",
      "msg": "Authorization keys must be on-curve Ed25519 keys"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Signer is not a vault owner"
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Lamport amount must be positive"
    },
    {
      "code": 6004,
      "name": "invalidNonce",
      "msg": "Nonce must equal the vault's next unused nonce"
    },
    {
      "code": 6005,
      "name": "arithmeticOverflow",
      "msg": "Checked arithmetic overflow"
    },
    {
      "code": 6006,
      "name": "expired",
      "msg": "Proposal has expired"
    },
    {
      "code": 6007,
      "name": "invalidRecipient",
      "msg": "Invalid recipient"
    },
    {
      "code": 6008,
      "name": "alreadyApproved",
      "msg": "This owner has already approved"
    },
    {
      "code": 6009,
      "name": "alreadyExecuted",
      "msg": "Proposal has already executed"
    },
    {
      "code": 6010,
      "name": "insufficientApprovals",
      "msg": "Two distinct owner approvals are required"
    },
    {
      "code": 6011,
      "name": "amountMismatch",
      "msg": "Execution amount differs from the immutable proposal"
    },
    {
      "code": 6012,
      "name": "recipientMismatch",
      "msg": "Recipient differs from the immutable proposal"
    },
    {
      "code": 6013,
      "name": "insufficientFunds",
      "msg": "Vault has insufficient lamports"
    },
    {
      "code": 6014,
      "name": "rentReserve",
      "msg": "Execution would spend the vault's rent reserve"
    },
    {
      "code": 6015,
      "name": "recipientRent",
      "msg": "Recipient would not be rent exempt"
    }
  ],
  "types": [
    {
      "name": "transferProposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "expirySlot",
            "type": "u64"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "approvals",
            "type": "u8"
          },
          {
            "name": "executed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owners",
            "type": {
              "array": [
                "pubkey",
                3
              ]
            }
          },
          {
            "name": "vaultId",
            "type": "u64"
          },
          {
            "name": "nextNonce",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
