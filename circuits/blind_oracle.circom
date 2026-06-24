pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template BlindOracle() {
    signal input data_value;
    signal input threshold;
    signal input nonce;
    
    signal output commitment;
    signal output result;
    
    component gt = GreaterThan(252);
    gt.in[0] <== data_value;
    gt.in[1] <== threshold;
    result <== gt.out;
    
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== data_value;
    poseidon.inputs[1] <== nonce;
    commitment <== poseidon.out;
}

component main = BlindOracle();
