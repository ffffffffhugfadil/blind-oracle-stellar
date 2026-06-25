pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * Blind Oracle Circuit v2 — Computation Privacy Oracle (CPO)
 *
 * Proves THREE statements simultaneously without revealing any input:
 * 1. data_value > threshold          (threshold comparison)
 * 2. range_min <= data_value <= range_max  (range validity proof)
 * 3. commitment = Poseidon(data_value, nonce)  (binding commitment)
 * 4. nullifier = Poseidon(data_value, commitment)  (replay protection)
 *
 * Private inputs: data_value, threshold, nonce, range_min, range_max
 * Public outputs: commitment, result, in_range, nullifier
 */
template BlindOracle() {
    // === PRIVATE INPUTS (never leave the prover) ===
    signal input data_value;
    signal input threshold;
    signal input nonce;
    signal input range_min;
    signal input range_max;

    // === PUBLIC OUTPUTS (submitted on-chain with proof) ===
    signal output commitment;   // Poseidon(data_value, nonce)
    signal output result;       // 1 if data_value > threshold
    signal output in_range;     // 1 if range_min <= data_value <= range_max
    signal output nullifier;    // Poseidon(data_value, commitment) — replay protection

    // === 1. THRESHOLD COMPARISON: data_value > threshold ===
    component gt = GreaterThan(252);
    gt.in[0] <== data_value;
    gt.in[1] <== threshold;
    result <== gt.out;

    // === 2. RANGE PROOF: range_min <= data_value <= range_max ===
    component gtMin = GreaterEqThan(252);
    gtMin.in[0] <== data_value;
    gtMin.in[1] <== range_min;

    component ltMax = LessEqThan(252);
    ltMax.in[0] <== data_value;
    ltMax.in[1] <== range_max;

    // in_range = 1 only if BOTH conditions hold
    in_range <== gtMin.out * ltMax.out;

    // === 3. COMMITMENT: Poseidon(data_value, nonce) ===
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== data_value;
    poseidon.inputs[1] <== nonce;
    commitment <== poseidon.out;

    // === 4. NULLIFIER: Poseidon(data_value, commitment) ===
    // Prevents replay: same data submitted twice produces same nullifier
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== data_value;
    nullifierHash.inputs[1] <== commitment;
    nullifier <== nullifierHash.out;
}

component main = BlindOracle();
