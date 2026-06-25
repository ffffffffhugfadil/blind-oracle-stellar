<p align="center">
  <img src="https://github.com/user-attachments/assets/112a5c69-1fb1-4b8d-b427-1c72be610194" 
       alt="Banner" 
       width="100%" 
       style="max-width: 731px; display: block; margin: 0 auto;" />
</p>


#  Blind Oracle

**Zero-Knowledge Range Proof Oracle on Stellar Soroban**

Blind Oracle: any smart contract can now ask 'is this number in range?' without ever seeing the number.
Prove that private data is within a range, without revealing the data itself.
Built for **Stellar Hacks: Real-World ZK**.

<table>
  <tr>
    <td><img width="545" height="846" alt="Screen Shot 1" src="https://github.com/user-attachments/assets/6de0722e-8bb8-4602-8c52-0059a3bb712e" /></td>
    <td><img width="545" height="846" alt="Screen Shot 2" src="https://github.com/user-attachments/assets/0b1ff4ac-8de6-44d6-9053-87ae4e1d1816" /></td>
  </tr>
</table>
---

## The Problem

Smart contracts need to make decisions based on private data — but publishing raw data on-chain destroys privacy.

> *"Is BTC above $95,000 right now?"*
> *"Is this user's credit score between 600 and 850?"*
> *"Does this wallet hold enough collateral?"*

The naive answer (publish the number) is unacceptable. Blind Oracle solves this with zero-knowledge proofs.

---

## What Blind Oracle Does

```
Private (stays with prover)       Public (on-chain)
────────────────────────          ──────────────────────────
price  = $97,500         ──ZK──▶  range: [$95,000 – $200,000]
nonce  = secret                   in_range: true ✅
                                  commitment: 0x8484...
                                  nullifier:  0x2060...
```

One Groth16 proof. One Stellar transaction. Market resolves. Price never revealed.

**Powered by:** Groth16 · BN254 · Circom 2.0 · Soroban · Poseidon

---

## Live Demo

```bash
export ALICE_SECRET="your-stellar-secret-key"

# Interactive range proof demo
bash demo.sh

# Prediction market demo
node --experimental-vm-modules prediction-market-demo.mjs
```

---

## Prediction Market Demo Results

All resolved on Stellar testnet — price never revealed:

| Market | Question | Price | Range | Result | TX |
|--------|----------|-------|-------|--------|----|
| BTC-001 | BTC above $95k? | HIDDEN | $95k–$200k | YES ✅ | [view](https://stellar.expert/explorer/testnet/tx/1afe97625134615e9b975dda373793d2966d437cddca946885ee49455df8f920) |
| BTC-002 | BTC above $95k? | HIDDEN | $95k–$200k | NO ❌ | [view](https://stellar.expert/explorer/testnet/tx/326994c65970d1e13091fab1eb43968b29e0b99105d4fc511f7d5b5d0d9eec53) |
| ETH-001 | ETH between $3.5k–$5k? | HIDDEN | $3.5k–$5k | YES ✅ | [view](https://stellar.expert/explorer/testnet/tx/9ff58380f9725d46e9dd41c1e2661d5cb700d050828c45eea911f892b82e50d4) |

---

## On-Chain Performance

| Metric | Value |
|--------|-------|
| CPU Instructions | **33,176,348 / 100,000,000 (33.2%)** |
| Min Resource Fee | **37,472 stroops = 0.0037 XLM** |
| Proof Size | **256 bytes** (constant) |
| Curve | BN254 — 2× cheaper than BLS12-381 |

BN254 is natively supported by Soroban and runs at roughly half the instruction cost of BLS12-381, making Blind Oracle one of the most gas-efficient ZK verifiers on Stellar.

---

## Deployed Contract

| Network | Contract ID |
|---------|-------------|
| Stellar Testnet | `CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH` |

[View on Stellar Expert →](https://stellar.expert/explorer/testnet/contract/CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     PROVER (Off-Chain)                      │
│                                                             │
│  Private: data_value, nonce                                 │
│  Public:  range_min, range_max  ← set by market maker       │
│                                                             │
│  [Circom Circuit] → [SnarkJS Groth16] → proof.bin (256B)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ submit
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  STELLAR SOROBAN (On-Chain)                 │
│                                                             │
│  verify(proof_bytes, pub_signals_bytes)                     │
│    → BN254 pairing check (33.2M instructions)               │
│    → return in_range: true / false                          │
│                                                             │
│  Market resolves. Price never stored anywhere.              │
└─────────────────────────────────────────────────────────────┘
```

### Three Guarantees Per Proof

| Guarantee | Mechanism |
|-----------|-----------|
| `range_min ≤ data_value ≤ range_max` | GreaterEqThan + LessEqThan (252-bit) |
| `commitment = Poseidon(data_value, nonce)` | Binding — prover cannot change value after commit |
| `nullifier = Poseidon(data_value, commitment)` | Replay protection — same data = same nullifier |

---

## Contract Interface

```rust
// One-time: store the Groth16 verification key
set_vk(vk_bytes: Bytes) → Result<(), VerifierError>

// Per proof: verify range membership
verify(proof_bytes: Bytes, pub_signals_bytes: Bytes) → Result<bool, VerifierError>
// Returns true  → proof valid AND data is within range
// Returns false → proof valid but data is outside range
// Returns Error → malformed input
```

---

## Use Cases

### Private Prediction Markets
Price oracles prove a feed value is within a market's target range without ever publishing the exact price. Markets resolve trustlessly with no data leakage.

### KYC / Identity
Prove age ≥ 18, credit score in range, or accreditation status — without storing personal data on-chain.

### DeFi Collateral
Prove collateral exceeds a threshold for undercollateralized lending without exposing portfolio composition.

### Compliance Oracles
Prove transaction values stay within regulatory limits without revealing individual amounts to the protocol.

---

## ZK Circuit

**File:** `circuits/blind_oracle_v2.circom`

```
Private inputs : data_value, nonce
Public inputs  : range_min, range_max   ← verifier sets these
Public outputs : commitment, in_range, nullifier

Constraints    : 1,806
Curve          : BN254
Proof system   : Groth16
```

The range bounds are **public inputs** — not hardcoded. One deployed circuit and one deployed contract serve any range, any asset, any use case.

---

## All Test Results

| Scenario | Data | Range | Result | TX |
|----------|------|-------|--------|----|
| Credit Score | 750 | 600–850 | ✅ in_range | [view](https://stellar.expert/explorer/testnet/tx/29fe99529221411a0e049ca1f3b4421efd82d63719f2621a8082ce0f5cf1aa50) |
| KYC Age | 25 | 18–65 | ✅ in_range | [view](https://stellar.expert/explorer/testnet/tx/4b6ac8381a02cdb9ae5be74871bdb5f182e7b346375b4ec27950400526f658d1) |
| DeFi Collateral | 15,000 | 10k–50k | ✅ in_range | [view](https://stellar.expert/explorer/testnet/tx/9ff58380f9725d46e9dd41c1e2661d5cb700d050828c45eea911f892b82e50d4) |
| Credit Score FAIL | 500 | 600–850 | ❌ out of range | [view](https://stellar.expert/explorer/testnet/tx/326994c65970d1e13091fab1eb43968b29e0b99105d4fc511f7d5b5d0d9eec53) |
| BTC Market YES | HIDDEN | $95k–$200k | ✅ YES | [view](https://stellar.expert/explorer/testnet/tx/1afe97625134615e9b975dda373793d2966d437cddca946885ee49455df8f920) |
| BTC Market NO | HIDDEN | $95k–$200k | ❌ NO | [view](https://stellar.expert/explorer/testnet/tx/326994c65970d1e13091fab1eb43968b29e0b99105d4fc511f7d5b5d0d9eec53) |
| ETH Market YES | HIDDEN | $3.5k–$5k | ✅ YES | [view](https://stellar.expert/explorer/testnet/tx/9ff58380f9725d46e9dd41c1e2661d5cb700d050828c45eea911f892b82e50d4) |

---

## Quick Start

```bash
# Install dependencies
npm install

# 1. Create input
cat > circuits/my_input.json << EOF
{
  "data_value": "97500",
  "nonce": "314159",
  "range_min": "95000",
  "range_max": "200000"
}
EOF

# 2. Generate witness
node circuits/blind_oracle_v2_js/generate_witness.js \
  circuits/blind_oracle_v2_js/blind_oracle_v2.wasm \
  circuits/my_input.json \
  circuits/my_witness.wtns

# 3. Generate proof
npx snarkjs groth16 prove \
  circuits/circuit_v2_final.zkey \
  circuits/my_witness.wtns \
  circuits/my_proof.json \
  circuits/my_public.json

# 4. Encode + verify on-chain
node encode-proof-v2.mjs
export ALICE_SECRET="S..."
node --experimental-vm-modules test-all-scenarios.mjs
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| ZK Proof System | Groth16 (SnarkJS 0.7) |
| ZK Circuit | Circom 2.0 + circomlib |
| Elliptic Curve | BN254 (Barreto-Naehrig) |
| Hash Function | Poseidon |
| Smart Contract | Rust → WASM (Soroban SDK v22) |
| Blockchain | Stellar Soroban Testnet |
| SDK | @stellar/stellar-sdk v16 |
| Trusted Setup | Powers of Tau (2^16) |

---

## Documentation

| File | Description |
|------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, binary formats |
| [WHITE_PAPER.md](./WHITE_PAPER.md) | Cryptographic construction, security analysis |
| [GUIDE.md](./GUIDE.md) | Developer guide, troubleshooting |
| [DEPLOYMENTS.md](./DEPLOYMENTS.md) | All deployments and TX hashes |

---

## Security Notes

- **Trusted Setup**: Single-contributor ceremony. Production requires multi-party MPC.
- **Testnet Only**: Not audited for mainnet.
- **Nullifier Registry**: On-chain nullifier tracking not yet implemented (replay protection is off-chain).
- **Reserve Inputs**: ZK proves computation correctness, not input truthfulness.

---

## License

MIT
