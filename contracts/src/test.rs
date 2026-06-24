#![cfg(test)]

use super::*;
use soroban_sdk::{Bytes, Env, U256};

#[test]
fn test_set_vk_and_verify() {
    let env = Env::default();
    let contract_id = env.register(BlindOracleVerifierContract, ());
    let client = BlindOracleVerifierContractClient::new(&env, &contract_id);

    let result = client.try_verify(&Bytes::new(&env), &Bytes::new(&env));
    assert!(result.is_err());
}

#[test]
fn test_set_vk_validasi() {
    let env = Env::default();
    let contract_id = env.register(BlindOracleVerifierContract, ());
    let client = BlindOracleVerifierContractClient::new(&env, &contract_id);

    let bad_vk = Bytes::from_array(&env, &[0u8; 64]);
    let result = client.try_set_vk(&bad_vk);
    assert!(result.is_err());
}

#[test]
fn test_blind_oracle_public_signals_parsing() {
    let env = Env::default();
    let commitment = U256::from_u32(&env, 12345);
    let result = U256::from_u32(&env, 1);

    let mut bytes = Bytes::new(&env);

    // Konversi Bytes ke array [u8; 32]
    let comm_bytes = commitment.to_be_bytes();
    let res_bytes = result.to_be_bytes();

    let mut comm_arr = [0u8; 32];
    let mut res_arr = [0u8; 32];
    comm_bytes.copy_into_slice(&mut comm_arr);
    res_bytes.copy_into_slice(&mut res_arr);

    // Build bytes: [len: 4 bytes][commitment: 32 bytes][result: 32 bytes]
    bytes.extend_from_array(&2u32.to_be_bytes());
    bytes.extend_from_array(&comm_arr);
    bytes.extend_from_array(&res_arr);

    let parsed = BlindOraclePublicSignals::from_bytes(&env, &bytes).unwrap();
    assert_eq!(parsed.commitment, commitment);
    assert_eq!(parsed.result, result);
}

#[test]
fn test_blind_oracle_public_signals_invalid_result() {
    let env = Env::default();
    let commitment = U256::from_u32(&env, 12345);
    let result = U256::from_u32(&env, 2); // invalid: harus 0 atau 1

    let mut bytes = Bytes::new(&env);

    let comm_bytes = commitment.to_be_bytes();
    let res_bytes = result.to_be_bytes();

    let mut comm_arr = [0u8; 32];
    let mut res_arr = [0u8; 32];
    comm_bytes.copy_into_slice(&mut comm_arr);
    res_bytes.copy_into_slice(&mut res_arr);

    bytes.extend_from_array(&2u32.to_be_bytes());
    bytes.extend_from_array(&comm_arr);
    bytes.extend_from_array(&res_arr);

    let parsed = BlindOraclePublicSignals::from_bytes(&env, &bytes);
    assert!(parsed.is_err());
}
