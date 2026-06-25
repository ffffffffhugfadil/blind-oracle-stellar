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

const vk = JSON.parse(readFileSync("circuits/verification_key_v2.json", "utf8"));
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
const expected = 64 + 128 + 128 + 128 + 4 + (ic.length * 64);
console.log("IC count:", ic.length);
console.log("VK size:", encoded.length, "bytes (expected", expected + "):", encoded.length === expected ? "✅" : "❌");
writeFileSync("circuits/vk_v2_binary.bin", encoded);
console.log("Saved circuits/vk_v2_binary.bin");
