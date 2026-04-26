#!/usr/bin/env bash
# Pre-filming workflow runner for the Home Depot patio shoot.
# Chains prescore → audit and prints a reminder about the manual fix loop.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

SHOTLIST="$SCRIPT_DIR/shotlists/patio.txt"
OUTPUT_DIR="$SCRIPT_DIR/output"
CSV="$OUTPUT_DIR/patio_scores.csv"

mkdir -p "$OUTPUT_DIR"

cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════════════════════"
echo "  PATIO SHOOT — PRESCORE"
echo "═══════════════════════════════════════════════════════════════════════"
node backend/scripts/prescore.js "$SHOTLIST" "$CSV"

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  PATIO SHOOT — AUDIT"
echo "═══════════════════════════════════════════════════════════════════════"
node backend/scripts/audit_scores.js "$CSV"

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════════"
echo "Review patio_audit.txt. Add any FLAG_LOW calibration entries to"
echo "calibration.js, push, clear cache with"
echo "  curl https://partiqule-production.up.railway.app/cache-clear"
echo "then rerun this script before leaving."
