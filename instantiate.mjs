import { Keypair, Networks, rpc as SorobanRpc, TransactionBuilder, BASE_FEE, Operation, Address } from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import crypto from "crypto";

const SECRET = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const WASM_PATH = "target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm";
const RPC_URL = "https://soroban-testnet.stellar.org";

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const keypair = Keypair.fromSecret(SECRET);

// Compute WASM hash
const wasm = readFileSync(WASM_PATH);
const wasmHash = crypto.createHash("sha256").update(wasm).digest();
console.log("WASM hash:", wasmHash.toString("hex"));

const account = await rpc.getAccount(keypair.publicKey());

// Generate random salt untuk contract address unik
const salt = crypto.randomBytes(32);

const deployTx = new TransactionBuilder(account, {
  fee: "1000000",
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.createCustomContract({
    address: new Address(keypair.publicKey()),
    wasmHash: wasmHash,
    salt: salt,
  }))
  .setTimeout(60)
  .build();

const prepared = await rpc.prepareTransaction(deployTx);
prepared.sign(keypair);

console.log("Deploying contract...");
const result = await rpc.sendTransaction(prepared);
console.log("TX Hash:", result.hash);

// Poll
let status;
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 3000));
  status = await rpc.getTransaction(result.hash);
  console.log(`Polling [${i+1}]:`, status.status);
  if (status.status !== "NOT_FOUND") break;
}

if (status.status === "SUCCESS") {
  // Extract contract ID dari result
  const contractId = status.resultMetaXdr;
  console.log("\n✅ Contract deployed!");
  console.log("TX Hash:", result.hash);
  console.log("Explorer: https://stellar.expert/explorer/testnet/tx/" + result.hash);
  console.log("\nFull result (cari contractID):");
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log("❌ Failed:", JSON.stringify(status, null, 2));
}
