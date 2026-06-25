import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation, nativeToScVal, xdr, Address } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { randomBytes } from "crypto";
import fs from "fs";

const rpc = new Server("https://soroban-testnet.stellar.org");
const keypair = Keypair.fromSecret("SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA");
const vkHex = fs.readFileSync("circuits/verification_key.json", "utf8").trim();
const vkBytes = Buffer.from(vkHex, "hex");

// WASM hash dari upload
const wasmHash = "618fc3eb543c2feb3ae46c17c80b541dc4929f02cc10aad146fe8fb5d99ef709";

async function deploy() {
  console.log("=== Instantiating Contract ===");
  console.log("VK length:", vkBytes.length, "bytes");
  
  const account = await rpc.getAccount(keypair.publicKey());
  console.log("Account:", keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.createContract({
        wasmHash: wasmHash,
        constructorArgs: [nativeToScVal(vkBytes, { type: "bytes" })],
      })
    )
    .setTimeout(30)
    .build();

  console.log("Creating contract...");
  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await rpc.sendTransaction(prepared);
  console.log("TX Hash:", result.hash);

  let status;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    status = await rpc.getTransaction(result.hash);
    console.log(`Polling [${i+1}]:`, status.status);
    if (status.status !== "NOT_FOUND") break;
  }

  if (status?.status === "SUCCESS") {
    console.log("\n✅ Contract instantiated successfully!");
    console.log("Contract ID:", status.returnValue);
    console.log("Explorer:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
  } else {
    console.log("❌ Failed:", status);
  }
}

deploy().catch(console.error);
