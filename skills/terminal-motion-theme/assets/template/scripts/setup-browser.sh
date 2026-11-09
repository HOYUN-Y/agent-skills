#!/bin/sh
# Remotion이 받은 Chrome Headless Shell을 ~/Library/Caches/terminal-motion으로 복사한다.
# (~/Documents 같은 보호 폴더 안의 Chrome이 icudtl.dat 접근 실패로 렌더에 실패했던 문제 우회, macOS arm64 기준)
set -e
SRC="node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64"
DEST="$HOME/Library/Caches/terminal-motion/chrome-headless-shell-mac-arm64"
if [ ! -x "$SRC/chrome-headless-shell" ]; then
  echo "Chrome Headless Shell이 없습니다. 먼저 'npx remotion browser ensure'를 실행하세요." >&2
  exit 1
fi
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "복사 완료: $DEST"
