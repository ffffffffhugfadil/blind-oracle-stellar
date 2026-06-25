import { Keypair, Networks, rpc as SorobanRpc, TransactionBuilder, Operation, xdr, Address } from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import crypto from "crypto";

const SECRET = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";
const RPC_URL = "https://soroban-testnet.stellar.org";

const rpc = new SorobanRpc.Server(RPC_URL);
const keypair = Keypair.fromSecret(SECRET);

// VK
const vkHex = readFileSync("circuits/verification_key.json", "utf8").trim();
const vkBytes = Buffer.from(vkHex, "hex");

// WASM
const wasm = readFileSync("target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm");
const wasmHash = crypto.createHash("sha256").update(wasm).digest();

async function deploy() {
  console.log("=== Deploy Contract ===");
  console.log("WASM hash:", wasmHash.toString("hex"));
  console.log("VK length:", vkBytes.length, "bytes");
  
  const account = await rpc.getAccount(keypair.publicKey());
  console.log("Account:", keypair.publicKey());

  // Upload WASM
  console.log("Uploading WASM...");
  const uploadTx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.uploadContractWasm({ wasm }))
    .setTimeout(30)
    .build();

  const preparedUpload = await rpc.prepareTransaction(uploadTx);
  preparedUpload.sign(keypair);
  const uploadResult = await rpc.sendTransaction(preparedUpload);
  console.log("Upload TX:", uploadResult.hash);

  let uploadStatus;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    uploadStatus = await rpc.getTransaction(uploadResult.hash);
    if (uploadStatus.status !== "NOT_FOUND") break;
  }

  if (uploadStatus?.status !== "SUCCESS") {
    console.log("❌ WASM upload failed");
    return;
  }

  console.log("✅ WASM uploaded");

  // Create contract menggunakan Address
  console.log("Creating contract...");
  const salt = crypto.randomBytes(32);
  const address = Address.fromString(keypair.publicKey());
  
  const createOp = xdr.Operation.invokeHostFunction({
    hostFunction: xdr.HostFunction.createContractV2({
      contractIdPreimage: xdr.ContractIdPreimage.fromAddress({
        address: address.toScAddress(),
        salt: salt,
      }),
      executable: xdr.ContractExecutable.wasm(wasmHash),
      constructorArgs: [xdr.ScVal.scvBytes(vkBytes)],
    }),
    auth: [],
  });

  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(createOp)
    .setTimeout(30)
    .build();

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await rpc.sendTransaction(prepared);
  console.log("Create TX:", result.hash);

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
    console.log("TX:", `https://stellar.expert/explorer/testnet/tx/${result.hash}`);
  } else {
    console.log("❌ Failed:", status);
  }
}

deploy().catch(console.error);
