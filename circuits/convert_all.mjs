import { readFileSync, writeFileSync } from "fs";

function fieldToBytes32(decStr) {
  const hex = BigInt(decStr).toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function g1ToBytes(point) {
  return Buffer.concat([fieldToBytes32(point[0]), fieldToBytes32(point[1])]);
}

function g2ToBytes(point) {
  return Buffer.concat([
    fieldToBytes32(point[0][1]),
    fieldToBytes32(point[0][0]),
    fieldToBytes32(point[1][1]),
    fieldToBytes32(point[1][0]),
  ]);
}

function convertProof(proofFile, pubFile, outPrefix) {
  const proof = JSON.parse(readFileSync(proofFile, "utf8"));
  const pub   = JSON.parse(readFileSync(pubFile, "utf8"));

  const proofBuf = Buffer.concat([g1ToBytes(proof.pi_a), g2ToBytes(proof.pi_b), g1ToBytes(proof.pi_c)]);
  writeFileSync(outPrefix + "_proof.hex", proofBuf.toString("hex"));

  const sigCount = Buffer.alloc(4);
  sigCount.writeUInt32BE(pub.length);
  const pubBuf = Buffer.concat([sigCount, ...pub.map(s => fieldToBytes32(s))]);
  writeFileSync(outPrefix + "_public.hex", pubBuf.toString("hex"));

  console.log(outPrefix + " → proof=" + proofBuf.length + "B  public=" + pubBuf.length + "B  result=" + pub[1]);
}

convertProof("proof_insurance.json",  "public_insurance.json",  "insurance");
convertProof("proof_compliance.json", "public_compliance.json", "compliance");
convertProof("proof_defi.json",       "public_defi.json",       "defi");
console.log("Done — 3 proofs converted");
