#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr},
    symbol_short, vec, Bytes, Env, Symbol, Vec, U256, BytesN,
};

const VK_KEY: Symbol = symbol_short!("VK");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VerifierError {
    MalformedVerifyingKey = 1,
    VerificationKeyNotSet = 2,
    MalformedProof = 3,
    MalformedPublicSignals = 4,
    InvalidResult = 5,
}

const G1_SERIALIZED_SIZE: usize = 64;
const G2_SERIALIZED_SIZE: usize = 128;

fn take<const N: usize>(
    bytes: &Bytes,
    pos: &mut u32,
    err: VerifierError,
) -> Result<[u8; N], VerifierError> {
    let end = pos.checked_add(N as u32).ok_or(err)?;
    if end > bytes.len() {
        return Err(err);
    }

    let mut arr = [0u8; N];
    bytes.slice(*pos..end).copy_into_slice(&mut arr);
    *pos = end;
    Ok(arr)
}

#[derive(Clone)]
struct VerificationKey {
    alpha: Bn254G1Affine,
    beta: Bn254G2Affine,
    gamma: Bn254G2Affine,
    delta: Bn254G2Affine,
    ic: Vec<Bn254G1Affine>,
}

impl VerificationKey {
    fn from_bytes(env: &Env, bytes: &Bytes) -> Result<Self, VerifierError> {
        let mut pos = 0u32;

        let alpha_arr = take::<G1_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedVerifyingKey)?;
        let beta_arr = take::<G2_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedVerifyingKey)?;
        let gamma_arr = take::<G2_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedVerifyingKey)?;
        let delta_arr = take::<G2_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedVerifyingKey)?;

        let alpha = Bn254G1Affine::from_bytes(BytesN::from_array(env, &alpha_arr));
        let beta = Bn254G2Affine::from_bytes(BytesN::from_array(env, &beta_arr));
        let gamma = Bn254G2Affine::from_bytes(BytesN::from_array(env, &gamma_arr));
        let delta = Bn254G2Affine::from_bytes(BytesN::from_array(env, &delta_arr));

        let ic_len_bytes = take::<4>(bytes, &mut pos, VerifierError::MalformedVerifyingKey)?;
        let ic_len = u32::from_be_bytes(ic_len_bytes);
        let mut ic = Vec::new(env);

        for _ in 0..ic_len {
            let g1_arr = take::<G1_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedVerifyingKey)?;
            ic.push_back(Bn254G1Affine::from_bytes(BytesN::from_array(env, &g1_arr)));
        }

        if pos != bytes.len() || ic_len == 0 {
            return Err(VerifierError::MalformedVerifyingKey);
        }

        Ok(Self { alpha, beta, gamma, delta, ic })
    }
}

#[derive(Clone)]
struct Proof {
    a: Bn254G1Affine,
    b: Bn254G2Affine,
    c: Bn254G1Affine,
}

impl Proof {
    fn from_bytes(env: &Env, bytes: &Bytes) -> Result<Self, VerifierError> {
        let mut pos = 0u32;

        let a_arr = take::<G1_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedProof)?;
        let b_arr = take::<G2_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedProof)?;
        let c_arr = take::<G1_SERIALIZED_SIZE>(bytes, &mut pos, VerifierError::MalformedProof)?;

        let a = Bn254G1Affine::from_bytes(BytesN::from_array(env, &a_arr));
        let b = Bn254G2Affine::from_bytes(BytesN::from_array(env, &b_arr));
        let c = Bn254G1Affine::from_bytes(BytesN::from_array(env, &c_arr));

        if pos != bytes.len() {
            return Err(VerifierError::MalformedProof);
        }

        Ok(Self { a, b, c })
    }
}

#[derive(Clone)]
pub struct BlindOraclePublicSignals {
    pub commitment: U256,
    pub result: U256,
}

impl BlindOraclePublicSignals {
    pub fn from_bytes(env: &Env, bytes: &Bytes) -> Result<Self, VerifierError> {
        let mut pos = 0u32;

        let len_bytes = take::<4>(bytes, &mut pos, VerifierError::MalformedPublicSignals)?;
        let len = u32::from_be_bytes(len_bytes);
        if len != 2 {
            return Err(VerifierError::MalformedPublicSignals);
        }

        let commitment_arr = take::<32>(bytes, &mut pos, VerifierError::MalformedPublicSignals)?;
        let commitment = U256::from_be_bytes(env, &Bytes::from_array(env, &commitment_arr));

        let result_arr = take::<32>(bytes, &mut pos, VerifierError::MalformedPublicSignals)?;
        let result = U256::from_be_bytes(env, &Bytes::from_array(env, &result_arr));

        if result != U256::from_u32(env, 0) && result != U256::from_u32(env, 1) {
            return Err(VerifierError::InvalidResult);
        }

        if pos != bytes.len() {
            return Err(VerifierError::MalformedPublicSignals);
        }

        Ok(Self { commitment, result })
    }

    pub fn to_fr_vec(&self, env: &Env) -> Vec<Fr> {
        let mut signals = Vec::new(env);
        signals.push_back(Fr::from_u256(self.commitment.clone()));
        signals.push_back(Fr::from_u256(self.result.clone()));
        signals
    }
}

fn verify_proof(
    env: &Env,
    vk: VerificationKey,
    proof: Proof,
    pub_signals: Vec<Fr>,
) -> Result<bool, VerifierError> {
    if pub_signals.len() + 1 != vk.ic.len() {
        return Err(VerifierError::MalformedVerifyingKey);
    }

    let bn = env.crypto().bn254();

    let mut vk_x = vk.ic.get(0).unwrap();
    for (i, s) in pub_signals.iter().enumerate() {
        let v = vk.ic.get((i + 1) as u32).unwrap();
        let prod = bn.g1_mul(&v, s);
        vk_x = bn.g1_add(&vk_x, &prod);
    }

    let neg_a = -proof.a;
    let vp1 = vec![env, neg_a, vk.alpha, vk_x, proof.c];
    let vp2 = vec![env, proof.b, vk.beta, vk.gamma, vk.delta];

    match bn.pairing_check(vp1, vp2) {
        true => Ok(true),
        false => Err(VerifierError::InvalidResult),
    }
}

#[contract]
pub struct BlindOracleVerifierContract;

#[contractimpl]
impl BlindOracleVerifierContract {
    pub fn set_vk(env: Env, vk_bytes: Bytes) -> Result<(), VerifierError> {
        let _vk = VerificationKey::from_bytes(&env, &vk_bytes)?;
        env.storage().instance().set(&VK_KEY, &vk_bytes);
        Ok(())
    }

    pub fn verify(
        env: Env,
        proof_bytes: Bytes,
        pub_signals_bytes: Bytes,
    ) -> Result<bool, VerifierError> {
        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&VK_KEY)
            .ok_or(VerifierError::VerificationKeyNotSet)?;

        let vk = VerificationKey::from_bytes(&env, &vk_bytes)?;
        let proof = Proof::from_bytes(&env, &proof_bytes)?;
        let oracle_signals = BlindOraclePublicSignals::from_bytes(&env, &pub_signals_bytes)?;

        let fr_signals = oracle_signals.to_fr_vec(&env);
        verify_proof(&env, vk, proof, fr_signals)
    }
}

#[cfg(test)]
mod test;
