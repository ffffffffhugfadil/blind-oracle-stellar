# Blind Oracle — Developer Guide

Complete guide to running, testing, and extending the Blind Oracle ZK range proof system on Stellar Soroban.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | v18+ | [nodejs.org](https://nodejs.org) |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Circom | 2.0+ | `cargo install circom` |
| Stellar CLI | latest | `cargo install stellar-cli` |
| SnarkJS | 0.7+ | `npx snarkjs` (via npx, no install needed) |

---

## Project Structure

```
blind-oracle-stellar/
├── contracts/                  # Rust smart contract
│   └── src/lib.rs              # Main contract (VerificationKey, Proof, verify())
├── circuits/                   # ZK circuits and proving artifacts
│   ├── blind_oracle_v2.circom  # Main circuit (v2 — public range inputs)
│   ├── blind_oracle_v2_js/     # Compiled WASM for witness generation
│   ├── circuit_v2_final.zkey   # Proving key (phase 2 ceremony)
│   ├── verification_key_v2.json# Verification key (JSON)
│   ├── vk_v2_binary.bin        # Verification key (binary, 836 bytes)
│   ├── proof_v2.json           # Example proof (JSON)
│   ├── public_v2.json          # Example public signals (JSON)
│   ├── proof_v2.bin            # Example proof (binary, 256 bytes)
│   └── public_v2.bin           # Example public signals (binary, 164 bytes)
├── target/                     # Rust build output
│   └── wasm32v1-none/release/
│       └── soroban_groth16_verifier_contract.wasm
├── demo.sh                     # Interactive end-to-end demo
├── deploy-v3.mjs               # Deploy contract + set VK
├── encode-vk-v2.mjs            # Convert VK JSON → binary
├── encode-proof-v2.mjs         # Convert proof+public JSON → binary
├── encode-proof-demo.mjs       # Encoder for demo.sh
├── verify-demo.mjs             # Verifier for demo.sh
├── test-all-scenarios.mjs      # Run all test scenarios
├── set-vk-only.mjs             # Set VK on existing contract
└── DEPLOYMENTS.md              # Deployment history and TX hashes
```

---

## Quick Start — Run the Demo

```bash
# Set your Stellar secret key
export ALICE_SECRET="S..."

# Run interactive demo
bash demo.sh
```

The demo will prompt you to choose a scenario, then run the full pipeline: input → witness → proof → encode → submit to Stellar → result.

---

## Step-by-Step Workflow

### Step 1: Prepare Input

Create `circuits/input_v2.json`:

```json
{
  "data_value": "750",
  "nonce": "12345",
  "range_min": "600",
  "range_max": "850"
}
```

- `data_value` and `nonce`: private, never leave your machine
- `range_min` and `range_max`: public, specified by the verifier

### Step 2: Generate Witness

```bash
node circuits/blind_oracle_v2_js/generate_witness.js \
  circuits/blind_oracle_v2_js/blind_oracle_v2.wasm \
  circuits/input_v2.json \
  circuits/witness_v2.wtns
```

### Step 3: Generate Proof

```bash
npx snarkjs groth16 prove \
  circuits/circuit_v2_final.zkey \
  circuits/witness_v2.wtns \
  circuits/proof_v2.json \
  circuits/public_v2.json
```

Check public signals:
```bash
cat circuits/public_v2.json
# [commitment, in_range, nullifier, range_min, range_max]
# in_range should be "1" if data_value is within range
```

### Step 4: Encode to Binary

```bash
node encode-proof-v2.mjs
# Output:
#   circuits/proof_v2.bin   (256 bytes)
#   circuits/public_v2.bin  (164 bytes)
```

### Step 5: Verify On-Chain

```bash
export ALICE_SECRET="S..."
node --experimental-vm-modules test-all-scenarios.mjs
```

---

## Binary Format Reference

### Verification Key (836 bytes)

```
Offset    Size    Field
0         64      alpha (G1 point: x[32] || y[32])
64        128     beta  (G2 point: x0[32] || x1[32] || y0[32] || y1[32])
192       128     gamma (G2 point)
320       128     delta (G2 point)
448       4       IC length (big-endian u32) = 6
452       384     IC[0..5] (6 × G1 points, 64 bytes each)
```

### Proof (256 bytes)

```
Offset    Size    Field
0         64      pi_a (G1 point)
64        128     pi_b (G2 point)
192       64      pi_c (G1 point)
```

### Public Signals (164 bytes)

```
Offset    Size    Field
0         4       count (big-endian u32) = 5
4         32      commitment (field element, big-endian)
36        32      in_range   (0 or 1)
68        32      nullifier  (field element)
100       32      range_min  (field element)
132       32      range_max  (field element)
```

### G2 Coordinate Convention

**Critical:** SnarkJS outputs G2 Fp2 elements as `[c1, c0]` (imaginary first). Stellar BN254 expects `[c0, c1]` (real first). Always swap when encoding:

```javascript
// SnarkJS format: point[0] = [x_c1, x_c0], point[1] = [y_c1, y_c0]
function encodeG2(point) {
  return Buffer.concat([
    fieldToBuf(point[0][1]),  // x_c0 (real part)
    fieldToBuf(point[0][0]),  // x_c1 (imaginary part)
    fieldToBuf(point[1][1]),  // y_c0
    fieldToBuf(point[1][0]),  // y_c1
  ]);
}
```

---

## Contract Deployment

### Deploy New Contract

```bash
export ALICE_SECRET="S..."
node --experimental-vm-modules deploy-v3.mjs
```

This will:
1. Upload WASM to Stellar testnet
2. Deploy contract with unique salt
3. Call `set_vk()` with binary VK
4. Print the new Contract ID

### Update VK on Existing Contract

```bash
# Edit CONTRACT_HEX in set-vk-only.mjs first
export ALICE_SECRET="S..."
node --experimental-vm-modules set-vk-only.mjs
```

### Build Contract from Source

```bash
cd contracts
cargo build --target wasm32v1-none --release
# Output: ../target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm
```

---

## Circuit Development

### Recompile Circuit

```bash
cd circuits
circom blind_oracle_v2.circom \
  --r1cs --wasm --sym \
  --output . \
  -l node_modules
```

### Regenerate Proving Key

```bash
# Phase 1: Use existing Powers of Tau (2^16 supports up to 65536 constraints)
# Phase 2: Circuit-specific setup
npx snarkjs groth16 setup \
  circuits/blind_oracle_v2.r1cs \
  circuits/powersOfTau28_hez_final_16.ptau \
  circuits/circuit_v2_0000.zkey

npx snarkjs zkey contribute \
  circuits/circuit_v2_0000.zkey \
  circuits/circuit_v2_final.zkey \
  --name="contributor" -e="random entropy"

npx snarkjs zkey export verificationkey \
  circuits/circuit_v2_final.zkey \
  circuits/verification_key_v2.json
```

### Verify Proof Locally (Before On-Chain)

```bash
npx snarkjs groth16 verify \
  circuits/verification_key_v2.json \
  circuits/public_v2.json \
  circuits/proof_v2.json
```

---

## Test Scenarios

### Scenario 1: KYC Age Verification

```json
{
  "data_value": "25",
  "nonce": "99999",
  "range_min": "18",
  "range_max": "65"
}
```

Expected: `in_range = 1` (age 25 is within working-age range)

### Scenario 2: DeFi Collateral Check

```json
{
  "data_value": "15000",
  "nonce": "77777",
  "range_min": "10000",
  "range_max": "50000"
}
```

Expected: `in_range = 1` (collateral sufficient)

### Scenario 3: Credit Score Gate (Fail Case)

```json
{
  "data_value": "500",
  "nonce": "11111",
  "range_min": "600",
  "range_max": "850"
}
```

Expected: `in_range = 0` (score below minimum threshold)

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ALICE_SECRET` | Stellar secret key (starts with `S`) |

---

## Deployed Contracts (Testnet)

| Contract | ID | Status |
|----------|----|--------|
| V2 (4 signals) | `CAUCMJTWUDGCNMMXBVMFW5CT2FD5G5F5LENEY3PU4HDGFEMZ6UPHTICF` | Deprecated |
| V3 buggy | `CD5GAIOMQVHYJ6ZBTINEARM4PRW65I5OI2NTLVBN4FGRX5SQFTAC5Q3N` | Deprecated |
| V3 final | `CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH` | ✅ Active |

Explorer: [https://stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet)

---

## Troubleshooting

### `bn254 G2: point not on curve`
G2 coordinate order is wrong. Make sure you swap `c0/c1` when encoding G2 points from SnarkJS output.

### `Error(Contract, #1)` — MalformedVerifyingKey
VK binary is wrong size or corrupted. Re-run `node encode-vk-v2.mjs` and check output is 836 bytes.

### `Error(Contract, #4)` — MalformedPublicSignals
Public signals binary has wrong count. Circuit v2 expects exactly 5 signals (count = 5 in header).

### `SyntaxError: does not provide an export named 'SorobanRpc'`
Using old import style. Use `rpc` (lowercase) from `@stellar/stellar-sdk` v16+:
```javascript
import { rpc } from "@stellar/stellar-sdk";
const server = new rpc.Server(RPC_URL);
```

### `circuit too big for this power of tau ceremony`
Circuit has too many constraints for the ptau file. Use `powersOfTau28_hez_final_16.ptau` (supports up to 65,536 constraints).
