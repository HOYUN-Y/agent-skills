#!/bin/zsh
# 사용: build.sh <doc.json> <mosaic|terminal> <pdf|cards|ppt> <출력 폴더> [이름]
#   pdf   → <출력>/<이름>.pdf (A4 세로), preview/<이름>-pN.png, preview/<이름>.txt(복사 텍스트)
#   cards → <출력>/<이름>-card.pdf (4:5), cards/<이름>-01.png …(1080×1350, 인스타 캐러셀 순서), preview/
#   ppt   → scripts/build_ppt.sh 로 넘긴다(16:9 PowerPoint)
# 순서: 내용 검사 → 글꼴 확인 → 렌더(넘침 측정) → PDF 인쇄 → 미리보기·복사 검사(macOS)
# 종료 코드: 0 통과, 1 렌더 실패, 2 준비 안 됨, 3 넘침 경고(결과물은 만들어 둔다)
set -euo pipefail
SKILL="${0:A:h:h}"
doc="${1:?doc.json 경로}"; style="${2:?mosaic 또는 terminal}"; fmt="${3:?pdf, cards, ppt 중 하나}"; out="${4:?출력 폴더}"
name="${5:-${doc:t:r}-$style}"
[[ "$style" == mosaic || "$style" == terminal ]] || { echo "스타일은 mosaic 또는 terminal" >&2; exit 2; }
case "$fmt" in
  ppt) exec "$SKILL/scripts/build_ppt.sh" "$doc" "$style" "$out" "$name" ;;
  pdf) page=a4; file="$name" ;;
  cards) page=card; file="$name-card" ;;
  *) echo "형식은 pdf, cards, ppt 중 하나" >&2; exit 2 ;;
esac
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[[ -x "$CHROME" ]] || { echo "Chrome을 찾지 못했습니다. CHROME 환경변수로 경로를 지정하세요." >&2; exit 2; }

python3 -I "$SKILL/scripts/lint_content.py" "$doc"
python3 -I "$SKILL/scripts/fetch_fonts.py" --check >/dev/null || {
  echo "웹 글꼴(또는 코드 글꼴의 복사 보정본)이 없습니다. 먼저 실행: python3 -I \"$SKILL/scripts/fetch_fonts.py\"" >&2; exit 2; }

mkdir -p "$out/preview"
out="${out:A}"
js="$out/.$file.content.js"
python3 -I - "$doc" "$SKILL/assets/brand.json" "$js" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
brand = json.load(open(sys.argv[2], encoding="utf-8"))
open(sys.argv[3], "w", encoding="utf-8").write(
    "window.DOC = " + json.dumps(doc, ensure_ascii=False) + ";\nwindow.BRAND = " + json.dumps(brand, ensure_ascii=False) + ";\n")
PY
url="file://$SKILL/assets/web/$style.html?fmt=$page&content=$(python3 -I -c 'import sys,urllib.parse; print(urllib.parse.quote("file://"+sys.argv[1]))' "$js")"

# 렌더가 끝났는지(또는 스크립트 오류) 먼저 확인하고, 넘침 경고를 읽는다
for try in 1 2 3; do
  dom=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=20000 --dump-dom "$url" 2>/dev/null || true)
  [[ "$dom" == *'data-ready="1"'* || "$dom" == *'data-error='* ]] && break
done
if [[ "$dom" != *'data-ready="1"'* ]]; then
  err=$(print -r -- "$dom" | grep -o 'data-error="[^"]*"' | head -1)
  rm -f "$js"; echo "렌더 실패: ${err:-완료 표시 없음}" >&2; exit 1
fi
warn=$(print -r -- "$dom" | grep -o 'data-warn="[^"]*"' | head -1 | sed -e 's/^data-warn="//' -e 's/"$//' -e 's/&quot;/"/g' -e "s/&#39;/'/g" -e 's/&amp;/\&/g')
# 코드 블록의 화면 줄 목록(kit.js codeRows): 복사 검사가 화면 한 줄이 복사 텍스트에서 갈라졌는지 대조한다
rows="$out/.$file.rows.json"
print -r -- "$dom" | python3 -I -c 'import re, sys
m = re.search(r"<script type=\"application/json\" id=\"code-rows\">(.*?)</script>", sys.stdin.read(), re.S)
sys.stdout.write(m.group(1) if m else "[]")' > "$rows"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=20000 --print-to-pdf="$out/$file.pdf" "$url" 2>/dev/null
rm -f "$js"
echo "PDF: $out/$file.pdf"

rc=0
if [[ "$(uname)" == Darwin ]] && command -v swiftc >/dev/null; then
  cache="${TMPDIR:-/tmp}/insight-design-theme"; mkdir -p "$cache"
  bin="$cache/pdf2png"
  [[ -x "$bin" && "$bin" -nt "$SKILL/scripts/pdf2png.swift" ]] || swiftc -O "$SKILL/scripts/pdf2png.swift" -o "$bin"
  rm -f "$out/preview/$file"-p*.png(N)
  "$bin" "$out/$file.pdf" "$out/preview/$file" 1588 "$out/preview/$file.txt" >/dev/null
  n=$(ls "$out/preview/$file"-p*.png | wc -l | tr -d ' ')
  echo "미리보기: $out/preview/$file-p1.png ~ (총 ${n}쪽)"
  if [[ "$fmt" == cards ]]; then
    # 인스타에 올릴 PNG: 1080×1350, 파일 이름 순서 = 캐러셀 순서
    mkdir -p "$out/cards"; rm -f "$out/cards/$name"-*.png(N)
    "$bin" "$out/$file.pdf" "$cache/card-$$" 1080 >/dev/null
    for i in {1..$n}; do mv "$cache/card-$$-p$i.png" "$out/cards/$name-$(printf %02d $i).png"; done
    echo "카드 이미지: $out/cards/$name-01.png ~ (${n}장, 1080×1350)"
    (( n <= 20 )) || { echo "경고: 카드가 ${n}장입니다. 인스타그램 캐러셀은 한 게시물에 20장까지입니다. 내용을 나누세요." >&2; rc=3; }
  fi
  python3 -I "$SKILL/scripts/check_pdf_text.py" "$doc" "$out/preview/$file.txt" "$out/$file.pdf" "$rows" || echo "복사 검사에서 문제가 나왔습니다. references/formats.md의 '복사 품질'을 보세요." >&2
else
  echo "macOS가 아니라 미리보기와 복사 검사를 건너뜁니다. PDF를 직접 열어 확인하세요." >&2
fi
rm -f "$rows"
if [[ -n "$warn" ]]; then
  echo "넘침 경고: $warn" >&2
  echo "잘린 글자가 있을 수 있습니다. 해당 블록을 나누거나 줄이세요(references/formats.md '넘침')." >&2
  rc=3
fi
exit $rc
