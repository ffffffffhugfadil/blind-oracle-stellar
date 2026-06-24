import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const DIR      = dirname(fileURLToPath(import.meta.url));
const SECRET   = process.env.ALICE_SECRET;
const CONTRACT = "CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH";

const keypair = Keypair.fromSecret(SECRET);
const server  = new rpc.Server("https://soroban-testnet.stellar.org", { allowHttp: false });

const proofBytes = readFileSync(`${DIR}/circuits/demo_proof.bin`);
const pubBytes   = readFileSync(`${DIR}/circuits/demo_public.bin`);

const account = await server.getAccount(keypair.publicKey());
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.invokeContractFunction({
    contract: CONTRACT,
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
  if (status.status !== "NOT_FOUND") {
    const inRange = status.returnValue?._value;
    console.log(`  in_range: ${inRange}`);
    console.log(`  TX: https://stellar.expert/explorer/testnet/tx/${result.hash}`);
    break;
  }
}
