#!/usr/bin/env bash
# changed-files.sh — changelog 갱신 대상 파일 목록을 출력한다.
#
# 판별 기준: `changelog/.last-run` 스탬프보다 mtime이 최신인 파일 전부.
#   스탬프는 cron-run.sh가 **성공한 실행의 시작 시각**으로 갱신한다.
#   (2026-08-21 이전에는 CHANGELOG.md 자체의 mtime이 기준이었는데, 파일을
#   열어보기만 해도 기준선이 밀리는 사고가 있었다 — SKILL.md 지뢰 ②.
#   스탬프 방식은 그 부작용이 없다.)
#   스탬프가 없으면 아카이브(changelog/CHANGELOG.md) mtime으로 폴백한다.
#
# SKILL.md(1단계)와 cron-run.sh(실행 게이트)가 **둘 다 이 스크립트를 쓴다.**
# 탐지 규칙을 고칠 일이 생기면 여기 한 곳만 고친다.
#
# 출력: 상대경로 한 줄에 하나. 변경 없으면 아무것도 출력하지 않고 exit 0.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=${1:-${CHANGELOG_ROOT:-}}
if [ -z "$ROOT" ] && [ -f "$SCRIPT_DIR/../target-root.txt" ]; then
  IFS= read -r ROOT < "$SCRIPT_DIR/../target-root.txt"
fi
[ -n "$ROOT" ] && [ -d "$ROOT" ] || { echo '작업 폴더를 첫 번째 인자로 지정하세요.' >&2; exit 1; }
ROOT=$(cd -- "$ROOT" && pwd)
cd "$ROOT"

BASE=changelog/.last-run
[ -f "$BASE" ] || BASE=changelog/CHANGELOG.md
NEWER=()
[ ! -f "$BASE" ] || NEWER=(-newer "$BASE")

# 제외 대상과 이유:
#   .changelog-backups/  백업·로그 자신 (매 실행마다 바뀜)
#   .venv/               설치된 파이썬 패키지 — 작업 내용이 아님
#   mcp-tracking/outputs/ 매일 자동 생성되는 중간 산출물. 정본은 daily_report/ 쪽이라
#                        여기를 넣으면 실제 작업이 없는 날도 매일 갱신이 돌게 된다.
#   */raw/ · */dong-scan/  API 응답 원문 덤프. 작업 기록이 아니라 실행 부산물이며
#                        한 번의 테스트가 수백 페이지를 떨군다. 2026-08-19 22:00 무인
#                        실행이 대상 336건 중 245건(73%)을 이 두 경로에서 잡아
#                        64분 만에 `error: An internal error occurred (EINTR)`로 죽었다
#                        (워치독 3시간에는 한참 못 미쳤다. FAILED-2026-08-19.md).
#                        `api-testSequence8/raw/`만 해도 15_aptprice_hist_*.json이
#                        150개다. 제외하면 같은 날 대상이 336 → 91건이 된다.
#                        🚨 산출물 md(`.../2026-08-19_*_실행결과.md`)와 집계
#                        csv/json은 raw/ 밖에 있어 그대로 잡힌다 — 결론이 담긴
#                        파일은 빠지지 않는다.
#   .DS_Store · Icon* · ~$*  macOS·PowerPoint 부산물
#   *.log                실행 로그
#
# 🔒 비밀값 파일은 목록에서 아예 뺀다. 이 폴더에는 실제로 .env가 여러 개 있고
#    무인 에이전트가 읽으면 평문 CHANGELOG에 전재될 수 있다. 경로조차 넘기지 않는다.
#    확실한 확장자만 제외한다 — `*credential*`·`*token*` 같은 넓은 이름 매칭은
#    `remove-credentials.py`·디자인 토큰 문서 같은 정상 작업 파일까지
#    조용히 누락시키므로 쓰지 않는다. 그쪽은 SKILL.md의 "전재 금지" 규칙이 맡는다.
# changelog/ 자체는 이 스킬의 산출물이라 제외한다 — 넣으면 어제 쓴 일별 파일이
# 오늘 대상으로 잡혀 자기 기록을 다시 읽는 루프가 된다.
find . ${NEWER[@]+"${NEWER[@]}"} -type f \
  -not -path './changelog/*' \
  -not -path './.changelog-backups/*' \
  -not -path './.git/*' \
  -not -path '*/.venv/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/__pycache__/*' \
  -not -path './mcp-tracking/outputs/*' \
  -not -path '*/raw/*' \
  -not -path '*/dong-scan/*' \
  -not -name '.DS_Store' \
  -not -name 'Icon*' \
  -not -name '*.log' \
  -not -name '~$*' \
  -not -name '.env' \
  -not -name '.env.*' \
  -not -name '*.key' \
  -not -name '*.pem' \
  -not -name '*.p12' \
  -not -name '*.pfx' \
  -not -name 'id_rsa*' \
  -not -name '*.keystore' \
  | sed 's|^\./||' | sort
