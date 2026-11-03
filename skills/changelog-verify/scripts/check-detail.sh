#!/usr/bin/env bash
# check-detail.sh — CHANGELOG 갱신분의 "형식 위반"만 기계적으로 잡는다.
#
# 이 스크립트는 자세함을 판단하지 않는다. 판단은 LLM 2차 패스(SKILL.md)가 한다.
# 여기서는 2026-08-13에 실제로 발생한 실패 형태만 정확히 잡는다.
#   ① 파일 목록만 적은 항목 (수치·식별자 없음)
#   ② 큰 문서를 "확인 필요"로 위장한 항목
#   ③ 대상 파일인데 CHANGELOG 어디에도 언급되지 않은 것
#
# 사용법:
#   check-detail.sh <changelog> <backup> [root]
#     changelog : 갱신된 CHANGELOG.md
#     backup    : 갱신 전 백업(추가된 줄만 검사하기 위한 기준)
#     root      : workload 루트(대상 파일 판별용, 생략하면 ③ 검사 생략)
#
# 종료코드: 0 = 위반 없음 / 2 = 위반 있음 / 1 = 사용법 오류
set -uo pipefail

CHANGELOG=${1:-}
BACKUP=${2:-}
ROOT=${3:-}

[ -f "$CHANGELOG" ] && [ -f "$BACKUP" ] || {
  echo "사용법: check-detail.sh <changelog> <backup> [root]" >&2; exit 1; }

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DETECT="$SCRIPT_DIR/../../changelog-update/scripts/changed-files.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
ADDED="$TMP/added"
OUT="$TMP/findings"
: >"$OUT"

# 추가된 줄만 뽑는다. 이번 실행이 쓴 것만 검사 대상이다.
#
# 🚨 자기참조 제외: 이 검사기 자체를 설명하는 줄은 검사 대상에서 뺀다.
# CHANGELOG의 스킬 인벤토리 절에는 "「확인 필요」가 「통독하지 않」과 같은 문장에 있으면
# 위반"처럼 규칙을 서술한 문장이 들어간다. 그 문장은 규칙을 **설명**하는 것인데 규칙에
# 걸려버린다(2026-08-13 설계 중 실제로 2건 오탐). 검사기 이름·규칙 이름을 언급한 줄은
# 메타 서술로 보고 건너뛴다.
# 제외 목록에는 **검사기 이름**뿐 아니라 **규칙(절) 이름**도 넣는다. 규칙 이름을 인용한
# 문장이 그 규칙에 걸리는 일이 2026-08-14에 또 발생했다("「확인 필요는 근거가 없을 때만
# 쓴다」를 신설했다"는 서술이 ② 위반으로 잡혔다). 스킬 규칙을 CHANGELOG에 적을 때마다
# 재발하므로 절 이름 자체를 메타 신호로 취급한다.
META='check-detail\.sh|changelog-verify|미독 위장|①인벤토리|②미독|③미언급'
META="$META"'|확인 필요.{0,2}는 근거가 없을 때만|파일 목록은 기록이 아니다'
diff "$BACKUP" "$CHANGELOG" \
  | sed -n 's/^> //p' \
  | grep -vE "$META" \
  >"$ADDED"

ADDED_LINES=$(grep -c '[^[:space:]]' "$ADDED" || true)
if [ "${ADDED_LINES:-0}" -eq 0 ]; then
  echo "추가된 줄 없음 — 검사 생략"
  exit 0
fi

echo "=== changelog-verify 기계 검사 — 추가된 ${ADDED_LINES}줄 ==="
echo

# 정성적 결정 문장은 숫자가 적어도 정상이다("A로 정함 — B와 충돌해서").
# 그래서 "숫자가 적다"만으로는 인벤토리를 구분할 수 없다 → 넓은 수치 검사는 두지 않는다.
# 2026-08-13 시험에서 그 방식은 정상 항목 3건을 오탐했다. 아래 ①-B만 남긴다.

# --- ①-B 폴더를 인벤토리로만 적은 항목 --------------------------------------
# 인벤토리의 특징은 "숫자가 적다"가 아니다(파일 개수·종수는 숫자로 적히니 통과해버린다).
# 진짜 특징은 **결과 서술이 없다**는 것이다 — 무엇이 통과·실패했고 무슨 판정이 났는지가 없다.
# 그래서 "폴더/파일 개수 언급 + 결과 어휘 0개"를 위반으로 본다.
# 한 항목이 여러 불릿에 걸쳐 있는 경우가 많다(첫 불릿은 개요, 다음 불릿에 결과).
# 그래서 후보 줄 하나만 보면 정상 항목을 오탐한다(2026-08-13 시험에서 4건 오탐).
# 후보 줄 + 뒤따르는 2줄을 한 창으로 묶어 결과 어휘를 찾는다.
OUTCOME='통과|실패|성공|재현|판정|원인|결론|미해결|오류|확인됐|확정|누락|중단|정정|뒤집|미수행|미착수|건 중|/[0-9]'
awk -v outcome="$OUTCOME" '
  { line[NR] = $0 }
  END {
    for (i = 1; i <= NR; i++) {
      if (line[i] !~ /\([0-9]+ *(파일|개|개 파일|종)\)/) continue
      window = line[i] " " line[i+1] " " line[i+2]
      if (window !~ outcome) {
        s = substr(line[i], 1, 150)
        printf "🚨 [①인벤토리] 폴더 내용만 나열하고 결과 서술이 없음 — 그 폴더로 무엇이 나왔는지가 빠짐\n    %s…\n", s
      }
    }
  }
' "$ADDED" >>"$OUT"

# --- ② "확인 필요" 위장 ------------------------------------------------------
# 미독 사유와 "확인 필요"가 **가까이**(같은 문장 수준) 있을 때만 잡는다.
# 이 CHANGELOG는 한 줄이 수천 자라 "같은 줄" 기준은 무관한 두 표현을 함께 잡는다
# (2026-08-13 시험에서 정상 항목 3건 오탐). 문장 단위로 쪼갠 뒤 검사한다.
while IFS= read -r line; do
  printf '%s' "$line" | grep -q '확인 필요' || continue
  # 마침표·중점으로 문장 분할 후, 한 문장 안에 둘이 같이 있는 경우만 위반.
  printf '%s' "$line" | tr '.·。' '\n\n\n' | while IFS= read -r sent; do
    printf '%s' "$sent" | grep -q '확인 필요' || continue
    if printf '%s' "$sent" | grep -qE '통독하지 않|읽지 않|미독|열지 않|[0-9,]{4,} *바이트'; then
      printf '🚨 [②미독위장] "확인 필요"가 미독 사유와 같은 문장에 있음 — 판단 보류가 아니라 작업 미완\n    …%s…\n' \
        "$(printf '%s' "$sent" | cut -c1-180)" >>"$OUT"
    fi
  done
done <"$ADDED"

# --- ③ 언급되지 않은 대상 파일 ----------------------------------------------
if [ -n "$ROOT" ] && [ -x "$DETECT" ]; then
  MISSING=0
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    base=$(basename "$rel")
    stem=${base%.*}
    parent=$(basename "$(dirname "$rel")")
    # 파일명(확장자 제외) 또는 부모 폴더명이 한 번이라도 나오면 통과.
    # 폴더 단위로 묶어 서술하는 것을 인정하기 위함이다.
    if ! grep -qF "$stem" "$CHANGELOG" && ! grep -qF "$parent" "$CHANGELOG"; then
      MISSING=$((MISSING + 1))
      [ "$MISSING" -le 15 ] && printf '🚨 [③미언급] CHANGELOG에 흔적 없음: %s\n' "$rel" >>"$OUT"
    fi
  done < <("$DETECT" "$ROOT" 2>/dev/null)
  if [ "$MISSING" -gt 15 ]; then
    printf '🚨 [③미언급] … 외 %s건 더 (총 %s건)\n' "$((MISSING - 15))" "$MISSING" >>"$OUT"
  fi
fi

COUNT=$(grep -c '^🚨' "$OUT" || true)
if [ "${COUNT:-0}" -eq 0 ]; then
  echo "✅ 형식 위반 없음 (①수치없음 ②미독위장 ③미언급 전부 통과)"
  echo
  echo "※ 형식만 통과한 것이다. 실제 누락 여부는 LLM 2차 패스가 판단한다."
  exit 0
fi

cat "$OUT"
echo
echo "→ 형식 위반 ${COUNT}건. LLM 2차 패스에서 해당 항목을 원본과 대조해 보강할 것."
exit 2
