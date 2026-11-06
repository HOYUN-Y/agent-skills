#!/bin/zsh
# 사용: build_ppt.sh <doc.json> <mosaic|terminal> <출력 폴더> [이름]  (보통 build.sh … ppt 로 부른다)
# 결과: <출력>/<이름>.pptx, (PowerPoint가 있으면) <출력>/<이름>-preview.pdf와 <출력>/preview/<이름>-pN.png
# 순서: 내용 검사 → 의존성·글꼴 확인 → 픽셀 그래픽 PNG → 덱 생성 → 파일 점검 → PowerPoint로 내보내 확인(macOS)
# 글꼴과 npm 패키지는 자동으로 설치하지 않는다. 없으면 무엇이 없는지와 설치 방법을 알리고 멈춘다.
set -euo pipefail
SKILL="${0:A:h:h}"
PPT="$SKILL/assets/ppt"
content="${1:?doc.json 경로}"; style="${2:?mosaic 또는 terminal}"; out="${3:?출력 폴더}"
name="${4:-${content:t:r}-$style}"
[[ "$style" == mosaic || "$style" == terminal ]] || { echo "스타일은 mosaic 또는 terminal" >&2; exit 2; }
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[[ -x "$CHROME" ]] || { echo "Chrome을 찾지 못했습니다(픽셀 그래픽 생성에 필요). CHROME 환경변수로 지정하세요." >&2; exit 2; }

python3 -I "$SKILL/scripts/lint_content.py" "$content"

if [[ ! -d "$PPT/node_modules/pptxgenjs" ]]; then
  echo "pptxgenjs가 없습니다. 사용자 승인 후 실행: npm ci --prefix \"$PPT\"  (스킬 폴더 안에만 설치됨)" >&2; exit 2
fi

# PPT는 글꼴을 파일에 넣지 못한다. 여는 컴퓨터에 설치돼 있어야 시안대로 보인다.
need=(Pretendard-Regular.otf Pretendard-Medium.otf Pretendard-SemiBold.otf Pretendard-Bold.otf Pretendard-ExtraBold.otf Pretendard-Black.otf JetBrainsMono-Regular.ttf JetBrainsMono-SemiBold.ttf JetBrainsMono-Bold.ttf DejaVuSansMono.ttf DejaVuSansMono-Bold.ttf)
[[ "$style" == terminal ]] && need+=(Galmuri11.ttf Silkscreen-Regular.ttf)
missing=()
for f in $need; do [[ -e "$HOME/Library/Fonts/$f" || -e "/Library/Fonts/$f" ]] || missing+=("$f"); done
if (( ${#missing} )); then
  echo "설치되지 않은 글꼴: ${missing[*]}" >&2
  echo "사용자 승인 후: python3 -I \"$SKILL/scripts/fetch_fonts.py\" --desktop 로 받고, assets/fonts/desktop/의 해당 파일을 ~/Library/Fonts에 복사. 그 뒤 PowerPoint를 다시 시작." >&2
  [[ "${ALLOW_MISSING_FONTS:-}" == 1 ]] || exit 2
  echo "ALLOW_MISSING_FONTS=1: 대체 글꼴로 계속합니다(시안과 다르게 보임)." >&2
fi

mkdir -p "$out/preview"; out="${out:A}"
img="$out/.$name.img"; rm -rf "$img"; mkdir -p "$img"
# 문서에 필요한 그래픽만 만든다: 단계 수들(ns), 요점 최대 수(pts), 큰 숫자 비율(rs), 칸 막대(cs), 호수(issue)
q=$(python3 -I - "$content" "$style" <<'PY'
import json, sys, urllib.parse
d = json.load(open(sys.argv[1], encoding="utf-8"))
bl = [b for s in d.get("sections") or [] for b in s.get("blocks") or []]
ns = sorted({len(b.get("items") or []) for b in bl if b.get("type") == "steps"})
pts = max([len(b.get("items") or []) for b in bl if b.get("type") == "points"] or [0])
rs = sorted({round(max(0, min(1, it["ratio"])) * 10) for b in bl if b.get("type") == "stats" for it in b.get("items") or [] if isinstance(it.get("ratio"), (int, float))})
cs = set()
for b in bl:
    if b.get("type") != "stats":
        continue
    cells = [it["cells"] for it in b.get("items") or [] if isinstance(it.get("cells"), int) and not isinstance(it.get("cells"), bool) and it["cells"] >= 0]
    rows = max([1] + [-(-c // 10) for c in cells])
    cs |= {f"{c}-{rows}" for c in cells}
issue = str((d.get("meta") or {}).get("issue") or "x")
print(urllib.parse.urlencode({"st": sys.argv[2], "ns": ",".join(map(str, ns)), "pts": pts, "rs": ",".join(map(str, rs)), "cs": ",".join(sorted(cs)), "issue": issue}))
PY
)
url="file://$PPT/assets.html"
# Chrome이 가끔 결과를 늦게 내놓으므로 목록·그림 모두 몇 번 다시 시도한다
list=""
for try in 1 2 3; do
  list=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom "$url?a=list&$q" 2>/dev/null | grep -o 'ASSET@LIST@[^<]*' | sed 's/ASSET@LIST@//' || true)
  [[ -n "$list" ]] && break
done
[[ -n "$list" ]] || { echo "실패: 픽셀 그래픽 목록을 만들지 못했습니다(Chrome 확인)" >&2; exit 1; }
for item in ${(s:,:)list}; do
  a=${item%%:*}; size=${item#*:}
  for try in 1 2 3; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 --default-background-color=00000000 \
      --force-device-scale-factor=3 --window-size=${size%x*},${size#*x} --screenshot="$img/$a.png" "$url?a=$a&$q" 2>/dev/null || true
    [[ -s "$img/$a.png" ]] && break
  done
  [[ -s "$img/$a.png" ]] || { echo "실패: 그래픽 $a.png를 만들지 못했습니다" >&2; exit 1; }
done

pptx="$out/$name.pptx"
node "$PPT/deck.js" "$content" "$SKILL/assets/brand.json" "$style" "$img" "$pptx"
rm -rf "$img"
python3 -I "$SKILL/scripts/check_pptx.py" "$pptx" "$content" || echo "PPT 점검에서 문제가 나왔습니다. references/formats.md의 PPT 절을 보세요." >&2
[[ -n "${PPTX_VALIDATE:-}" ]] && "${PY:-python3}" "$PPTX_VALIDATE" "$pptx"

# PowerPoint로 열어 PDF로 내보낸다(복구 창 없이 열리는지가 가장 확실한 검증). 여러 작업이 동시에 PowerPoint를 쓰지 않게 잠근다.
if [[ "$(uname)" == Darwin && -d "/Applications/Microsoft PowerPoint.app" && "${SKIP_POWERPOINT:-}" != 1 ]]; then
  qa="$HOME/Library/Containers/com.microsoft.Powerpoint/Data/insight-design-theme"   # 샌드박스 안이라 권한 창이 뜨지 않는다
  lock="${TMPDIR:-/tmp}/insight-design-theme-powerpoint.lock"
  mkdir -p "$qa"
  for i in {1..120}; do mkdir "$lock" 2>/dev/null && break; sleep 3; done
  [[ -d "$lock" ]] || { echo "PowerPoint 잠금을 얻지 못했습니다" >&2; exit 1; }
  trap 'rmdir "$lock" 2>/dev/null || true' EXIT
  tag="$name-$$"; cp "$pptx" "$qa/$tag.pptx"; rm -f "$qa/$tag.pdf"
  if osascript >/dev/null <<EOF
with timeout of 180 seconds
tell application "Microsoft PowerPoint"
  open POSIX file "$qa/$tag.pptx"
  delay 2
  save active presentation in POSIX file "$qa/$tag.pdf" as save as PDF
  close active presentation saving no
end tell
end timeout
EOF
  then
    mv "$qa/$tag.pdf" "$out/$name-preview.pdf"; rm -f "$qa/$tag.pptx"
    echo "PowerPoint 내보내기: $out/$name-preview.pdf"
    cache="${TMPDIR:-/tmp}/insight-design-theme"; mkdir -p "$cache"; bin="$cache/pdf2png"
    [[ -x "$bin" && "$bin" -nt "$SKILL/scripts/pdf2png.swift" ]] || swiftc -O "$SKILL/scripts/pdf2png.swift" -o "$bin"
    rm -f "$out/preview/$name-ppt"-p*.png(N)
    "$bin" "$out/$name-preview.pdf" "$out/preview/$name-ppt" 1600 >/dev/null
    echo "미리보기: $out/preview/$name-ppt-p1.png ~ (총 $(ls "$out/preview/$name-ppt"-p*.png | wc -l | tr -d ' ')장)"
  else
    rm -f "$qa/$tag.pptx"
    echo "PowerPoint 내보내기 실패. PowerPoint에 대화 상자가 떠 있으면 닫고, 응답이 없으면 사용자에게 종료를 부탁하세요(강제 종료하지 말 것)." >&2
    exit 1
  fi
else
  echo "PowerPoint로 확인하지 않았습니다(macOS·PowerPoint 없음 또는 SKIP_POWERPOINT=1). 파일을 직접 열어 확인하세요." >&2
fi
echo "PPT: $pptx"
