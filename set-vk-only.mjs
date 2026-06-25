import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, StrKey, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL = "https://soroban-testnet.stellar.org";
const SECRET = process.env.ALICE_SECRET;
const CONTRACT_HEX = "28262676a0cc26b1970d585b7453d147d374bd591a4c6df4e1c6629199f51e79";

async function main() {
  const keypair = Keypair.fromSecret(SECRET);
  const server = new rpc.Server(RPC_URL, { allowHttp: false });

  const vkBytes = readFileSync("circuits/vk_binary.bin");
  console.log("VK binary length:", vkBytes.length, "bytes");

  const contractId = Buffer.from(CONTRACT_HEX, "hex");
  const contractStrKey = StrKey.encodeContract(contractId);
  console.log("Contract:", contractStrKey);

  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractStrKey,
        function: "set_vk",
        args: [xdr.ScVal.scvBytes(vkBytes)],
      })
    )
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);
  console.log("TX:", result.hash);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await server.getTransaction(result.hash);
    console.log(`Polling [${i+1}]:`, status.status);
    if (status.status !== "NOT_FOUND") {
      if (status.status === "SUCCESS") {
        console.log("\n✅ VK set! Contract ready.");
        console.log("Contract ID:", contractStrKey);
      } else {
        console.log("❌ Failed:", JSON.stringify(status, null, 2));
      }
      break;
    }
  }
}

main().catch(console.error);
