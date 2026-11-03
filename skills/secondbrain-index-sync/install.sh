#!/bin/sh
# Install secondbrain-index-sync for Claude Code and Codex by symlinking this folder.
# Usage: ./install.sh [vault_path]
set -e
here=$(cd "$(dirname "$0")" && pwd)
for d in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$d"
  t="$d/secondbrain-index-sync"
  if [ -e "$t" ] && [ ! -L "$t" ]; then
    echo "skip: $t exists and is not a symlink (move it away first)"; continue
  fi
  ln -sfn "$here" "$t" && echo "linked: $t -> $here"
done
if [ -n "$1" ]; then
  vault=$(cd "$1" 2>/dev/null && pwd || echo "$1")
  mkdir -p "$HOME/.config/secondbrain-index-sync"
  printf '%s\n' "$vault" > "$HOME/.config/secondbrain-index-sync/vault"
  echo "vault: $vault"
else
  echo "vault not set: ask the agent to set up the second brain, or rerun with ./install.sh <vault_path>"
fi
