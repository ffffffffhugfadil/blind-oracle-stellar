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

const vk = JSON.parse(readFileSync("circuits/verification_key.json", "utf8"));
const parts = [];

parts.push(encodeG1(vk.vk_alpha_1));
parts.push(encodeG2(vk.vk_beta_2));
parts.push(encodeG2(vk.vk_gamma_2));
parts.push(encodeG2(vk.vk_delta_2));

const ic = vk.IC;
const icLenBuf = Buffer.alloc(4);
icLenBuf.writeUInt32BE(ic.length);
parts.push(icLenBuf);
for (const pt of ic) parts.push(encodeG1(pt));

const encoded = Buffer.concat(parts);
console.log("VK size:", encoded.length, "bytes (expected 772):", encoded.length === 772 ? "✅" : "❌");
writeFileSync("circuits/vk_binary.bin", encoded);
console.log("Saved circuits/vk_binary.bin");
