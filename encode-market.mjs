import { readFileSync, writeFileSync } from "fs";

function fieldToBuf(decStr) {
  let b = BigInt(decStr);
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) { buf[i] = Number(b & 0xFFn); b >>= 8n; }
  return buf;
}
function encodeG1(p) { return Buffer.concat([fieldToBuf(p[0]), fieldToBuf(p[1])]); }
function encodeG2(p) {
  return Buffer.concat([
    fieldToBuf(p[0][1]), fieldToBuf(p[0][0]),
    fieldToBuf(p[1][1]), fieldToBuf(p[1][0]),
  ]);
}

for (const name of ["btc_yes", "btc_no", "eth_yes"]) {
  const proof = JSON.parse(readFileSync(`circuits/proof_${name}.json`, "utf8"));
  const pub   = JSON.parse(readFileSync(`circuits/public_${name}.json`, "utf8"));

  const proofBuf = Buffer.concat([encodeG1(proof.pi_a), encodeG2(proof.pi_b), encodeG1(proof.pi_c)]);
  writeFileSync(`circuits/proof_${name}.bin`, proofBuf);

  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(pub.length);
  const pubBuf = Buffer.concat([lenBuf, ...pub.map(fieldToBuf)]);
  writeFileSync(`circuits/public_${name}.bin`, pubBuf);

  console.log(`✅ ${name}: proof=${proofBuf.length}B public=${pubBuf.length}B in_range=${pub[1]}`);
}
