import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL     = "https://soroban-testnet.stellar.org";
const SECRET      = process.env.ALICE_SECRET;
const CONTRACT_V3 = "CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH";

async function main() {
  const keypair = Keypair.fromSecret(SECRET);
  const server  = new rpc.Server(RPC_URL, { allowHttp: false });

  const proofBytes = readFileSync("circuits/proof_v2.bin");
  const pubBytes   = readFileSync("circuits/public_v2.bin");

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

  const sim = await server.simulateTransaction(tx);

  // transactionData adalah SorobanDataBuilder object
  const td = sim.transactionData;
  console.log("transactionData keys:", Object.keys(td));

  // Coba build untuk dapat XDR lalu parse
  const built = td.build();
  console.log("\nbuilt type:", typeof built);
  console.log("built:", JSON.stringify(built, null, 2));

  console.log("\nminResourceFee:", sim.minResourceFee, "stroops =", (sim.minResourceFee / 10_000_000).toFixed(7), "XLM");

  // Coba akses resources langsung
  try {
    const resources = built.resources();
    console.log("\n=== Resources ===");
    console.log("instructions:", resources.instructions().toString());
    console.log("readBytes:", resources.readBytes().toString());
    console.log("writeBytes:", resources.writeBytes().toString());
  } catch(e) {
    console.log("resources() error:", e.message);
    // Try alternative
    console.log("\nbuilt toXDR:", built.toXDR?.("base64"));
  }
}

main().catch(console.error);
