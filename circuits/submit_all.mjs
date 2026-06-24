import { Keypair, Networks, rpc as SorobanRpc, TransactionBuilder, Operation, xdr } from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const SECRET      = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const CONTRACT_ID = "CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO";
const RPC_URL     = "https://soroban-testnet.stellar.org";
const CIRCUITS    = "/Users/mac/Documents/blind-oracle-stellar/circuits";

const rpc     = new SorobanRpc.Server(RPC_URL);
const keypair = Keypair.fromSecret(SECRET);

function hexToScBytes(path) {
  return xdr.ScVal.scvBytes(Buffer.from(readFileSync(path, "utf8").trim(), "hex"));
}

async function verify(label, proofHex, pubHex) {
  console.log("\n[" + label + "] Submitting...");
  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: "5000000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: CONTRACT_ID,
      function: "verify",
      args: [hexToScBytes(proofHex), hexToScBytes(pubHex)],
    }))
    .setTimeout(60)
    .build();

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);
  const sent = await rpc.sendTransaction(prepared);

  let status;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    status = await rpc.getTransaction(sent.hash);
    process.stdout.write("\r  Polling [" + (i+1) + "]: " + status.status + "   ");
    if (status.status !== "NOT_FOUND") break;
  }
  console.log();

  if (status.status === "SUCCESS") {
    console.log("  SUCCESS — https://stellar.expert/explorer/testnet/tx/" + sent.hash);
  } else {
    console.log("  FAILED — " + sent.hash);
    console.log(JSON.stringify(status.resultXdr, null, 2));
  }
  return sent.hash;
}

console.log("=== Blind Oracle — 3 Use Cases On-Chain ===");

const r1 = await verify(
  "INSURANCE  rainfall 12 < 25mm",
  CIRCUITS + "/insurance_proof.hex",
  CIRCUITS + "/insurance_public.hex"
);

await new Promise(r => setTimeout(r, 6000));

const r2 = await verify(
  "COMPLIANCE amount 4999 < 5000",
  CIRCUITS + "/compliance_proof.hex",
  CIRCUITS + "/compliance_public.hex"
);

await new Promise(r => setTimeout(r, 6000));

const r3 = await verify(
  "DEFI       price 67420 > 65000",
  CIRCUITS + "/defi_proof.hex",
  CIRCUITS + "/defi_public.hex"
);

console.log("\n=== SUMMARY ===");
console.log("Insurance  TX: https://stellar.expert/explorer/testnet/tx/" + r1);
console.log("Compliance TX: https://stellar.expert/explorer/testnet/tx/" + r2);
console.log("DeFi       TX: https://stellar.expert/explorer/testnet/tx/" + r3);
console.log("\nOne circuit. One verifier. Three industries. Contract never saw the data.");
