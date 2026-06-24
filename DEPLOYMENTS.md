
## Live Testnet — 4 Verified Proofs On-Chain

One circuit. One verifier contract. Four different use cases. The contract never learned any of the underlying data values.

| Use Case | Private Data | Result | TX Hash |
|---|---|---|---|
| Prediction Market | data=100, threshold=50 | ✅ TRUE (100 > 50) | [`47d9f8c9`](https://stellar.expert/explorer/testnet/tx/47d9f8c970f0c0abe340e847a2d1b65dd94f0894d1a0699dfbc7660ec2bc4349) |
| Parametric Insurance | rainfall=12mm, min=25mm | ❌ FALSE (below min → payout) | [`a9a6b3fe`](https://stellar.expert/explorer/testnet/tx/a9a6b3fe26bc69d97a371adf6deb753d1c068b387319a7e6433b8f0439f0c4e0) |
| Regulatory Compliance | amount=4999, limit=5000 | ❌ FALSE (below limit → pass) | [`315a41d3`](https://stellar.expert/explorer/testnet/tx/315a41d372b5e3b239ac43d5375cfdf0b38319939d9ea4ea397b555835b7cce5) |
| DeFi Price Feed | price=67420, threshold=65000 | ✅ TRUE (above threshold) | [`71f9c1a6`](https://stellar.expert/explorer/testnet/tx/71f9c1a615077ddb816f75e83e8712a70d1d54235d82a4a63e8fa94e455c11b3) |

Contract ID: `CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO`  
WASM Hash: `3532a0ca8e3c2e2cab064d3d80a10528bb2aa4b426f3d83e99f7d7c3305ff11e`  
Network: Stellar Testnet (Protocol 26)

## Contract V3 — Public Range Proof (Juni 2026)

### Contract
- **Contract ID:** CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH
- **WASM hash:** 5a7797bc704c678fb24fd28df231d7f5b96d0c55f6a11dca3ce804e8cb40944a
- **Circuit:** blind_oracle_v2.circom (1806 constraints)
- **Public signals:** commitment, in_range, nullifier, range_min, range_max

### Upgrade dari V2
- range_min & range_max jadi PUBLIC input (verifier set range)
- Contract enforce in_range on-chain (return false jika di luar range)
- Constraint range_min <= range_max di circuit

### Test Results
| Skenario | Data | Range | Result |
|---|---|---|---|
| KYC Age | 25 | 18-65 | in_range=true |
| DeFi Collateral | 15000 | 10000-50000 | in_range=true |
| Credit Score FAIL | 500 | 600-850 | in_range=false |

### Transactions
- KYC:   https://stellar.expert/explorer/testnet/tx/4b6ac8381a02cdb9ae5be74871bdb5f182e7b346375b4ec27950400526f658d1
- DeFi:  https://stellar.expert/explorer/testnet/tx/9ff58380f9725d46e9dd41c1e2661d5cb700d050828c45eea911f892b82e50d4
- FAIL:  https://stellar.expert/explorer/testnet/tx/326994c65970d1e13091fab1eb43968b29e0b99105d4fc511f7d5b5d0d9eec53

## Contract V3 — Public Range Proof (Juni 2026)

### Contract

- **Contract ID:** CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH

- **WASM hash:** 5a7797bc704c678fb24fd28df231d7f5b96d0c55f6a11dca3ce804e8cb40944a

- **Circuit:** blind_oracle_v2.circom (1806 constraints)

- **Public signals:** commitment, in_range, nullifier, range_min, range_max

### Upgrade from V2

- range_min & range_max jadi PUBLIC input (verifier set range)

- Contract enforce in_range on-chain (return false jika di luar range)

- Constraint range_min <= range_max di circuit

### Test Results

| Skenario | Data | Range | Result |

|---|---|---|---|

| KYC Age | 25 | 18-65 | in_range=true |

| DeFi Collateral | 15000 | 10000-50000 | in_range=true |

| Credit Score FAIL | 500 | 600-850 | in_range=false |

### Transactions

- KYC:   https://stellar.expert/explorer/testnet/tx/4b6ac8381a02cdb9ae5be74871bdb5f182e7b346375b4ec27950400526f658d1

- DeFi:  https://stellar.expert/explorer/testnet/tx/9ff58380f9725d46e9dd41c1e2661d5cb700d050828c45eea911f892b82e50d4

- FAIL:  https://stellar.expert/explorer/testnet/tx/326994c65970d1e13091fab1eb43968b29e0b99105d4fc511f7d5b5d0d9eec53


## Prediction Market Demo (Juni 2026)

### Resource Usage (verify())
- CPU Instructions : 33,176,348 / 100,000,000 (33.2%)
- Min Resource Fee : 37,472 stroops = 0.0037472 XLM
- Comparison       : 2x cheaper than Vouch (BLS12-381 ~61M instructions)

### Markets Resolved On-Chain
| Market | Question | Result | TX |
|--------|----------|--------|----|
| BTC-001 | BTC above $95,000? | YES | https://stellar.expert/explorer/testnet/tx/ |
| BTC-002 | BTC above $95,000? | NO  | https://stellar.expert/explorer/testnet/tx/ |
| ETH-001 | ETH $3,500-$5,000? | YES | https://stellar.expert/explorer/testnet/tx/ |
