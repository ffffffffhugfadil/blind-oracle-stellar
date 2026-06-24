import { Keypair, Networks, rpc as SorobanRpc, TransactionBuilder, Operation, xdr } from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const SECRET      = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const CONTRACT_ID = "CDOQK7LSAPYXZ4VNP4HHZFNPW5PGVJYOUZXA7Z2ZBWTEEZHJ36HI7XOO";
const RPC_URL     = "https://soroban-testnet.stellar.org";
const CIRCUITS    = "/Users/mac/Documents/blind-oracle-stellar/circuits";

const rpc     = new SorobanRpc.Server(RPC_URL);
const keypair = Keypair.fromSecret(SECRET);

async function invokeContract(method, args, account) {
  const tx = new TransactionBuilder(account, {
    fee: "5000000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: CONTRACT_ID,
      function: method,
      args,
    }))
    .setTimeout(60)
    .build();

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await rpc.sendTransaction(prepared);

  let status;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    status = await rpc.getTransaction(result.hash);
    process.stdout.write("\r  Polling [" + (i+1) + "]: " + status.status + "   ");
    if (status.status !== "NOT_FOUND") break;
  }
  console.log();
  return { hash: result.hash, status };
}

function hexToScBytes(hexFile) {
  const hex = readFileSync(hexFile, "utf8").trim();
  const buf = Buffer.from(hex, "hex");
  return xdr.ScVal.scvBytes(buf);
}

const account = await rpc.getAccount(keypair.publicKey());

console.log("Step 1: Setting VK (vk_correct.hex)...");
const vkArg = hexToScBytes(CIRCUITS + "/vk_correct.hex");
const r1 = await invokeContract("set_vk", [vkArg], account);
console.log("set_vk:", r1.status.status);
console.log("TX:", "https://stellar.expert/explorer/testnet/tx/" + r1.hash);

if (r1.status.status !== "SUCCESS") {
  console.log("set_vk FAILED");
  console.log(JSON.stringify(r1.status.resultXdr, null, 2));
  process.exit(1);
}

await new Promise(r => setTimeout(r, 5000));
const account2 = await rpc.getAccount(keypair.publicKey());

console.log("\nStep 2: Verifying proof...");
const proofArg = hexToScBytes(CIRCUITS + "/proof_correct.hex");
const pubArg   = hexToScBytes(CIRCUITS + "/public_correct.hex");
const r2 = await invokeContract("verify", [proofArg, pubArg], account2);
console.log("verify:", r2.status.status);
console.log("TX:", "https://stellar.expert/explorer/testnet/tx/" + r2.hash);

if (r2.status.status === "SUCCESS") {
  console.log("\n SUCCESS! BLIND ORACLE ON-CHAIN VERIFIED!");
  console.log("Contract : " + CONTRACT_ID);
  console.log("Result   : data_value 100 > threshold 50 = TRUE");
  console.log("TX Hash  : " + r2.hash);
} else {
  console.log("verify FAILED");
  console.log(JSON.stringify(r2.status.resultXdr, null, 2));
}
