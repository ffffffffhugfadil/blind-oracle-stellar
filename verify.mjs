import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation, nativeToScVal } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import fs from "fs";

const rpc = new Server("https://soroban-testnet.stellar.org");
const keypair = Keypair.fromSecret("SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA");

const contractId = "CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO";

const proofHex = fs.readFileSync("circuits/proof.hex", "utf8").trim();
const pubHex = fs.readFileSync("circuits/public.hex", "utf8").trim();
const proofBytes = Buffer.from(proofHex, "hex");
const pubBytes = Buffer.from(pubHex, "hex");

async function verify() {
  console.log("=== Verifying Proof On-Chain ===");
  console.log("Contract:", contractId);
  console.log("Proof length:", proofBytes.length, "bytes");
  console.log("Public signals length:", pubBytes.length, "bytes");

  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "verify",
        args: [
          nativeToScVal(proofBytes, { type: "bytes" }),
          nativeToScVal(pubBytes, { type: "bytes" }),
        ],
      })
    )
    .setTimeout(30)
    .build();

  console.log("Calling verify()...");
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
    console.log("\n✅ Verification SUCCESS!");
    console.log("Result:", status.returnValue);
    console.log("Explorer:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
  } else {
    console.log("❌ Failed:", status);
  }
}

verify().catch(console.error);
