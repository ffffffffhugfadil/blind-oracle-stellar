import { readFileSync, writeFileSync } from "fs";

// snarkjs BN254 field element → 32 bytes big-endian
function fieldToBytes32(decStr) {
  const hex = BigInt(decStr).toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

// G1 point: [x, y] → 64 bytes
function g1ToBytes(point) {
  const x = fieldToBytes32(point[0]);
  const y = fieldToBytes32(point[1]);
  return Buffer.concat([x, y]);
}

// G2 point: [[x1,x0],[y1,y0]] → 128 bytes
// Soroban BN254 expects: x0, x1, y0, y1 (each 32 bytes)
// snarkjs stores: [[x1,x0],[y1,y0]]
// So: index [0][1]=x0, [0][0]=x1, [1][1]=y0, [1][0]=y1
function g2ToBytes(point) {
  const x0 = fieldToBytes32(point[0][1]); // inner index 1 = x0
  const x1 = fieldToBytes32(point[0][0]); // inner index 0 = x1
  const y0 = fieldToBytes32(point[1][1]); // inner index 1 = y0
  const y1 = fieldToBytes32(point[1][0]); // inner index 0 = y1
  return Buffer.concat([x0, x1, y0, y1]);
}

// ── Convert VK ────────────────────────────────────────────
const vk = JSON.parse(readFileSync("verification_key.json", "utf8"));

const alpha  = g1ToBytes(vk.vk_alpha_1);
const beta   = g2ToBytes(vk.vk_beta_2);
const gamma  = g2ToBytes(vk.vk_gamma_2);
const delta  = g2ToBytes(vk.vk_delta_2);

// IC array — length prefix (4 bytes BE) + each G1
const icLen  = Buffer.alloc(4);
icLen.writeUInt32BE(vk.IC.length);
const icPoints = vk.IC.map(p => g1ToBytes(p));

const vkBuf = Buffer.concat([alpha, beta, gamma, delta, icLen, ...icPoints]);
writeFileSync("vk_correct.hex", vkBuf.toString("hex"));
console.log("VK size:", vkBuf.length, "bytes");
console.log("IC count:", vk.IC.length);
console.log("VK written → vk_correct.hex");

// ── Convert Proof ─────────────────────────────────────────
const proof = JSON.parse(readFileSync("proof.json", "utf8"));

const pi_a = g1ToBytes(proof.pi_a);
const pi_b = g2ToBytes(proof.pi_b);
const pi_c = g1ToBytes(proof.pi_c);

const proofBuf = Buffer.concat([pi_a, pi_b, pi_c]);
writeFileSync("proof_correct.hex", proofBuf.toString("hex"));
console.log("\nProof size:", proofBuf.length, "bytes");
console.log("Proof written → proof_correct.hex");

// ── Convert Public Signals ─────────────────────────────────
const pub = JSON.parse(readFileSync("public.json", "utf8"));

// Format: 4 bytes length (BE) + each signal 32 bytes BE
const sigCount = Buffer.alloc(4);
sigCount.writeUInt32BE(pub.length);
const sigBufs = pub.map(s => fieldToBytes32(s));

const pubBuf = Buffer.concat([sigCount, ...sigBufs]);
writeFileSync("public_correct.hex", pubBuf.toString("hex"));
console.log("\nPublic signals:", pub);
console.log("Public written → public_correct.hex");

// ── Summary ───────────────────────────────────────────────
console.log("\n=== READY TO SUBMIT ===");
console.log("vk_correct.hex    →", vkBuf.length, "bytes");
console.log("proof_correct.hex →", proofBuf.length, "bytes");
console.log("public_correct.hex→", pubBuf.length, "bytes");
