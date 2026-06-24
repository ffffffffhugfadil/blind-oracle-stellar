import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation, nativeToScVal } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import fs from "fs";

const rpc = new Server("https://soroban-testnet.stellar.org");
const keypair = Keypair.fromSecret("SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA");

const contractId = "CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO";
const vkHex = fs.readFileSync("circuits/vk_regen.hex", "utf8").trim();
const vkBytes = Buffer.from(vkHex, "hex");

async function setVk() {
  console.log("=== Setting VK ===");
  console.log("Contract:", contractId);
  console.log("VK length:", vkBytes.length, "bytes");
  console.log("VK hex preview:", vkHex.slice(0, 64) + "...");

  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "set_vk",
        args: [nativeToScVal(vkBytes, { type: "bytes" })],
      })
    )
    .setTimeout(30)
    .build();

  console.log("Calling set_vk()...");
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
    console.log("\n✅ VK set successfully!");
    console.log("Explorer:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
  } else {
    console.log("❌ Failed:", status);
  }
}

setVk().catch(console.error);
