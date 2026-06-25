import { readFileSync, writeFileSync } from "fs";

function fieldToBuf(decStr) {
  let b = BigInt(decStr);
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(b & 0xFFn);
    b >>= 8n;
  }
  return buf;
}

function encodeG1(point) {
  return Buffer.concat([fieldToBuf(point[0]), fieldToBuf(point[1])]);
}

function encodeG2(point) {
  return Buffer.concat([
    fieldToBuf(point[0][1]),
    fieldToBuf(point[0][0]),
    fieldToBuf(point[1][1]),
    fieldToBuf(point[1][0]),
  ]);
}

// Proof
const proof = JSON.parse(readFileSync("circuits/proof_v2.json", "utf8"));
const proofBuf = Buffer.concat([
  encodeG1(proof.pi_a),
  encodeG2(proof.pi_b),
  encodeG1(proof.pi_c),
]);
console.log("Proof size:", proofBuf.length, "bytes (expected 256):", proofBuf.length === 256 ? "✅" : "❌");
writeFileSync("circuits/proof_v2.bin", proofBuf);

// Public signals: [5 signals] commitment, in_range, nullifier, range_min, range_max
const pub = JSON.parse(readFileSync("circuits/public_v2.json", "utf8"));
console.log("Public signals:", pub);
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(pub.length);
const pubBuf = Buffer.concat([lenBuf, ...pub.map(fieldToBuf)]);
const expectedPub = 4 + pub.length * 32;
console.log("Public size:", pubBuf.length, "bytes (expected", expectedPub + "):", pubBuf.length === expectedPub ? "✅" : "❌");
writeFileSync("circuits/public_v2.bin", pubBuf);
