#!/usr/bin/env bash
# LeanToken Bash/Zsh Integration Hook (Linux, macOS, Git Bash/WSL on Windows)
# Activate from the repository root:
# source ./src/shell/hooks.sh

# Resolve this file's directory in both bash and zsh
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  __LEAN_HOOK_FILE="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  __LEAN_HOOK_FILE="${(%):-%x}"
else
  __LEAN_HOOK_FILE="$0"
fi
__LEAN_JS="$(cd "$(dirname "$__LEAN_HOOK_FILE")/../.." && pwd)/bin/lean.js"
unset __LEAN_HOOK_FILE

__lean() { node "$__LEAN_JS" "$@"; }

git() {
  case "$1" in
    status|st|diff|log) __lean prune git "$@" ;;
    *) command git "$@" ;;
  esac
}

pytest() {
  __lean prune pytest "$@"
}

echo "⚡ LeanToken shell hooks active (zero-latency command pruning enabled)"
