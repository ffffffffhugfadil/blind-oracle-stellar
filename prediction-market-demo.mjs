import {
  Keypair, rpc, TransactionBuilder, BASE_FEE,
  Networks, Operation, xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const RPC_URL     = "https://soroban-testnet.stellar.org";
const SECRET      = process.env.ALICE_SECRET;
const CONTRACT_V3 = "CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH";

const MARKETS = [
  {
    id: "BTC-001",
    question: "Will BTC price be above $95,000 this epoch?",
    asset: "BTC",
    range_min: 95000,
    range_max: 200000,
    actual_price: "HIDDEN", // prover knows, nobody else does
    proof: "circuits/proof_btc_yes.bin",
    pub:   "circuits/public_btc_yes.bin",
    expected: "YES",
  },
  {
    id: "BTC-002",
    question: "Will BTC price be above $95,000 this epoch?",
    asset: "BTC",
    range_min: 95000,
    range_max: 200000,
    actual_price: "HIDDEN",
    proof: "circuits/proof_btc_no.bin",
    pub:   "circuits/public_btc_no.bin",
    expected: "NO",
  },
  {
    id: "ETH-001",
    question: "Will ETH price be between $3,500 and $5,000?",
    asset: "ETH",
    range_min: 3500,
    range_max: 5000,
    actual_price: "HIDDEN",
    proof: "circuits/proof_eth_yes.bin",
    pub:   "circuits/public_eth_yes.bin",
    expected: "YES",
  },
];

async function resolveMarket(server, keypair, market) {
  const proofBytes = readFileSync(market.proof);
  const pubBytes   = readFileSync(market.pub);

  // Read nullifier from public signals for replay protection display
  const pub = JSON.parse(readFileSync(market.pub.replace('.bin', '.json').replace('circuits/', 'circuits/public_').replace('circuits/public_public_', 'circuits/public_'), 'utf8'));

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

  // Measure resource usage
  const sim = await server.simulateTransaction(tx);
  const cpuInsns = Number(sim.transactionData.build().resources().instructions());

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await server.getTransaction(result.hash);
    if (status.status !== "NOT_FOUND") {
      const inRange = status.returnValue?._value;
      return { inRange, hash: result.hash, cpuInsns };
    }
  }
  return null;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     BLIND ORACLE — Private Prediction Market Demo        ║");
  console.log("║     ZK Range Proof on Stellar Soroban                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Contract  :", CONTRACT_V3);
  console.log("Mechanism : Groth16 (BN254) · 33.2M instructions · 0.0037 XLM/verify");
  console.log("");
  console.log("How it works:");
  console.log("  1. Price oracle holds PRIVATE price feed");
  console.log("  2. Market maker sets PUBLIC price range");
  console.log("  3. Oracle generates ZK proof off-chain");
  console.log("  4. Stellar contract verifies → market resolves");
  console.log("  5. Exact price is NEVER revealed on-chain");
  console.log("");
  console.log("─────────────────────────────────────────────────────────────");

  const keypair = Keypair.fromSecret(SECRET);
  const server  = new rpc.Server(RPC_URL, { allowHttp: false });

  const results = [];

  for (const market of MARKETS) {
    console.log(`\n📊 Market ID  : ${market.id}`);
    console.log(`   Question   : ${market.question}`);
    console.log(`   Range      : $${market.range_min.toLocaleString()} – $${market.range_max.toLocaleString()}`);
    console.log(`   Price      : ${market.actual_price} (private)`);
    console.log(`   Expected   : ${market.expected}`);
    console.log(`   Resolving...`);

    const res = await resolveMarket(server, keypair, market);

    if (!res) {
      console.log("   ❌ Timeout");
      continue;
    }

    const outcome = res.inRange ? "YES ✅" : "NO  ❌";
    const correct = (res.inRange === (market.expected === "YES"));

    console.log(`   Result     : ${outcome}`);
    console.log(`   CPU        : ${res.cpuInsns.toLocaleString()} / 100,000,000 instructions (${((res.cpuInsns/100_000_000)*100).toFixed(1)}%)`);
    console.log(`   TX         : https://stellar.expert/explorer/testnet/tx/${res.hash}`);
    console.log(`   Verified   : ${correct ? "✅ Correct" : "❌ Wrong"}`);

    results.push({ ...market, ...res, outcome, correct });
  }

  console.log("\n═════════════════════════════════════════════════════════════");
  console.log("  MARKET RESOLUTION SUMMARY");
  console.log("═════════════════════════════════════════════════════════════");
  console.log(`${"Market ID".padEnd(10)} ${"Question".padEnd(42)} ${"Result".padEnd(8)} Verified`);
  console.log("─".repeat(75));

  for (const r of results) {
    const q = r.question.substring(0, 40).padEnd(42);
    console.log(`${r.id.padEnd(10)} ${q} ${r.outcome.padEnd(8)} ${r.correct ? "✅" : "❌"}`);
  }

  console.log("");
  console.log("Key Properties:");
  console.log("  🔒 Price never revealed — only range membership proven");
  console.log("  ⚡ 33.2M CPU instructions — 2x cheaper than BLS12-381");
  console.log("  🔁 Nullifier prevents same oracle from submitting twice");
  console.log("  🌐 Fully on-chain — no trusted intermediary");
}

main().catch(console.error);
