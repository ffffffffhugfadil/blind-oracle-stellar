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
  process.stdout.write("\n[" + label + "] Submitting...\n");
  const account = await rpc.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: "5000000", networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: CONTRACT_ID, function: "verify",
      args: [hexToScBytes(proofHex), hexToScBytes(pubHex)],
    }))
    .setTimeout(60).build();
  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);
  const sent = await rpc.sendTransaction(prepared);
  let status;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    status = await rpc.getTransaction(sent.hash);
    process.stdout.write("  Polling [" + (i+1) + "]: " + status.status + "\n");
    if (status.status !== "NOT_FOUND") break;
  }
  if (status.status === "SUCCESS") {
    process.stdout.write("  SUCCESS: https://stellar.expert/explorer/testnet/tx/" + sent.hash + "\n");
  } else {
    process.stdout.write("  FAILED: " + sent.hash + "\n");
  }
  return sent.hash;
}

const r1 = await verify("INSURANCE  rainfall 12 < 25mm",  CIRCUITS + "/insurance_proof.hex",  CIRCUITS + "/insurance_public.hex");
await new Promise(r => setTimeout(r, 6000));
const r2 = await verify("COMPLIANCE amount 4999 < 5000",  CIRCUITS + "/compliance_proof.hex", CIRCUITS + "/compliance_public.hex");
await new Promise(r => setTimeout(r, 6000));
const r3 = await verify("DEFI       price 67420 > 65000", CIRCUITS + "/defi_proof.hex",       CIRCUITS + "/defi_public.hex");

process.stdout.write("\n=== SUMMARY ===\n");
process.stdout.write("Insurance  TX: https://stellar.expert/explorer/testnet/tx/" + r1 + "\n");
process.stdout.write("Compliance TX: https://stellar.expert/explorer/testnet/tx/" + r2 + "\n");
process.stdout.write("DeFi       TX: https://stellar.expert/explorer/testnet/tx/" + r3 + "\n");
process.stdout.write("\nOne circuit. One verifier. Three industries. Contract never saw the data.\n");
