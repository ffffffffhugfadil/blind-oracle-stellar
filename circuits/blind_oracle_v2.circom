pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * Blind Oracle Circuit v3 — Public Range Proof
 *
 * Proves THREE statements simultaneously:
 * 1. range_min <= data_value <= range_max  (range proof with PUBLIC range)
 * 2. commitment = Poseidon(data_value, nonce)  (binding commitment)
 * 3. nullifier = Poseidon(data_value, commitment)  (replay protection)
 *
 * Private inputs: data_value, nonce
 * Public inputs:  range_min, range_max  ← verifier sets this!
 * Public outputs: commitment, in_range, nullifier
 *
 * Use cases:
 * - DeFi: prove collateral > min without revealing amount
 * - KYC:  prove age >= 18 without revealing birthdate
 * - Credit: prove score in 600-850 range without revealing score
 */
template BlindOracleV2() {
    // === PRIVATE INPUTS ===
    signal input data_value;
    signal input nonce;

    // === PUBLIC INPUTS (set by verifier) ===
    signal input range_min;
    signal input range_max;

    // === PUBLIC OUTPUTS ===
    signal output commitment;  // Poseidon(data_value, nonce)
    signal output in_range;    // 1 if range_min <= data_value <= range_max
    signal output nullifier;   // Poseidon(data_value, commitment)

    // === CONSTRAINT: range_min <= range_max ===
    component validRange = LessEqThan(252);
    validRange.in[0] <== range_min;
    validRange.in[1] <== range_max;
    validRange.out === 1;  // enforce valid range

    // === RANGE PROOF: range_min <= data_value ===
    component gtMin = GreaterEqThan(252);
    gtMin.in[0] <== data_value;
    gtMin.in[1] <== range_min;

    // === RANGE PROOF: data_value <= range_max ===
    component ltMax = LessEqThan(252);
    ltMax.in[0] <== data_value;
    ltMax.in[1] <== range_max;

    // in_range = 1 only if BOTH hold
    in_range <== gtMin.out * ltMax.out;

    // === COMMITMENT ===
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== data_value;
    poseidon.inputs[1] <== nonce;
    commitment <== poseidon.out;

    // === NULLIFIER ===
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== data_value;
    nullifierHash.inputs[1] <== commitment;
    nullifier <== nullifierHash.out;
}

component main {public [range_min, range_max]} = BlindOracleV2();
