#!/bin/bash
set -e

# ============================================
#   BLIND ORACLE — Live Demo
#   Zero-Knowledge Range Proof on Stellar
# ============================================

CONTRACT="CBXMLDKAE45OIUEOODGFMKZMFE5SA3CSR7NXW7TILBUQBVHEGNCLDQVH"
DIR="$(cd "$(dirname "$0")" && pwd)"
CIRCUITS="$DIR/circuits"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║  $1${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
}

print_step() {
  echo -e "${YELLOW}▶ $1${NC}"
}

print_ok() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_fail() {
  echo -e "${RED}❌ $1${NC}"
}

# ============================================
print_header "BLIND ORACLE — Zero-Knowledge Range Proof"
echo ""
echo "  Prove data is within a range WITHOUT revealing the data."
echo "  Powered by Groth16 ZK Proof + Stellar Soroban"
echo ""
echo "  Contract: $CONTRACT"
echo ""

# Pilih skenario
echo -e "${YELLOW}Choose demo scenario:${NC}"
echo "  1) KYC Age Verification   (age=25, range 18-65)"
echo "  2) DeFi Collateral Check  (amount=15000, range 10000-50000)"
echo "  3) Credit Score Gate      (score=500, range 600-850) ← will FAIL"
echo "  4) Custom input"
echo ""
read -p "Enter choice [1-4]: " CHOICE

case $CHOICE in
  1)
    SCENARIO="KYC Age Verification"
    DATA_VALUE=25
    RANGE_MIN=18
    RANGE_MAX=65
    NONCE=$RANDOM
    ;;
  2)
    SCENARIO="DeFi Collateral Check"
    DATA_VALUE=15000
    RANGE_MIN=10000
    RANGE_MAX=50000
    NONCE=$RANDOM
    ;;
  3)
    SCENARIO="Credit Score Gate"
    DATA_VALUE=500
    RANGE_MIN=600
    RANGE_MAX=850
    NONCE=$RANDOM
    ;;
  4)
    echo ""
    read -p "  data_value : " DATA_VALUE
    read -p "  range_min  : " RANGE_MIN
    read -p "  range_max  : " RANGE_MAX
    SCENARIO="Custom ($DATA_VALUE in [$RANGE_MIN-$RANGE_MAX])"
    NONCE=$RANDOM
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
print_header "Scenario: $SCENARIO"
echo ""
echo "  Private (never leaves your machine):"
echo "    data_value : $DATA_VALUE"
echo "    nonce      : $NONCE"
echo ""
echo "  Public (verifier sets the range):"
echo "    range_min  : $RANGE_MIN"
echo "    range_max  : $RANGE_MAX"
echo ""

# Step 1: Generate input
print_step "Step 1/4: Preparing input..."
cat > "$CIRCUITS/demo_input.json" << INPUTEOF
{
  "data_value": "$DATA_VALUE",
  "nonce": "$NONCE",
  "range_min": "$RANGE_MIN",
  "range_max": "$RANGE_MAX"
}
INPUTEOF
print_ok "Input prepared"

# Step 2: Generate witness & proof
print_step "Step 2/4: Generating ZK proof (off-chain)..."
node "$CIRCUITS/blind_oracle_v2_js/generate_witness.js" \
  "$CIRCUITS/blind_oracle_v2_js/blind_oracle_v2.wasm" \
  "$CIRCUITS/demo_input.json" \
  "$CIRCUITS/demo_witness.wtns" 2>/dev/null

npx snarkjs groth16 prove \
  "$CIRCUITS/circuit_v2_final.zkey" \
  "$CIRCUITS/demo_witness.wtns" \
  "$CIRCUITS/demo_proof.json" \
  "$CIRCUITS/demo_public.json" 2>/dev/null

IN_RANGE=$(node -e "const p=JSON.parse(require('fs').readFileSync('$CIRCUITS/demo_public.json')); console.log(p[1])")
COMMITMENT=$(node -e "const p=JSON.parse(require('fs').readFileSync('$CIRCUITS/demo_public.json')); console.log(p[0])")
NULLIFIER=$(node -e "const p=JSON.parse(require('fs').readFileSync('$CIRCUITS/demo_public.json')); console.log(p[2])")

print_ok "ZK Proof generated"
echo ""
echo "  Public outputs (safe to reveal):"
echo "    commitment : ${COMMITMENT:0:32}..."
echo "    nullifier  : ${NULLIFIER:0:32}..."
echo "    in_range   : $IN_RANGE"
echo ""

# Step 3: Encode to binary
print_step "Step 3/4: Encoding proof to binary format..."
node "$DIR/encode-proof-demo.mjs" 2>/dev/null
print_ok "Encoded: proof=256B, public=164B"

# Step 4: Submit to Stellar
print_step "Step 4/4: Submitting proof to Stellar testnet..."
echo ""

RESULT=$(node --experimental-vm-modules "$DIR/verify-demo.mjs" 2>/dev/null)
echo "$RESULT"

# Parse result
if echo "$RESULT" | grep -q "in_range: true"; then
  echo ""
  print_header "RESULT: ✅ IN RANGE — Access Granted"
  echo ""
  echo -e "  ${GREEN}Data is proven to be within [$RANGE_MIN, $RANGE_MAX]${NC}"
  echo -e "  ${GREEN}without revealing the actual value.${NC}"
elif echo "$RESULT" | grep -q "in_range: false"; then
  echo ""
  print_header "RESULT: ❌ OUT OF RANGE — Access Denied"
  echo ""
  echo -e "  ${RED}Data is proven to be OUTSIDE [$RANGE_MIN, $RANGE_MAX]${NC}"
  echo -e "  ${RED}Proof is valid but range condition not met.${NC}"
else
  print_fail "Something went wrong"
  echo "$RESULT"
fi

echo ""
echo -e "  ${BLUE}Explorer: https://stellar.expert/explorer/testnet${NC}"
echo ""
