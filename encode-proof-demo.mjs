import { readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));

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

const proof = JSON.parse(readFileSync(`${DIR}/circuits/demo_proof.json`, "utf8"));
const pub   = JSON.parse(readFileSync(`${DIR}/circuits/demo_public.json`, "utf8"));

const proofBuf = Buffer.concat([encodeG1(proof.pi_a), encodeG2(proof.pi_b), encodeG1(proof.pi_c)]);
writeFileSync(`${DIR}/circuits/demo_proof.bin`, proofBuf);

const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(pub.length);
const pubBuf = Buffer.concat([lenBuf, ...pub.map(fieldToBuf)]);
writeFileSync(`${DIR}/circuits/demo_public.bin`, pubBuf);
