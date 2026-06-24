
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
