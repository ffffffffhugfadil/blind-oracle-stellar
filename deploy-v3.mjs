import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, Address, StrKey, xdr, hash,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL = "https://soroban-testnet.stellar.org";
const SECRET  = process.env.ALICE_SECRET;

async function deploy() {
  console.log("=== Deploy Contract V3 (Public Range Proof) ===");

  const keypair = Keypair.fromSecret(SECRET);
  const server  = new rpc.Server(RPC_URL, { allowHttp: false });

  const wasmBytes = readFileSync(
    "target/wasm32v1-none/release/soroban_groth16_verifier_contract.wasm"
  );
  const wasmHash = hash(wasmBytes);
  console.log("WASM hash:", wasmHash.toString("hex"));

  const vkBytes = readFileSync("circuits/vk_v2_binary.bin");
  console.log("VK size:", vkBytes.length, "bytes");

  // 1. Upload WASM
  console.log("\nUploading WASM...");
  const account = await server.getAccount(keypair.publicKey());
  const uploadTx = new TransactionBuilder(account, {
    fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.uploadContractWasm({ wasm: wasmBytes }))
    .setTimeout(300).build();

  const prepUpload = await server.prepareTransaction(uploadTx);
  prepUpload.sign(keypair);
  const uploadRes = await server.sendTransaction(prepUpload);
  await pollTx(server, uploadRes.hash, "Upload");

  // 2. Deploy
  console.log("\nDeploying...");
  const account2 = await server.getAccount(keypair.publicKey());
  const deployTx = new TransactionBuilder(account2, {
    fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.createCustomContract({
      address: new Address(keypair.publicKey()),
      wasmHash: wasmHash,
      salt: Buffer.alloc(32, 2), // salt=1 untuk V3
    }))
    .setTimeout(300).build();

  const prepDeploy = await server.prepareTransaction(deployTx);
  prepDeploy.sign(keypair);
  const deployRes = await server.sendTransaction(prepDeploy);
  const deployStatus = await pollTx(server, deployRes.hash, "Deploy");

  const contractId = deployStatus.returnValue.address().contractId();
  const contractStrKey = StrKey.encodeContract(contractId);
  console.log("\n✅ Contract V3 deployed!");
  console.log("Contract ID:", contractStrKey);

  // 3. Set VK
  console.log("\nSetting VK v2...");
  const account3 = await server.getAccount(keypair.publicKey());
  const setVkTx = new TransactionBuilder(account3, {
    fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: contractStrKey,
      function: "set_vk",
      args: [xdr.ScVal.scvBytes(vkBytes)],
    }))
    .setTimeout(300).build();

  const prepSetVk = await server.prepareTransaction(setVkTx);
  prepSetVk.sign(keypair);
  const setVkRes = await server.sendTransaction(prepSetVk);
  await pollTx(server, setVkRes.hash, "set_vk");

  console.log("\n=== SUMMARY ===");
  console.log("Contract V3:", contractStrKey);
  console.log("VK: 836 bytes (5 public signals: commitment, in_range, nullifier, range_min, range_max)");
}

async function pollTx(server, txHash, label) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await server.getTransaction(txHash);
    console.log(`[${label}] Polling [${i+1}]:`, status.status);
    if (status.status !== "NOT_FOUND") return status;
  }
  return null;
}

deploy().catch(console.error);
