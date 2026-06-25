import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, StrKey, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL     = "https://soroban-testnet.stellar.org";
const SECRET      = process.env.ALICE_SECRET;
const CONTRACT_HEX = "28262676a0cc26b1970d585b7453d147d374bd591a4c6df4e1c6629199f51e79";

async function main() {
  const keypair = Keypair.fromSecret(SECRET);
  const server  = new rpc.Server(RPC_URL, { allowHttp: false });

  const contractStrKey = StrKey.encodeContract(Buffer.from(CONTRACT_HEX, "hex"));
  console.log("Contract:", contractStrKey);

  const proofBytes  = readFileSync("circuits/proof.bin");
  const pubBytes    = readFileSync("circuits/public.bin");
  console.log("Proof:", proofBytes.length, "bytes");
  console.log("Public:", pubBytes.length, "bytes");

  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractStrKey,
        function: "verify",
        args: [
          xdr.ScVal.scvBytes(proofBytes),
          xdr.ScVal.scvBytes(pubBytes),
        ],
      })
    )
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);
  console.log("\nTX:", result.hash);
  console.log("Explorer:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await server.getTransaction(result.hash);
    process.stdout.write(`\rPolling [${i+1}]: ${status.status}   `);
    if (status.status !== "NOT_FOUND") {
      console.log();
      if (status.status === "SUCCESS") {
        const retVal = status.returnValue;
        console.log("\n🎉 SUCCESS! Blind Oracle On-Chain Verified!");
        console.log("Contract:", contractStrKey);
        console.log("Result:", retVal);
        console.log("TX:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
      } else {
        console.log("❌ Failed:", JSON.stringify(status, null, 2));
      }
      break;
    }
  }
}

main().catch(console.error);
