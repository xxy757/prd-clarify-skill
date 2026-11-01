#!/usr/bin/env bash
# 检查脚本自测：good.md 必须通过，bad.md 必须失败
set -u
cd "$(dirname "$0")"
S=../prd-clarify/scripts/check-prd.mjs
node "$S" good.md >/dev/null || { echo "失败：good.md 应通过"; exit 1; }
node "$S" bad.md >/dev/null && { echo "失败：bad.md 应不通过"; exit 1; }
echo "自测通过"
