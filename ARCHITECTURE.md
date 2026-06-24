# Blind Oracle — System Architecture

## Overview

Blind Oracle is a Zero-Knowledge Range Proof oracle built on Stellar Soroban. It enables any party to cryptographically prove that a private data value lies within a publicly specified range — without revealing the data itself.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        PROVER (Off-Chain)                      │
│                                                                │
│   Private Input          ZK Circuit            Public Output   │
│  ┌────────────┐    ┌──────────────────┐    ┌───────────────┐   │
│  │ data_value │───▶│ blind_oracle_v2  │───▶│  commitment   │   │
│  │   nonce    │    │   (circom+snark) │    │  in_range     │   │
│  └────────────┘    └──────────────────┘    │  nullifier    │   │
│                           ▲                │  range_min    │   │
│   Public Input            │                │  range_max    │   │
│  ┌────────────┐           │                └───────────────┘   │
│  │ range_min  │───────────┘                       │            │
│  │ range_max  │                                   │            │
│  └────────────┘                             Groth16 Proof      │
└─────────────────────────────────────────────────--│────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STELLAR TESTNET (On-Chain)                   │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         Soroban Smart Contract (Rust/WASM)              │   │
│   │                                                         │   │
│   │   set_vk(vk_bytes)                                      │   │
│   │      └─▶ Store Groth16 Verification Key                 │   │
│   │                                                         │   │
│   │   verify(proof_bytes, pub_signals_bytes) → bool         │   │
│   │      ├─▶ Parse VK (stored)                              │   │
│   │      ├─▶ Parse Proof (256 bytes)                        │   │
│   │      ├─▶ Parse Public Signals (164 bytes)               │   │
│   │      ├─▶ BN254 Pairing Check (Groth16)                  │   │
│   │      └─▶ Return in_range value                          │   │
│   │                                                         │   │
│   │   Contract: CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7      │   │
│   │            TILBUQBVHEGNCLDQVH                           │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. ZK Circuit (`circuits/blind_oracle_v2.circom`)

Built with Circom 2.0 and SnarkJS. Implements Groth16 proof system over BN254 curve.

**Inputs:**

| Signal | Type | Description |
|--------|------|-------------|
| `data_value` | Private | The actual secret data |
| `nonce` | Private | Random salt for commitment binding |
| `range_min` | Public | Lower bound (set by verifier) |
| `range_max` | Public | Upper bound (set by verifier) |

**Outputs:**

| Signal | Type | Description |
|--------|------|-------------|
| `commitment` | Public | `Poseidon(data_value, nonce)` |
| `in_range` | Public | `1` if `range_min ≤ data_value ≤ range_max` |
| `nullifier` | Public | `Poseidon(data_value, commitment)` — replay protection |

**Constraints:**
- 1,806 R1CS constraints
- `range_min ≤ range_max` enforced in-circuit
- Both `GreaterEqThan` and `LessEqThan` use 252-bit comparators

### 2. Smart Contract (`contracts/src/lib.rs`)

Written in Rust, compiled to WASM, deployed on Stellar Soroban.

**Functions:**

```rust
set_vk(vk_bytes: Bytes) → Result<(), VerifierError>
verify(proof_bytes: Bytes, pub_signals_bytes: Bytes) → Result<bool, VerifierError>
```

**Binary Formats:**

```
VK (836 bytes):
  [alpha  G1:  64 bytes]
  [beta   G2: 128 bytes]
  [gamma  G2: 128 bytes]
  [delta  G2: 128 bytes]
  [IC len:  4 bytes] = 6
  [IC[0-5] G1: 6 × 64 = 384 bytes]

Proof (256 bytes):
  [pi_a G1:  64 bytes]
  [pi_b G2: 128 bytes]
  [pi_c G1:  64 bytes]

Public Signals (164 bytes):
  [count:      4 bytes] = 5
  [commitment: 32 bytes]
  [in_range:   32 bytes]
  [nullifier:  32 bytes]
  [range_min:  32 bytes]
  [range_max:  32 bytes]
```

**Verification Logic:**
1. Load VK from contract storage
2. Parse proof and public signals from binary
3. Compute `vk_x = IC[0] + Σ(signal[i] × IC[i+1])` using BN254 G1 operations
4. Run pairing check: `e(-pi_a, pi_b) · e(alpha, beta) · e(vk_x, gamma) · e(pi_c, delta) == 1`
5. Return `in_range == 1` (not just pairing result)

### 3. Demo Scripts

| Script | Purpose |
|--------|---------|
| `demo.sh` | End-to-end interactive demo |
| `encode-vk-v2.mjs` | Convert VK JSON → binary |
| `encode-proof-v2.mjs` | Convert proof+public JSON → binary |
| `deploy-v3.mjs` | Deploy contract and set VK |
| `test-all-scenarios.mjs` | Run all test scenarios |

---

## Data Flow

```
1. Prover generates witness:
   input.json → [circom WASM] → witness.wtns

2. Prover generates ZK proof:
   witness.wtns + circuit_final.zkey → proof.json + public.json

3. Prover encodes to binary:
   proof.json → proof.bin (256 bytes, G2 coords c0/c1 swapped)
   public.json → public.bin (164 bytes, 4-byte length prefix)

4. Prover submits to Stellar:
   verify(proof.bin, public.bin) → tx on testnet

5. Contract verifies on-chain:
   BN254 pairing check → return in_range bool
```

---

## Key Engineering Decisions

### G2 Coordinate Swap
SnarkJS stores G2 points as `[c1, c0]` (imaginary first), but Stellar's BN254 expects `[c0, c1]` (real first). All G2 encoding must swap coordinate pairs.

### Public Range Inputs
Unlike traditional ZK oracles where the range is hardcoded in the circuit, Blind Oracle v2 makes `range_min` and `range_max` public inputs. This allows the verifier (on-chain or off-chain) to specify arbitrary ranges without recompiling the circuit.

### in_range vs Proof Validity
The contract distinguishes between two concepts:
- **Proof validity**: pairing check passes (data was correctly computed)
- **Range membership**: `in_range == 1` (data is within the specified range)

A proof with `in_range = 0` is cryptographically valid but returns `false` — the prover honestly proved they are outside the range.

---

## Security Properties

| Property | Mechanism |
|----------|-----------|
| **Zero-Knowledge** | Groth16 proof reveals nothing about `data_value` or `nonce` |
| **Soundness** | Computationally infeasible to forge a proof without knowing private inputs |
| **Binding Commitment** | `commitment = Poseidon(data_value, nonce)` binds prover to a specific value |
| **Replay Protection** | `nullifier = Poseidon(data_value, commitment)` — same data always produces same nullifier |
| **Range Validity** | `range_min ≤ range_max` enforced in-circuit, cannot be bypassed |
| **On-Chain Enforcement** | Contract enforces `in_range == 1` independently of client |

---

## Deployment (Stellar Testnet)

| Version | Contract ID | Status |
|---------|-------------|--------|
| V2 | `CAUCMJTWUDGCNMMXBVMFW5CT2FD5G5F5LENEY3PU4HDGFEMZ6UPHTICF` | Deprecated |
| V3 (active) | `CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH` | ✅ Active |
