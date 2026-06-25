import {
  Keypair,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Operation,
  Address,
  xdr,
  hash,
  Contract,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL = "https://soroban-testnet.stellar.org";
const SECRET = "SDGS4XGCJKAC73U2BW7KGVLIBBX3CB7BHTACZDNXDFFMGN6QSIV5CJHA";

async function deploy() {
  console.log("=== Deploy Contract V2 ===");

  const keypair = Keypair.fromSecret(SECRET);
  const server = new rpc.Server(RPC_URL, { allowHttp: false });

  // 1. Load WASM
  const wasmBytes = readFileSync(
    "target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm"
  );
  const wasmHash = hash(wasmBytes);
  console.log("WASM hash:", wasmHash.toString("hex"));

  // 2. Load VK
  const vkRaw = readFileSync("circuits/verification_key.json", "utf8");
  const vkBytes = Buffer.from(vkRaw.replace(/[\s\n\r"]/g, ""), "utf8");
  console.log("VK length:", vkBytes.length, "bytes");

  const account = await server.getAccount(keypair.publicKey());
  console.log("Account:", keypair.publicKey());

  // 3. Upload WASM
  console.log("\nUploading WASM...");
  const uploadTx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.uploadContractWasm({ wasm: wasmBytes }))
    .setTimeout(300)
    .build();

  const preparedUpload = await server.prepareTransaction(uploadTx);
  preparedUpload.sign(keypair);
  const uploadResult = await server.sendTransaction(preparedUpload);
  console.log("Upload TX:", uploadResult.hash);
  await pollTx(server, uploadResult.hash, "WASM Upload");

  // 4. Deploy contract tanpa constructor
  console.log("\nDeploying contract (without constructor)...");
  const account2 = await server.getAccount(keypair.publicKey());

  const deployTx = new TransactionBuilder(account2, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.createCustomContract({
        address: new Address(keypair.publicKey()),
        wasmHash: wasmHash,
        salt: Buffer.alloc(32, 0),
        constructorArgs: [],
      })
    )
    .setTimeout(300)
    .build();

  const preparedDeploy = await server.prepareTransaction(deployTx);
  preparedDeploy.sign(keypair);
  const deployResult = await server.sendTransaction(preparedDeploy);
  console.log("Deploy TX:", deployResult.hash);

  const finalStatus = await pollTx(server, deployResult.hash, "Deploy");

  if (finalStatus?.status === "SUCCESS") {
    const contractHex = finalStatus.returnValue;
    console.log("\n✅ Contract deployed!");
    console.log("Contract ID (hex):", contractHex);
    console.log("TX:", `https://stellar.expert/explorer/testnet/tx/${deployResult.hash}`);

    // Konversi hex ke Contract ID format Stellar (C...)
    const contractIdBytes = Buffer.from(contractHex, "hex");
    const contractAddress = new Address(contractIdBytes).toString();
    console.log("Contract Address (C...):", contractAddress);

    // 5. Set VK
    await initVK(server, keypair, contractAddress, vkBytes);
  } else {
    console.log("❌ Failed:", JSON.stringify(finalStatus, null, 2));
  }
}

async function initVK(server, keypair, contractAddress, vkBytes) {
  console.log("\nSetting VK...");
  console.log("Contract Address:", contractAddress);
  
  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractAddress,
        function: "set_vk",
        args: [xdr.ScVal.scvBytes(vkBytes)],
      })
    )
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);
  console.log("set_vk TX:", result.hash);

  const status = await pollTx(server, result.hash, "set_vk");
  if (status?.status === "SUCCESS") {
    console.log("✅ VK set successfully!");
  } else {
    console.log("❌ set_vk failed:", JSON.stringify(status, null, 2));
  }
}

async function pollTx(server, txHash, label) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await server.getTransaction(txHash);
    console.log(`[${label}] Polling [${i+1}]:`, status.status);
    if (status.status !== "NOT_FOUND") return status;
  }
  return null;
}

deploy().catch(console.error);
