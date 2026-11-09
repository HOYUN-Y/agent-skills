#!/bin/sh
# 새 영상 프로젝트를 만든다: 템플릿 복사 + 테마 글꼴·브랜드 값 복사. 패키지 설치(npm install)는 하지 않는다.
# 사용: sh scripts/new_project.sh <새 폴더> [insight-design-theme 스킬 폴더]
set -eu
DEST="${1:?사용: new_project.sh <새 폴더> [insight-design-theme 폴더]}"
HERE="$(cd "$(dirname "$0")/.." && pwd -P)"
THEME="${2:-${INSIGHT_THEME_DIR:-}}"
if [ -z "$THEME" ]; then
  for c in "$HERE/../insight-design-theme" "$HOME/.claude/skills/insight-design-theme" "${CODEX_HOME:-$HOME/.codex}/skills/insight-design-theme"; do
    if [ -f "$c/assets/brand.json" ]; then THEME="$c"; break; fi
  done
fi
if [ -z "$THEME" ] || [ ! -f "$THEME/assets/brand.json" ]; then
  echo "insight-design-theme 스킬을 찾지 못했습니다. 두 번째 인자나 INSIGHT_THEME_DIR로 위치를 알려 주세요." >&2
  exit 1
fi
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
  echo "이미 내용이 있는 폴더입니다(덮어쓰지 않음): $DEST" >&2
  exit 1
fi
FONTS="$THEME/assets/fonts/web"
NEED="Pretendard-Regular Pretendard-SemiBold Pretendard-Bold JetBrainsMono-Regular JetBrainsMono-SemiBold JetBrainsMono-Bold Silkscreen-Regular Silkscreen-Bold Galmuri11 Galmuri11-Bold"
for f in $NEED; do
  if [ ! -f "$FONTS/$f.woff2" ]; then
    echo "글꼴이 없습니다: $FONTS/$f.woff2 — 먼저 python3 -I \"$THEME/scripts/fetch_fonts.py\"를 실행하세요(인터넷 필요)." >&2
    exit 1
  fi
done
mkdir -p "$DEST"
cp -R "$HERE/assets/template/." "$DEST/"
mkdir -p "$DEST/public/fonts/licenses" "$DEST/out"
for f in $NEED; do cp "$FONTS/$f.woff2" "$DEST/public/fonts/"; done
for l in OFL-Pretendard.txt OFL-JetBrainsMono.txt OFL-Silkscreen.txt OFL-Galmuri.txt; do cp "$THEME/assets/fonts/licenses/$l" "$DEST/public/fonts/licenses/"; done
cp "$THEME/assets/brand.json" "$DEST/src/data/brand.json"
printf 'node_modules/\nout/\n' > "$DEST/.gitignore"
echo "만듦: $DEST"
echo "테마: $THEME"
if grep -q '"handlePlaceholder": *true' "$DEST/src/data/brand.json"; then
  echo "주의: brand.json의 핸들이 임시값입니다. 게시 전에 실제 핸들로 바꾸세요."
fi
echo "다음: cd \"$DEST\" && npm install(사용자 승인 후) && npm run setup:browser && npm run stills"
