#!/usr/bin/env bash
# LeanToken Bash/Zsh Integration Hook
# Source this file in ~/.bashrc or ~/.zshrc:
# source /path/to/leantoken/src/shell/hooks.sh

LEAN_BIN="node $(dirname "${BASH_SOURCE[0]}")/../../bin/lean.js"

git() {
  if [[ "$1" == "status" || "$1" == "st" || "$1" == "diff" || "$1" == "log" ]]; then
    $LEAN_BIN prune git "$@"
  else
    command git "$@"
  fi
}

pytest() {
  $LEAN_BIN prune pytest "$@"
}

echo "⚡ LeanToken shell hooks active (zero-latency command pruning enabled)"
