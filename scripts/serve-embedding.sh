#!/usr/bin/env bash
# Serve embedding model via vLLM (vllm-omni).
# Usage:
#   ./scripts/serve-embedding.sh [model] [port]
#   ./scripts/serve-embedding.sh                        # qwen3-embedding:0.6b on 8001
#   ./scripts/serve-embedding.sh Qwen/Qwen3-Embedding-8B 8002

set -euo pipefail

MODEL="${1:-Qwen/Qwen3-Embedding-0.6B}"
PORT="${2:-8001}"

echo "Starting vLLM embedding server..."
echo "  Model: ${MODEL}"
echo "  Port:  ${PORT}"
echo "  Task:  embed"
echo ""

exec vllm serve "${MODEL}" \
  --task embed \
  --port "${PORT}" \
  --trust-remote-code
