# 🔮 Blind Oracle

> **A zero-knowledge oracle framework on Stellar — where smart contracts know the answer, but never see the data.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Stellar Testnet](https://img.shields.io/badge/Network-Stellar%20Testnet-blue)](https://stellar.org)
[![Circom](https://img.shields.io/badge/ZK-Circom%202.0-orange)](https://docs.circom.io)
[![Built for](https://img.shields.io/badge/Built%20for-Stellar%20Hacks%20ZK%202026-purple)](https://stellar.org/hacks)

---

## Why Blind Oracle Is Different From Every Other ZK Project on Stellar

Most ZK projects prove **data privacy** — hiding who sent what to whom.  
Blind Oracle proves **computation privacy** — a contract can act on the *outcome* of a computation without ever learning its *inputs*.

This is a fundamentally different primitive. The contract does not learn the price, the sensor reading, or the transaction amount. It only learns: "the computation over that hidden data produced this result, and here is cryptographic proof."

This unlocks applications that were previously impossible on Stellar:

- DeFi protocols that trigger on price movements **without an on-chain price feed**
- Parametric insurance that pays out **without revealing sensor data**
- Compliance checks that verify regulatory limits **without exposing amounts**
- Blind auctions where **losing bids are never revealed**

**One circuit. One verifier. Unlimited private oracles.**

---

## The Problem

Every oracle on-chain today has a fundamental flaw: **the data is visible**.

When a price feed, sports score, or API result is submitted to a smart contract, anyone can read it from the transaction — before execution, during execution, and forever after. This enables front-running, manipulation, and leaks confidential business logic.

## The Solution

Blind Oracle introduces a new primitive: **contracts that react to information they never see**.

Instead of submitting raw data on-chain, a data provider runs the data through a ZK circuit off-chain. The circuit outputs:

- A **commitment** — a cryptographic hash binding the provider to their data
- A **result** — the boolean outcome (e.g. "price > threshold: true")
- A **Groth16 proof** — cryptographic evidence the computation was done correctly

The Soroban smart contract verifies the proof using BN254 host functions (Protocol 26), executes based on the result, and stores the commitment — **without ever learning the underlying data value or threshold**.


<img width="941" height="482" alt="Screen Shot 2026-06-24 at 5 52 32 PM" src="https://github.com/user-attachments/assets/6baaf492-c711-4252-8acc-a3b7b37795fd" />







---

## Live Testnet Deployment

| Component | Value |
|---|---|
| Contract ID | `CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO` |
| WASM Hash | `3532a0ca8e3c2e2cab064d3d80a10528bb2aa4b426f3d83e99f7d7c3305ff11e` |
| Network | Stellar Testnet |
| set_vk TX | [`36ffb5c5...`](https://stellar.expert/explorer/testnet/tx/36ffb5c581335dfbe56f6736f636143d35b0c86a53567f16dedadbd6e121599c) |
| verify TX | [`47d9f8c9...`](https://stellar.expert/explorer/testnet/tx/47d9f8c970f0c0abe340e847a2d1b65dd94f0894d1a0699dfbc7660ec2bc4349) |

The contract verified a Groth16 proof on Stellar testnet. It confirmed `data_value > threshold` is TRUE — **without ever learning either value**.

---

## Three Use Cases, One Circuit

The same circuit and verifier contract handles any threshold comparison over any hidden data. No redeployment. No modification.

### Use Case 1 — Prediction Market (DeFi)
```
Private: BTC price = $67,420 | threshold = $65,000
Public:  commitment = Poseidon(67420, nonce) | result = 1 (TRUE)
On-chain: contract pays "price above" bettors — never learns the price
```

### Use Case 2 — Parametric Insurance
```
Private: rainfall = 12mm | threshold = 25mm (minimum crop coverage)
Public:  commitment = Poseidon(12, nonce) | result = 0 (FALSE = below minimum)
On-chain: insurance payout triggered — insurer never learns exact rainfall
```

### Use Case 3 — Regulatory Compliance
```
Private: transaction amount = 4,999 USDC | threshold = 5,000 (reporting limit)
Public:  commitment = Poseidon(4999, nonce) | result = 0 (FALSE = below limit)
On-chain: compliance check passes — regulator never sees the amount
```

All three share identical circuit logic, identical verifier contract, identical on-chain footprint. The ZK proof is the only thing that changes.

---

## Security: Tamper Resistance

A tampered or fabricated proof is **always rejected**. The BN254 pairing check in Soroban is the enforcement layer — there is no way to produce a valid proof for false inputs without breaking the discrete log assumption.

```
Valid proof   (100 > 50, correctly proven) → ✅ ACCEPTED
Tampered proof (single bit flipped)        → ❌ REJECTED by contract
Fake proof    (fabricated entirely)        → ❌ REJECTED by contract
```

This is demonstrated in `test_invalid.mjs` — run it to see both outcomes on-chain.

---

## Replay Protection

Every proof includes a `nonce` baked into the Poseidon commitment:

```
commitment = Poseidon(data_value, nonce)
```

The same data with a different nonce produces a different commitment, making every proof unique. The `verify_once` function in the contract additionally tracks used commitments in storage — submitting the same proof twice is rejected at the contract level, not just mathematically.

This prevents an attacker from replaying a past valid proof to trigger a contract function a second time.

---

## Architecture

```
blind-oracle-stellar/
├── circuits/
│   ├── blind_oracle.circom          # ZK circuit (Circom 2.0)
│   ├── blind_oracle_js/             # Generated WASM prover
│   ├── blind_oracle.r1cs            # R1CS constraint system
│   ├── circuit_final.zkey           # Proving key (Groth16)
│   ├── verification_key.json        # Verification key
│   ├── convert.mjs                  # snarkjs → Soroban byte converter
│   ├── submit_proof.mjs             # End-to-end submit script
│   └── test_invalid.mjs             # Tamper resistance test
│
├── contracts/
│   ├── src/
│   │   ├── lib.rs                   # Soroban BN254 verifier contract
│   │   └── test.rs                  # Unit tests
│   └── Cargo.toml
│
└── README.md
```

---

## How It Works

### 1. The Circuit (`blind_oracle.circom`)

```circom
pragma circom 2.0.0;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template BlindOracle() {
    // Private — never leaves the prover's machine
    signal input data_value;
    signal input threshold;
    signal input nonce;

    // Public — submitted on-chain with the proof
    signal output commitment;   // Poseidon(data_value, nonce)
    signal output result;       // 1 if data_value > threshold, else 0

    component gt = GreaterThan(252);
    gt.in[0] <== data_value;
    gt.in[1] <== threshold;
    result <== gt.out;

    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== data_value;
    poseidon.inputs[1] <== nonce;
    commitment <== poseidon.out;
}

component main {public []} = BlindOracle();
```

**496 constraints. 3 private inputs. 2 public outputs.**

Poseidon is used because it is ZK-friendly and natively supported as a host function in Stellar Protocol 25+, making it cheaper to verify on-chain than SHA-256.

### 2. The Verifier Contract (`contracts/src/lib.rs`)

A Soroban smart contract that:

- Accepts a Groth16 proof + public signals (`commitment`, `result`)
- Verifies using BN254 pairing checks — Stellar Protocol 26 host functions
- Rejects any tampered or fabricated proof
- Tracks used commitments to prevent replay attacks (`verify_once`)
- Reverts if the proof is invalid — no result is ever recorded

### 3. The Byte Converter (`circuits/convert.mjs`)

snarkjs outputs G1/G2 coordinates as decimal strings. Soroban expects uncompressed affine points as big-endian byte arrays. The converter handles the translation:

- G1 point: `[x, y]` → 64 bytes
- G2 point: `[[x1,x0],[y1,y0]]` → 128 bytes (with correct field ordering)
- Field elements: 32 bytes big-endian each

This is the most critical piece of the pipeline — incorrect byte ordering causes pairing check to silently fail.

---

## ZK Stack

| Component | Technology | Purpose |
|---|---|---|
| Circuit language | Circom 2.0 | Define computation constraints |
| Proof system | Groth16 | Efficient proof + small on-chain footprint |
| Hash function | Poseidon | ZK-friendly commitment (Stellar Protocol 25 native) |
| Elliptic curve | BN254 | Pairing-based proof verification |
| On-chain verifier | Soroban (Rust) | BN254 host functions (Protocol 26) |
| Proof generation | snarkjs + WASM | Client-side, private inputs never leave device |
| Blockchain | Stellar Testnet | Contract deployment + on-chain verification |

---

## Getting Started

### Prerequisites

```bash
node >= 18
npm >= 9
rust (stable) + wasm32v1-none target
circom 2.2.3
stellar-cli >= 27.x
```

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/blind-oracle-stellar
cd blind-oracle-stellar
npm install
cd circuits && npm install
```

### Compile the Circuit

```bash
cd circuits
circom blind_oracle.circom --r1cs --wasm --sym -l node_modules
```

Expected:
```
non-linear constraints: 496
private inputs: 3 / public outputs: 2
Everything went okay
```

### Trusted Setup

```bash
curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_10.ptau \
  -o powersOfTau28_hez_final_10.ptau

npx snarkjs groth16 setup blind_oracle.r1cs powersOfTau28_hez_final_10.ptau circuit_0000.zkey
npx snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="blind-oracle" -e="entropy"
npx snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

### Generate and Verify a Proof

```bash
# Prove: data_value=100 > threshold=50, without revealing either
printf '{"data_value":"100","threshold":"50","nonce":"123456789"}' > input.json

cd blind_oracle_js
node generate_witness.js blind_oracle.wasm ../input.json ../witness.wtns
cd ..

npx snarkjs groth16 prove circuit_final.zkey witness.wtns proof.json public.json
npx snarkjs groth16 verify verification_key.json public.json proof.json
# → [INFO] snarkJS: OK!

# Convert to Soroban byte format
node convert.mjs
```

### Deploy and Submit On-Chain

```bash
# Deploy contract
node deploy.mjs

# Set verification key + submit proof
node submit_proof.mjs

# Test tamper resistance
node test_invalid.mjs
```

---

## Test Suite

```bash
cd contracts
cargo test

# test test_set_vk_and_verify ... ok
# test test_set_vk_validasi ... ok
# test test_blind_oracle_public_signals_parsing ... ok
# test test_blind_oracle_public_signals_invalid_result ... ok
```

---

## Security Properties

| Property | Mechanism | Status |
|---|---|---|
| Data confidentiality | Private circuit inputs never submitted on-chain | ✅ |
| Commitment binding | Poseidon(data_value, nonce) — collision resistant | ✅ |
| Proof soundness | Groth16 — infeasible to fake without breaking DL | ✅ |
| Tamper resistance | BN254 pairing check rejects any modified proof | ✅ |
| Replay protection | Nonce in commitment + `verify_once` storage tracking | ✅ |
| Front-running resistance | No raw data in mempool — nothing to front-run | ✅ |

> This is a hackathon prototype. The trusted setup uses a single contribution and has not been audited. Do not use with real assets.

---

## Resources

- [ZK Proofs on Stellar](https://developers.stellar.org/docs/build/apps/zk)
- [Groth16 Verifier Reference](https://github.com/stellar/soroban-examples/tree/main/groth16_verifier)
- [Stellar Protocol 26 (Yardstick)](https://stellar.org/blog/foundation-news/stellar-yardstick-protocol-26-upgrade-guide)
- [BN254 Soroban SDK Docs](https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_bn254/index.html)
- [Circom Documentation](https://docs.circom.io)
- [Privacy Pools Whitepaper](https://privacypools.com/whitepaper.pdf)

---

## Team

Built for [Stellar Hacks: Real-World ZK](https://stellar.org/hacks) — June 2026.

---

## License

MIT
