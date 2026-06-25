import { Keypair, Networks, rpc as SorobanRpc, TransactionBuilder, BASE_FEE, Operation, xdr, Address } from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync } from "fs";
import crypto from "crypto";

const SECRET = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const WASM_PATH = "target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm";
const RPC_URL = "https://soroban-testnet.stellar.org";

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const keypair = Keypair.fromSecret(SECRET);

// VK dari circuits
const vkHex = readFileSync("circuits/verification_key.json", "utf8").trim();
const vkBytes = Buffer.from(vkHex, "hex");

async function deploy() {
  console.log("=== Deploying Contract ===");
  
  const account = await rpc.getAccount(keypair.publicKey());
  console.log("Account:", keypair.publicKey());
  console.log("Balance:", account.balance);

  // 1. Upload WASM
  const wasm = readFileSync(WASM_PATH);
  console.log("WASM size:", wasm.length, "bytes");
  const wasmHash = crypto.createHash("sha256").update(wasm).digest();
  console.log("WASM hash:", wasmHash.toString("hex"));

  // 2. Deploy contract
  const salt = crypto.randomBytes(32);
  const address = Address.fromString(keypair.publicKey());

  // Buat contract menggunakan xdr
  const hostFunction = xdr.HostFunction.createContractV2({
    contractIdPreimage: xdr.ContractIdPreimage.fromAddress({
      address: address.toScAddress(),
      salt: salt,
    }),
    executable: xdr.ContractExecutable.wasm(wasmHash),
    constructorArgs: [
      xdr.ScVal.scvBytes(vkBytes),
    ],
  });

  const auth = [];

  const operation = xdr.Operation.invokeHostFunction({
    hostFunction: hostFunction,
    auth: auth,
  });

  const tx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  console.log("Deploying contract...");
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
    console.log("\n✅ Contract deployed!");
    console.log("Contract ID:", status.returnValue);
    console.log("Explorer:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
  } else {
    console.log("❌ Failed:", status);
  }
}

deploy().catch(console.error);
