# Blind Oracle: Privacy-Preserving Range Proof Oracle on Stellar

**Version 1.0 — June 2026**
**Network: Stellar Testnet**

---

## Abstract

Blind Oracle is a zero-knowledge oracle protocol built on Stellar Soroban that enables cryptographic range membership proofs without data disclosure. Using the Groth16 proof system over the BN254 elliptic curve, a prover can demonstrate that a private value lies within a publicly specified range — and have this fact verified on-chain — without revealing the underlying data to any party. This paper describes the cryptographic construction, circuit design, on-chain verification mechanism, and practical applications of the Blind Oracle protocol.

---

## 1. Introduction

### 1.1 The Oracle Privacy Problem

Blockchain oracles traditionally require data to be published on-chain for smart contracts to consume it. This creates a fundamental tension: financial data, health metrics, identity attributes, and other sensitive values must be exposed publicly to be verified. In many real-world applications, this disclosure is either legally prohibited, commercially undesirable, or practically dangerous.

Consider the following scenarios:

- A DeFi protocol needs to verify that a user's collateral exceeds a minimum threshold, but the user does not want to reveal their exact holdings
- A KYC gateway needs to confirm a user is above the legal age of 18, without recording their birthdate on-chain
- A credit scoring system needs to gate access based on score ranges, without exposing individual scores to the protocol

In each case, the smart contract needs to make a binary decision (grant or deny access) based on a private value. Blind Oracle solves this with zero-knowledge proofs.

### 1.2 Our Approach

Blind Oracle introduces a general-purpose ZK range proof circuit that produces a cryptographic proof of the statement:

> *"I know a private value `x` and a nonce `r` such that `range_min ≤ x ≤ range_max`, and `commitment = Poseidon(x, r)`"*

The proof is verified on Stellar Soroban using the blockchain's native BN254 pairing operations, ensuring trustless, permissionless, and gas-efficient verification.

---

## 2. Cryptographic Background

### 2.1 Groth16 Proof System

Blind Oracle uses the Groth16 succinct non-interactive argument of knowledge (SNARK). Given a circuit with public inputs `x` and private witness `w`, Groth16 produces a proof `π = (A, B, C)` where:

- `A ∈ G1` (64 bytes on BN254)
- `B ∈ G2` (128 bytes on BN254)
- `C ∈ G1` (64 bytes on BN254)

Total proof size: **256 bytes** — constant regardless of circuit complexity.

Verification requires a single multi-pairing check:

```
e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) == 1
```

where `vk_x = IC[0] + Σ(pub[i] × IC[i+1])` is computed from public inputs and the verification key's IC (Input Commitments) array.

### 2.2 BN254 Elliptic Curve

The BN254 (Barreto-Naehrig) curve provides:
- 128-bit security level
- Efficient pairing operations
- Native support in Stellar Soroban's cryptographic primitives

Field elements are 254-bit integers represented as 32-byte big-endian arrays.

### 2.3 Poseidon Hash Function

Commitments and nullifiers use the Poseidon hash function, which is:
- ZK-friendly (low constraint count in arithmetic circuits)
- Collision-resistant under standard assumptions
- Available in circomlib as a standard component

---

## 3. Protocol Design

### 3.1 Participants

| Role | Description |
|------|-------------|
| **Circuit Compiler** | Compiles the ZK circuit and runs trusted setup (one-time) |
| **Prover** | Holds private data, generates ZK proof locally |
| **Verifier** | Specifies `range_min` and `range_max`, reads on-chain result |
| **Smart Contract** | Stores verification key, executes on-chain verification |

### 3.2 Setup Phase (One-Time)

1. Compile `blind_oracle_v2.circom` to R1CS (1,806 constraints)
2. Run Groth16 trusted setup using Powers of Tau ceremony (16-degree)
3. Export verification key `verification_key_v2.json` (6 IC points for 5 public signals)
4. Encode VK to binary format (836 bytes)
5. Deploy Soroban contract and call `set_vk(vk_bytes)`

### 3.3 Proof Generation Phase

For each verification request:

1. Prover receives `range_min` and `range_max` from verifier
2. Prover computes locally:
   ```
   witness = { data_value, nonce, range_min, range_max }
   proof = Groth16.prove(circuit, witness, zkey)
   public = [commitment, in_range, nullifier, range_min, range_max]
   ```
3. Prover encodes proof and public signals to binary format
4. Prover submits to Stellar: `contract.verify(proof_bytes, pub_bytes)`

### 3.4 Verification Phase (On-Chain)

The smart contract:

1. Loads VK from instance storage
2. Parses proof bytes into `(pi_a, pi_b, pi_c)` G1/G2 points
3. Parses public signals into 5 field elements
4. Computes `vk_x` via scalar multiplication and point addition
5. Runs BN254 multi-pairing check
6. Returns `in_range == 1` (not just pairing success)

---

## 4. Circuit Specification

### 4.1 Signal Declaration

```
Private inputs:   data_value, nonce
Public inputs:    range_min, range_max
Public outputs:   commitment, in_range, nullifier
```

### 4.2 Constraint System

**Range validity constraint:**
```
LessEqThan(252): range_min ≤ range_max
assert(validRange.out == 1)
```

**Lower bound:**
```
GreaterEqThan(252): data_value ≥ range_min → gtMin.out ∈ {0,1}
```

**Upper bound:**
```
LessEqThan(252): data_value ≤ range_max → ltMax.out ∈ {0,1}
```

**Range membership:**
```
in_range = gtMin.out × ltMax.out
```

This quadratic constraint ensures `in_range = 1` if and only if both bounds are satisfied.

**Commitment:**
```
commitment = Poseidon(data_value, nonce)
```

**Nullifier:**
```
nullifier = Poseidon(data_value, commitment)
```

### 4.3 Circuit Statistics

| Metric | Value |
|--------|-------|
| Template instances | 76 |
| Non-linear constraints | 1,246 |
| Linear constraints | 560 |
| Total constraints | 1,806 |
| Public inputs | 2 (`range_min`, `range_max`) |
| Private inputs | 2 (`data_value`, `nonce`) |
| Public outputs | 3 (`commitment`, `in_range`, `nullifier`) |
| Total public signals | 5 |

---

## 5. On-Chain Implementation

### 5.1 Contract Interface

```rust
pub fn set_vk(env: Env, vk_bytes: Bytes) -> Result<(), VerifierError>
pub fn verify(env: Env, proof_bytes: Bytes, pub_signals_bytes: Bytes) -> Result<bool, VerifierError>
```

### 5.2 Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 1 | `MalformedVerifyingKey` | VK binary malformed or wrong size |
| 2 | `VerificationKeyNotSet` | `set_vk` not called before `verify` |
| 3 | `MalformedProof` | Proof binary malformed |
| 4 | `MalformedPublicSignals` | Public signals binary malformed |
| 5 | `InvalidResult` | Pairing check failed (invalid proof) |

### 5.3 Binary Encoding

A critical implementation detail is the G2 coordinate order. SnarkJS stores G2 Fp2 elements as `[c1, c0]` (imaginary component first), while Stellar's BN254 host function expects `[c0, c1]` (real component first). All G2 points must have their coefficient pairs swapped during encoding.

---

## 6. Use Cases

### 6.1 KYC Age Verification
```
Private: birthdate → age = 25
Public:  range_min = 18, range_max = 150
Result:  in_range = true → access granted
```
The protocol proves the user is an adult without revealing their age or identity.

### 6.2 DeFi Collateral Check
```
Private: collateral_amount = 15,000 USDC
Public:  range_min = 10,000, range_max = 50,000
Result:  in_range = true → loan approved
```
The protocol proves collateral sufficiency without exposing portfolio size.

### 6.3 Credit Score Gating
```
Private: credit_score = 500
Public:  range_min = 600, range_max = 850
Result:  in_range = false → access denied
```
The protocol honestly proves the score is outside range — the proof itself is valid; only the range condition fails.

### 6.4 Prediction Market Resolution
A prediction market can resolve based on whether a private data feed value falls within a predicted range, without any party learning the exact value until market close or never.

---

## 7. Security Analysis

### 7.1 Zero-Knowledge

The Groth16 proof reveals nothing about `data_value` or `nonce` beyond what is implied by the public signals (`commitment`, `in_range`, `nullifier`, `range_min`, `range_max`). The commitment is computationally binding (Poseidon preimage resistance) but reveals no information about the input.

### 7.2 Soundness

Under the knowledge of exponent assumption (KEA) and q-SDH assumption on BN254, it is computationally infeasible for a prover to generate a valid proof for a false statement. A dishonest prover cannot claim `in_range = 1` if `data_value` is outside `[range_min, range_max]`.

### 7.3 Replay Protection

The nullifier `Poseidon(data_value, commitment)` is deterministic for a fixed `data_value` and `nonce`. Applications can track used nullifiers on-chain to prevent the same proof from being submitted multiple times.

### 7.4 Range Validity

The circuit enforces `range_min ≤ range_max` as a hard constraint. A verifier cannot specify an empty or inverted range to trick the system.

### 7.5 Trusted Setup

The current deployment uses a single contributor for the phase 2 ceremony. Production deployment should use a multi-party computation (MPC) ceremony with sufficient participants to ensure the toxic waste is destroyed.

---

## 8. Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Witness generation | ~1s | Local, off-chain |
| Proof generation | ~3s | Local, off-chain |
| On-chain verification | ~6s | Stellar testnet block time |
| Proof size | 256 bytes | Constant |
| Public signals | 164 bytes | 5 signals × 32 bytes + 4 byte header |

---

## 9. Future Work

- **Multi-party trusted setup**: Replace single-contributor ceremony with public MPC
- **Recursive proofs**: Aggregate multiple range proofs into a single on-chain verification
- **Prediction market integration**: Full Blind Oracle use case with market resolution
- **Nullifier registry**: On-chain nullifier tracking contract for replay prevention
- **Mainnet deployment**: After audit and trusted setup completion

---

## 10. Conclusion

Blind Oracle demonstrates that privacy-preserving range proofs are practical on Stellar Soroban today. By combining the Groth16 proof system with Stellar's native BN254 pairing operations, we achieve constant-size proofs (256 bytes), efficient on-chain verification, and strong cryptographic guarantees — without any trusted third party involved in the verification itself. The public range input design makes the protocol flexible enough to serve KYC, DeFi, credit scoring, and oracle applications with a single deployed contract.

---

## References

1. Groth, J. (2016). On the Size of Pairing-Based Non-interactive Arguments. EUROCRYPT 2016.
2. Bowe, S., Gabizon, A., Miers, I. (2019). Scalable Multi-party Computation for zk-SNARK Parameters.
3. Grassi, L., et al. (2021). Poseidon: A New Hash Function for Zero-Knowledge Proof Systems. USENIX Security 2021.
4. Stellar Development Foundation. (2024). Soroban Smart Contract Platform Documentation.
5. iden3. (2023). Circom 2.0 Circuit Compiler Documentation.
