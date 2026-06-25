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

// snarkjs G2 format: [[x1,x0],[y1,y0]] — swap each pair!
function encodeG2(point) {
  return Buffer.concat([
    fieldToBuf(point[0][1]),  // x0 (real)
    fieldToBuf(point[0][0]),  // x1 (imaginary)
    fieldToBuf(point[1][1]),  // y0 (real)
    fieldToBuf(point[1][0]),  // y1 (imaginary)
  ]);
}

const proof = JSON.parse(readFileSync("circuits/proof.json", "utf8"));
const proofBuf = Buffer.concat([
  encodeG1(proof.pi_a),
  encodeG2(proof.pi_b),
  encodeG1(proof.pi_c),
]);
console.log("Proof size:", proofBuf.length, "bytes (expected 256):", proofBuf.length === 256 ? "✅" : "❌");
writeFileSync("circuits/proof.bin", proofBuf);

const pub = JSON.parse(readFileSync("circuits/public.json", "utf8"));
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(pub.length);
const pubBuf = Buffer.concat([lenBuf, ...pub.map(fieldToBuf)]);
console.log("Public size:", pubBuf.length, "bytes (expected 132):", pubBuf.length === 132 ? "✅" : "❌");
writeFileSync("circuits/public.bin", pubBuf);
