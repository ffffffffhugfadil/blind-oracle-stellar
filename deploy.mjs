import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation, rpc as StellarRpc } from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const SECRET = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const WASM_PATH = "target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm";

const server = new StellarRpc.Server("https://soroban-testnet.stellar.org");
const keypair = Keypair.fromSecret(SECRET);

console.log("=== Blind Oracle Deploy ===");
console.log("Public key:", keypair.publicKey());

// Fund via friendbot
console.log("\nFunding account...");
try {
  const fund = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);
  const fundData = await fund.json();
  if (fundData.hash) {
    console.log("✅ Funded:", fundData.hash);
  } else {
    console.log("Already funded or:", JSON.stringify(fundData).slice(0, 100));
  }
} catch(e) {
  console.log("Friendbot skip:", e.message);
}

await new Promise(r => setTimeout(r, 5000));

// Upload WASM
console.log("\nUploading WASM...");
const wasm = readFileSync(WASM_PATH);
console.log("WASM size:", wasm.length, "bytes");

const account = await server.getAccount(keypair.publicKey());

const uploadTx = new TransactionBuilder(account, {
  fee: "1000000",
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.uploadContractWasm({ wasm }))
  .setTimeout(60)
  .build();

const prepared = await server.prepareTransaction(uploadTx);
prepared.sign(keypair);

const result = await server.sendTransaction(prepared);
console.log("TX Hash:", result.hash);

// Poll
let status;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 3000));
  status = await server.getTransaction(result.hash);
  console.log(`Polling [${i+1}]:`, status.status);
  if (status.status !== "NOT_FOUND") break;
}

if (status.status === "SUCCESS") {
  console.log("\n✅ WASM uploaded!");
  console.log("Explorer: https://stellar.expert/explorer/testnet/tx/" + result.hash);
} else {
  console.log("❌", JSON.stringify(status, null, 2));
}
