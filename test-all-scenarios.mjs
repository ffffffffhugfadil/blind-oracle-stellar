import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL     = "https://soroban-testnet.stellar.org";
const SECRET      = process.env.ALICE_SECRET;
const CONTRACT_V3 = "CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH";

const SCENARIOS = [
  {
    name: "KYC Age Verification (age=25, range 18-65)",
    proof: "circuits/proof_kyc.bin",
    pub:   "circuits/public_kyc.bin",
    expect: true,
  },
  {
    name: "DeFi Collateral (amount=15000, range 10000-50000)",
    proof: "circuits/proof_defi_v2.bin",
    pub:   "circuits/public_defi_v2.bin",
    expect: true,
  },
  {
    name: "Credit Score FAIL (score=500, range 600-850)",
    proof: "circuits/proof_fail.bin",
    pub:   "circuits/public_fail.bin",
    expect: false,
  },
];

async function verifyScenario(server, keypair, scenario) {
  const proofBytes = readFileSync(scenario.proof);
  const pubBytes   = readFileSync(scenario.pub);

  const account = await server.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: CONTRACT_V3,
      function: "verify",
      args: [xdr.ScVal.scvBytes(proofBytes), xdr.ScVal.scvBytes(pubBytes)],
    }))
    .setTimeout(300).build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await server.getTransaction(result.hash);
    if (status.status !== "NOT_FOUND") {
      const success = status.status === "SUCCESS";
      const retVal  = success ? status.returnValue?._value : null;
      return { success, retVal, hash: result.hash };
    }
  }
  return { success: false, hash: result.hash };
}

async function main() {
  console.log("=== Blind Oracle V3 — Multi-Scenario Test ===");
  console.log("Contract:", CONTRACT_V3);
  console.log("");

  const keypair = Keypair.fromSecret(SECRET);
  const server  = new rpc.Server(RPC_URL, { allowHttp: false });

  const results = [];

  for (const scenario of SCENARIOS) {
    console.log(`Testing: ${scenario.name}`);
    const res = await verifyScenario(server, keypair, scenario);

    const inRange = res.retVal;
    const passed  = res.success;
    const icon    = passed ? "✅" : "❌";

    console.log(`${icon} Status: ${res.success ? "SUCCESS" : "FAILED"} | in_range: ${inRange}`);
    console.log(`   TX: https://stellar.expert/explorer/testnet/tx/${res.hash}`);
    console.log("");

    results.push({ ...scenario, ...res, inRange });
  }

  console.log("=== SUMMARY ===");
  for (const r of results) {
    const icon = r.success ? "✅" : "❌";
    console.log(`${icon} ${r.name}`);
    console.log(`   in_range=${r.inRange} | TX: ${r.hash}`);
  }
}

main().catch(console.error);
