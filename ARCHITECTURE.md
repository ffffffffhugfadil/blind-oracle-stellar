# Architecture: Blind Oracle — Computation Privacy Oracle on Stellar

## Overview

Blind Oracle implements a new cryptographic primitive called a **Computation Privacy Oracle (CPO)**: a smart contract that executes based on the *outcome* of a computation over data it never receives.

This document explains the technical decisions, the byte-level encoding pipeline, and the tradeoffs made during implementation.

---

## System Architecture
┌─────────────────────────────────────────────────────────┐

│                    OFF-CHAIN (Prover)                    │

│                                                          │

│  Private Inputs          Circom Circuit v2               │

│  ┌─────────────┐        ┌──────────────────────────┐    │

│  │ data_value  │───────▶│ 1. Threshold comparison  │    │

│  │ nonce       │        │ 2. Range proof            │    │

│  │             │        │ 3. Poseidon commitment    │    │

│  │ Public:     │        │ 4. Nullifier generation   │    │

│  │ range_min   │───────▶│                          │    │

│  │ range_max   │        │ 1806 constraints          │    │

│  └─────────────┘        │ BN254 curve               │    │

│                         └──────────┬─────────────────┘    │

│                                    │                     │

│                         Groth16 Proof (256 bytes)        │

│                         Public Signals (164 bytes)       │

└────────────────────────────────────┼────────────────────┘

│

▼

┌─────────────────────────────────────────────────────────┐

│                    ON-CHAIN (Soroban)                    │

│                                                          │

│  Contract V3: CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7   │

│  TILBUQBVHEGNCLDQVH                                      │

│                                                          │

│  1. Deserialize VK, Proof, Public Signals               │

│  2. Compute vk_x = IC[0] + Σ(signal_i × IC[i+1])       │

│  3. BN254 pairing check (Protocol 26 host function)     │

│  4. Return in_range value                               │

│                                                          │

│  Contract never learns: data_value, nonce               │

└─────────────────────────────────────────────────────────┘

---

## Circuit Design Decisions

### Why Poseidon, not SHA-256?

SHA-256 inside a ZK circuit requires ~25,000 constraints per hash. Poseidon is designed specifically for ZK-friendliness — it operates over the same prime field as the circuit, requiring only ~240 constraints per hash.

Stellar Protocol 25 introduced native Poseidon host functions, making Poseidon hashes cheaper to verify on-chain than any alternative. This makes Poseidon the only rational choice for both the commitment and nullifier.

### Why Groth16, not Plonk or UltraHonk?

| System | Proof size | Verify cost | Trusted setup |
|---|---|---|---|
| Groth16 | 256 bytes | ~61M instructions | Required per circuit |
| Plonk | ~800 bytes | ~150M instructions | Universal |
| UltraHonk (Noir) | ~2KB | ~200M instructions | None |

Soroban has a 100M instruction budget per transaction. Groth16 fits comfortably at ~61M. UltraHonk would exceed the budget. Groth16 is the only production-viable choice for this circuit size on Stellar Protocol 26.

### Why BN254, not BLS12-381?

Both curves are supported by Stellar. BN254 (alt_bn128) was chosen because:
- snarkjs generates Groth16 proofs over BN254 by default
- Circom's circomlib is optimized for BN254
- Protocol 26 added MSM and scalar field operations for BN254, making verification meaningfully cheaper

### Circuit v1 vs v2

| | v1 | v2 |
|---|---|---|
| Constraints | 496 | 1806 |
| Private inputs | data_value, threshold, nonce | data_value, nonce |
| Public inputs | none | range_min, range_max |
| Public outputs | commitment, result | commitment, in_range, nullifier |
| Proves | threshold comparison | range membership + binding + replay protection |

Moving `range_min` and `range_max` to public inputs was a deliberate design choice: the verifier (contract deployer) sets the valid range, while the prover demonstrates membership without revealing the actual value.

---

## Byte Encoding Pipeline

This was the most technically challenging part of the implementation. snarkjs and Soroban use different conventions for representing BN254 points.

### G1 Points (64 bytes)
snarkjs output:  [x_decimal_string, y_decimal_string, "1"]

Soroban expects: [x_be_32bytes || y_be_32bytes]
Conversion:

x_bytes = BigInt(x_decimal).toString(16).padStart(64, '0')

y_bytes = BigInt(y_decimal).toString(16).padStart(64, '0')

g1_bytes = Buffer.concat([x_bytes, y_bytes])  // 64 bytes

### G2 Points (128 bytes) — Critical Ordering Issue

G2 points on BN254 have coordinates in Fp2 (degree-2 extension field). snarkjs stores them as `[[c1, c0], [d1, d0]]` (c1 first), but Soroban's `Bn254G2Affine::from_bytes` expects `[c0, c1, d0, d1]` (c0 first).

**This swap is the most common source of pairing check failures.** Getting this wrong produces a silent failure — the pairing check returns false without any error message.
snarkjs G2:      [[x1, x0], [y1, y0]]

Soroban expects: [x0 || x1 || y0 || y1]  (each 32 bytes)
Correct conversion:

x0 = fieldToBytes32(point[0][1])  // index 1 = x0

x1 = fieldToBytes32(point[0][0])  // index 0 = x1

y0 = fieldToBytes32(point[1][1])  // index 1 = y0

y1 = fieldToBytes32(point[1][0])  // index 0 = y1

g2_bytes = Buffer.concat([x0, x1, y0, y1])  // 128 bytes

### Verification Key Layout (836 bytes)
[alpha  G1:  64 bytes]   — from vk.vk_alpha_1

[beta   G2: 128 bytes]   — from vk.vk_beta_2

[gamma  G2: 128 bytes]   — from vk.vk_gamma_2

[delta  G2: 128 bytes]   — from vk.vk_delta_2

[IC count:   4 bytes BE] — number of IC points (6 for circuit v2)

[IC[0]  G1:  64 bytes]   — constant term

[IC[1]  G1:  64 bytes]   — commitment scalar

[IC[2]  G1:  64 bytes]   — in_range scalar

[IC[3]  G1:  64 bytes]   — nullifier scalar

[IC[4]  G1:  64 bytes]   — range_min scalar

[IC[5]  G1:  64 bytes]   — range_max scalar

### Proof Layout (256 bytes)
[pi_a G1:  64 bytes]

[pi_b G2: 128 bytes]

[pi_c G1:  64 bytes]

### Public Signals Layout (164 bytes)
[count:      4 bytes BE] = 5

[commitment: 32 bytes BE]

[in_range:   32 bytes BE]

[nullifier:  32 bytes BE]

[range_min:  32 bytes BE]

[range_max:  32 bytes BE]

---

## On-Chain Verification (Soroban)

The verifier implements the Groth16 verification equation:
e(A, B) = e(alpha, beta) · e(vk_x, gamma) · e(C, delta)

Where:
vk_x = IC[0] + commitment·IC[1] + in_range·IC[2] +

nullifier·IC[3] + range_min·IC[4] + range_max·IC[5]

In Rust (Soroban SDK):
```rust
let bn = env.crypto().bn254();

let mut vk_x = vk.ic.get(0).unwrap();
for (i, s) in pub_signals.iter().enumerate() {
    let v = vk.ic.get((i + 1) as u32).unwrap();
    let prod = bn.g1_mul(&v, s);
    vk_x = bn.g1_add(&vk_x, &prod);
}

let neg_a = -proof.a;
let result = bn.pairing_check(
    vec![neg_a, vk.alpha, vk_x, proof.c],
    vec![proof.b, vk.beta, vk.gamma, vk.delta]
);
```

The pairing check consumes approximately 61M of Soroban's 100M instruction budget.

---

## Security Properties

### What the contract knows
- The commitment (Poseidon hash of data_value and nonce)
- Whether data_value is within [range_min, range_max]
- The nullifier (for replay protection)
- The range bounds [range_min, range_max] (set by the verifier)

### What the contract never knows
- The actual data_value
- The nonce

### Threat model

**Fake proof attack:** An attacker cannot construct a valid Groth16 proof for false inputs without solving the discrete logarithm problem on BN254. The pairing check enforces this.

**Replay attack:** Each proof includes a nullifier = Poseidon(data_value, commitment). The same data submitted twice produces the same nullifier, which the contract can track to prevent reuse.

**Manipulation attack:** range_min and range_max are public inputs to the proof — they are cryptographically bound to the proof. An attacker cannot change the range after the proof is generated.

---

## Deployed Contracts

| Version | Contract ID | Circuit | Status |
|---|---|---|---|
| V1 | `CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO` | v1 (496 constraints) | Verified |
| V3 | `CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH` | v2 (1806 constraints) | Active |

Network: Stellar Testnet (Protocol 26 / Yardstick)

---

## References

- [BN254 Soroban SDK](https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_bn254/index.html)
- [CAP-0074: BN254 host functions](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md)
- [Groth16 paper](https://eprint.iacr.org/2016/260.pdf)
- [Poseidon hash function](https://eprint.iacr.org/2019/458.pdf)
- [circomlib](https://github.com/iden3/circomlib)
