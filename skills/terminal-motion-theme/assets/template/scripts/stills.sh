#!/bin/sh
# 검증 프레임을 두 화면비로 출력한다. 사용: sh scripts/stills.sh [출력 폴더] [프레임...]
# 기본 프레임: 제목(0) · 01(130) · 02(230) · 03(430) · 완료(480) · 로고(599)
set -e
OUT="${1:-out/stills}"
[ $# -gt 0 ] && shift
FRAMES="${*:-0 130 230 430 480 599}"
mkdir -p "$OUT"
for comp in Landscape Portrait; do
  for f in $FRAMES; do
    npx remotion still src/index.ts "$comp" "$OUT/${comp}_f$f.png" --frame="$f" --log=error
  done
done
echo "$OUT"
