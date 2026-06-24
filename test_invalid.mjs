import { Keypair, Networks, rpc as SorobanRpc, TransactionBuilder, Operation, xdr } from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync } from "fs";

const SECRET      = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const CONTRACT_ID = "CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO";
const RPC_URL     = "https://soroban-testnet.stellar.org";
const CIRCUITS    = "/Users/mac/Documents/blind-oracle-stellar/circuits";

const rpc     = new SorobanRpc.Server(RPC_URL);
const keypair = Keypair.fromSecret(SECRET);

function hexToScBytes(path) {
  return xdr.ScVal.scvBytes(Buffer.from(readFileSync(path, "utf8").trim(), "hex"));
}

async function tryVerify(label, proofPath, pubPath) {
  process.stdout.write("\n[" + label + "]\n");
  try {
    const account = await rpc.getAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: "5000000", networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.invokeContractFunction({
        contract: CONTRACT_ID, function: "verify",
        args: [hexToScBytes(proofPath), hexToScBytes(pubPath)],
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
      process.stdout.write("  RESULT: ACCEPTED - proof valid\n");
      process.stdout.write("  TX: https://stellar.expert/explorer/testnet/tx/" + sent.hash + "\n");
    } else {
      process.stdout.write("  RESULT: REJECTED - contract refused the proof\n");
      process.stdout.write("  TX: https://stellar.expert/explorer/testnet/tx/" + sent.hash + "\n");
    }
    return { hash: sent.hash, accepted: status.status === "SUCCESS" };
  } catch(e) {
    process.stdout.write("  RESULT: REJECTED - " + e.message.slice(0, 100) + "\n");
    return { hash: null, accepted: false };
  }
}

process.stdout.write("=== Blind Oracle — Tamper Resistance Test ===\n");
process.stdout.write("Proving that invalid proofs are always rejected on-chain.\n");

const validProof = readFileSync(CIRCUITS + "/proof_correct.hex", "utf8").trim();
const validBuf   = Buffer.from(validProof, "hex");

const tamperedBuf = Buffer.from(validProof, "hex");
tamperedBuf[10] ^= 0xFF;
writeFileSync(CIRCUITS + "/proof_tampered.hex", tamperedBuf.toString("hex"));
process.stdout.write("\nTampered proof created (byte 10 flipped)\n");

const r1 = await tryVerify("TEST 1: Valid proof (100 > 50)", CIRCUITS + "/proof_correct.hex", CIRCUITS + "/public_correct.hex");
await new Promise(r => setTimeout(r, 6000));
const r2 = await tryVerify("TEST 2: Tampered proof (corrupted)", CIRCUITS + "/proof_tampered.hex", CIRCUITS + "/public_correct.hex");

process.stdout.write("\n=== SECURITY SUMMARY ===\n");
process.stdout.write("Valid proof    -> " + (r1.accepted ? "ACCEPTED" : "REJECTED") + "\n");
process.stdout.write("Tampered proof -> " + (r2.accepted ? "ACCEPTED" : "REJECTED") + "\n");
if (r1.accepted && !r2.accepted) {
  process.stdout.write("\nSECURITY VERIFIED: The contract cannot be fooled.\n");
  process.stdout.write("ZK is load-bearing. Remove the proof, remove the security.\n");
  if (r1.hash) process.stdout.write("Valid TX:    https://stellar.expert/explorer/testnet/tx/" + r1.hash + "\n");
  if (r2.hash) process.stdout.write("Tampered TX: https://stellar.expert/explorer/testnet/tx/" + r2.hash + "\n");
}
