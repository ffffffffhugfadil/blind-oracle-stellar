import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, StrKey, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL      = "https://soroban-testnet.stellar.org";
const SECRET       = process.env.ALICE_SECRET;
const CONTRACT_V3  = "CD5GAIOMQVHYJ6ZBTINEARM4PRW65I5OI2NTLVBN4FGRX5SQFTAC5Q3N";

async function verify(label, proofFile, pubFile) {
  const keypair = Keypair.fromSecret(SECRET);
  const server  = new rpc.Server(RPC_URL, { allowHttp: false });

  const proofBytes = readFileSync(proofFile);
  const pubBytes   = readFileSync(pubFile);

  console.log(`\n--- ${label} ---`);
  console.log("Proof:", proofBytes.length, "bytes | Public:", pubBytes.length, "bytes");

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

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await server.getTransaction(result.hash);
    process.stdout.write(`\rPolling [${i+1}]: ${status.status}   `);
    if (status.status !== "NOT_FOUND") {
      console.log();
      const ok = status.status === "SUCCESS";
      console.log(ok ? "✅ VERIFIED!" : "❌ FAILED");
      console.log("TX:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
      return ok;
    }
  }
}

// Test 1: credit score 750, range 600-850 → should be TRUE
await verify(
  "Credit Score 750 in range [600-850]",
  "circuits/proof_v2.bin",
  "circuits/public_v2.bin"
);
