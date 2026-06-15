#!/usr/bin/env bash
# Run the 4-layer evaluation pipeline.
# Usage:
#   CI:     bash scripts/run_evals.sh
#   Docker: docker compose -f docker-compose.share.yml exec api bash /app/scripts/run_evals.sh
#
# Exit 0 = all layers passed, Exit 1 = one or more layers failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"

# Allow skipping LLM judge (cheaper for CI pre-checks)
NO_LLM="${NO_LLM_JUDGE:-false}"
LLM_FLAG=""
if [ "$NO_LLM" = "true" ]; then
  LLM_FLAG="--no-llm"
fi

echo "========================================"
echo "  LeadGenie-AI Evaluation Pipeline"
echo "========================================"
echo ""

cd "$BACKEND_DIR"
python3 -m evals.eval_runner $LLM_FLAG

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✓ All eval layers passed — safe to deploy"
else
  echo ""
  echo "✗ Eval pipeline failed — deploy blocked"
fi

exit $EXIT_CODE
