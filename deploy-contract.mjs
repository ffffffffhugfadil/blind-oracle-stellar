import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation, nativeToScVal, xdr, Address } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { randomBytes } from "crypto";
import fs from "fs";

const rpc = new Server("https://soroban-testnet.stellar.org");
const keypair = Keypair.fromSecret("SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA");
const wasm = fs.readFileSync("target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm");
const vkHex = fs.readFileSync("circuits/vk_regen.hex", "utf8").trim();
const vkBytes = Buffer.from(vkHex, "hex");

async function deploy() {
  console.log("=== Deploying New Contract ===");
  console.log("WASM size:", wasm.length, "bytes");
  console.log("VK length:", vkBytes.length, "bytes");
  
  const account = await rpc.getAccount(keypair.publicKey());
  console.log("Account:", keypair.publicKey());

  // 1. Upload WASM
  console.log("Uploading WASM...");
  const uploadTx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.uploadContractWasm({ wasm })
    )
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
    console.log("❌ WASM upload failed:", uploadStatus);
    return;
  }

  const wasmHash = uploadStatus.returnValue;
  console.log("✅ WASM uploaded, hash:", wasmHash);

  // 2. Create contract dengan constructor
  console.log("Creating contract with VK...");
  
  const salt = randomBytes(32);
  
  // Gunakan Address untuk membuat contract ID
  const address = Address.fromString(keypair.publicKey());
  
  const createOp = xdr.Operation.invokeHostFunction({
    hostFunction: xdr.HostFunction.createContractV2({
      contractIdPreimage: xdr.ContractIdPreimage.fromAddress({
        address: address.toScAddress(),
        salt: salt,
      }),
      executable: xdr.ContractExecutable.wasm(wasmHash),
      constructorArgs: [
        nativeToScVal(vkBytes, { type: "bytes" })
      ],
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

  const preparedCreate = await rpc.prepareTransaction(tx);
  preparedCreate.sign(keypair);
  const createResult = await rpc.sendTransaction(preparedCreate);
  console.log("Create TX:", createResult.hash);

  let createStatus;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    createStatus = await rpc.getTransaction(createResult.hash);
    if (createStatus.status !== "NOT_FOUND") break;
  }

  if (createStatus?.status === "SUCCESS") {
    console.log("\n✅ Contract created successfully!");
    console.log("Contract ID:", createStatus.returnValue);
    console.log("Explorer:", `https://stellar.expert/explorer/testnet/tx/${createResult.hash}`);
  } else {
    console.log("❌ Create failed:", createStatus);
  }
}

deploy().catch(console.error);
