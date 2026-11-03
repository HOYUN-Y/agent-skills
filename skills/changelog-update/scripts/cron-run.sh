#!/usr/bin/env bash
# cron-run.sh — changelog/ 무인 갱신 (launchd에서 매일 22:00 호출).
# SKILL.md "무인 실행 모드" 절을 따른다. 절차 본문은 SKILL.md에 있고
# 이 스크립트는 게이트·백업·검증·실패통보만 맡는다.
# changelog/ 폴더 안만 쓴다. 저장소·DB·배포 무수정.
# Bash와 Claude Code CLI 필요. macOS 알림은 지원될 때만 표시.
#
# 2026-08-21 일별 분리 개편:
#   - 정본이 단일 CHANGELOG.md(850KB, 하루 +35KB — 월별 분할로도 월말이면 원위치)에서
#     changelog/YYYY-MM-DD.md 일별 파일 + changelog/부가자료.md 상시 파일로 바뀌었다.
#   - changelog/CHANGELOG.md 는 동결 아카이브다. 어떤 실행도 이 파일을 고치면 안 되고,
#     고쳐졌으면 이 스크립트가 실패로 잡는다.
#   - 게이트 기준선은 changelog/.last-run 스탬프(성공한 실행의 시작 시각)다.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# macOS와 Linux의 해시 도구 차이를 흡수한다.
hash_file() {
  if command -v md5 >/dev/null 2>&1; then md5 -q "$@"
  elif [ "$#" -eq 0 ]; then sha256sum | awk '{print $1}'
  else
    for hash_path in "$@"; do sha256sum < "$hash_path" | awk '{print $1}'; done
  fi
}

ROOT=${1:-${CHANGELOG_ROOT:-}}
if [ -z "$ROOT" ] && [ -f "$SCRIPT_DIR/../target-root.txt" ]; then
  IFS= read -r ROOT < "$SCRIPT_DIR/../target-root.txt"
fi
[ -n "$ROOT" ] && [ -d "$ROOT" ] || { echo '작업 폴더를 첫 번째 인자로 지정하세요.' >&2; exit 1; }
ROOT=$(cd -- "$ROOT" && pwd)
CLDIR=changelog                 # 일별 파일·부가자료·아카이브가 사는 폴더
ARCHIVE=$CLDIR/CHANGELOG.md     # 동결 아카이브 — 읽기 전용
STAMP=$CLDIR/.last-run          # 게이트 기준선 (changed-files.sh가 읽는다)
BACKUP_DIR=.changelog-backups
KEEP_BACKUPS=30
DETECT="$SCRIPT_DIR/changed-files.sh"

# 모델을 여기서 못박는다(2026-08-23). --model을 빼면 ~/.claude/settings.json의 전역
# 설정을 따라가는데, 그건 대화형 세션·다른 프로젝트와 공유되는 값이라 /model 한 번으로
# 무인 실행 품질이 같이 바뀐다. 1M 컨텍스트 변형을 쓰는 이유는 대상 파일이 많은 날
# (2026-08-21 277건) 전량 통독이 필요해서다.
MODEL_ARGS=()
[ -z "${CHANGELOG_MODEL:-}" ] || MODEL_ARGS=(--model "$CHANGELOG_MODEL")

cd "$ROOT"
DATE=$(date +%F)
TS=$(date '+%F %T %Z')
mkdir -p "$BACKUP_DIR" "$CLDIR"
LOG="$BACKUP_DIR/cron-$DATE.log"

# 성공 시 스탬프를 "실행 시작 시각"으로 되돌려 찍기 위한 기준 파일.
# 실행 중에 생긴 파일이 다음 실행 대상에서 빠지지 않게 하려는 것이다.
RUN_REF=$(mktemp)

# "[무인 launchd]" 표시는 장식이 아니다. 실행 중인 에이전트가 이 로그를 읽었을 때
# 자기 자신을 알아보는 유일한 단서다. --allowedTools에 env를 읽을 Bash가 없으므로
# 무인 여부를 전달할 경로가 이 로그밖에 없다. (2026-07-27 자기 오진 사고 → SKILL.md 지뢰 ⑥)
echo "=== $TS 시작 [무인 launchd] ===" >>"$LOG"

# --- 0. 중복 실행 차단 ----------------------------------------------------
# 2026-08-10 실행이 12시간 19분을 끌었다. 그런 실행이 22:00을 넘기면 다음 실행과 겹쳐
# 같은 파일을 둘이 고친다. `mkdir`은 원자적이라 이것만으로 충분하다 — macOS엔 flock(1)이 없다.
LOCK="$BACKUP_DIR/.cron.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  OWNER=$(cat "$LOCK/pid" 2>/dev/null || echo "?")
  if [ "$OWNER" != "?" ] && kill -0 "$OWNER" 2>/dev/null; then
    echo "=== $(date '+%F %T %Z') 종료 SKIP — 앞선 실행(pid $OWNER)이 아직 돌고 있어 건너뜀 ===" >>"$LOG"
    exit 0
  fi
  echo "앞선 실행(pid $OWNER)이 남긴 잠금 회수" >>"$LOG"
  rm -rf "$LOCK"; mkdir "$LOCK"
fi
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"; rm -f "$RUN_REF"' EXIT

# --- 1. 게이트 — 변경이 없으면 claude를 띄우지 않는다 ---------------------
CHANGED=$("$DETECT" "$ROOT")

if [ -z "$CHANGED" ]; then
  echo "=== $(date '+%F %T %Z') 종료 OK — 변경 없음, 갱신 생략 ===" >>"$LOG"
  exit 0
fi

COUNT=$(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ')
echo "대상 ${COUNT}건:" >>"$LOG"
printf '%s\n' "$CHANGED" | sed 's/^/  - /' >>"$LOG"

# --- 2. 백업 -------------------------------------------------------------
# workload/는 git 저장소가 아니다. 되돌릴 수단이 이것뿐이라 편집 전에 반드시 뜬다.
# 폴더째 뜬다 — 이번 실행이 일별 파일 여러 개(밀린 날짜 포함)와 부가자료를 함께
# 고칠 수 있어서다. 아카이브 포함 수 MB 수준이라 30벌이어도 부담이 없다.
BACKUP="$BACKUP_DIR/changelog-$(date '+%Y%m%d-%H%M%S')"
cp -R "$CLDIR" "$BACKUP"
rm -f "$BACKUP/.last-run"
echo "백업: $BACKUP" >>"$LOG"

# 변경 검출용 상태 지문 — 파일 목록 + 각 파일 md5를 합친 해시.
# 새 파일 생성·기존 파일 수정 어느 쪽이든 지문이 바뀐다.
state() {
  { find "$CLDIR" -type f -not -name '.DS_Store' -not -name '.last-run' | sort
    find "$CLDIR" -type f -not -name '.DS_Store' -not -name '.last-run' -exec sh -c 'for f do if command -v md5 >/dev/null 2>&1; then md5 -q "$f"; else sha256sum < "$f"; fi; done' sh {} + | sort
  } | hash_file
}
BEFORE=$(state)
ARCHIVE_MD5_BEFORE=$(hash_file "$ARCHIVE" 2>/dev/null || echo "none")

# 편집 전 백업 대비 파일 소실·축소 검사 — 결과를 $SHRUNK에 담는다.
# 1차 갱신 뒤(4-1)와 2차 검증 패스가 파일을 고친 뒤(4-B) 두 번 부른다.
# 기준이 항상 편집 전 백업($BACKUP)이므로 마지막 호출이 두 패스를 모두 커버한다.
shrunk_check() {
  SHRUNK=""
  while IFS= read -r bf; do
    rel=${bf#"$BACKUP"/}
    cur="$CLDIR/$rel"
    bs=$(wc -c <"$bf" | tr -d ' ')
    cs=$(wc -c <"$cur" 2>/dev/null | tr -d ' ' || echo 0)
    if [ "${cs:-0}" -lt "$bs" ]; then
      SHRUNK="$SHRUNK $rel(${bs}→${cs:-0}바이트)"
    fi
  done < <(find "$BACKUP" -type f -not -name '.DS_Store')
}

# --- 3. 갱신 — 절차는 스킬이 갖고 있다 -----------------------------------
# 허용 도구를 최소로 좁힌다. 무인 실행이라 아무도 보고 있지 않으므로
# git push·wrangler deploy 같은 부수효과를 "하지 말라는 지시"가 아니라
# **구조적으로 불가능**하게 만든다.
#   Bash        → 탐지 스크립트 하나만. (백업·검증은 이 스크립트가 한다.)
#   Edit(경로)  → changelog/ 안으로 경로 제한. 일별 파일은 매일 새로 생겨야 해서
#                 파일 생성(Write)이 필요해졌는데(2026-08-21 일별 분리), CLI의
#                 Edit(경로) 규칙이 Write 도구까지 포함한 파일 편집 전체를 관장한다
#                 (`Write(경로)` 규칙은 무시된다고 CLI가 경고함 — 2026-08-21 실측,
#                 2.1.238). 상대·절대 두 형태를 함께 둔다 — cwd 해석이 어긋나도 걸리게.
#   아카이브 보호는 도구 규칙으로 못 하므로(같은 폴더다) 4단계 md5 검사가 잡는다.
ALLOWED="Bash($DETECT:*),Read,Glob,Grep,Edit(//$ROOT/changelog/**)"

# 워치독 — 무한 대기 감지 상한. 이력: 2026-07-27 2시간 26분 무응답, 2026-08-10 12시간
# 19분 누수(`pkill` exit 1이 set -e 서브셸을 죽인 것이 원인 — 아래 `|| true`가 그 수리),
# 2026-08-14 45분 상한 초과(CHANGELOG 213KB→732KB 성장이 원인)로 3시간 상향.
# 일별 분리로 편집 대상이 수십 KB로 줄었으므로 정상 소요는 수 분대로 돌아올 것이나,
# 상한은 "무한 대기 감지"용이므로 그대로 둔다.
WATCHDOG_SEC=10800

# 이번 실행이 로그에 쓴 부분만 나중에 잘라 보기 위한 기준점.
LOG_MARK=$(wc -c <"$LOG" | tr -d ' ')

# --permission-mode dontAsk: 허용 목록 밖 도구는 **묻지 않고 즉시 거부**한다.
# 무인 실행에서 "승인해 주세요"가 뜨면 답할 사람이 없어 아침까지 대기 상태로 남는다
# (2026-08-21 사용자 확인). 거부는 모델에게 에러로 돌아가 실행이 계속되지만,
# 대기는 그날 갱신을 통째로 죽인다. 거부가 항상 낫다.
claude -p "/changelog-update 작업 폴더: $ROOT. 무인 실행이며 백업은 완료됨. 탐지 스크립트: $DETECT" \
  ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} \
  --permission-mode dontAsk \
  --allowedTools "$ALLOWED" >>"$LOG" 2>&1 &
CLAUDE_PID=$!

WATCH_START=$(date +%s)
( while :; do
    sleep 30
    kill -0 "$CLAUDE_PID" 2>/dev/null || exit 0        # 정상 종료 — 감시 끝
    if [ $(( $(date +%s) - WATCH_START )) -ge "$WATCHDOG_SEC" ]; then
      echo "🚨 워치독 발동 $(date '+%F %T %Z') — ${WATCHDOG_SEC}초 경과, claude(pid $CLAUDE_PID) 강제 종료" >>"$LOG"
      # 자식(MCP 서버들)을 먼저 죽인다. 부모를 먼저 죽이면 자식의 PPID가 바뀌어
      # pkill -P로 못 찾고 고아로 남는다 — 테스트에서 실제로 그랬다.
      # 🚨 `|| true`가 핵심이다. pkill은 죽일 자식이 없으면 exit 1을 내고,
      # set -e 서브셸에서 그 1은 서브셸을 즉시 종료시켜 claude가 살아남는다(2026-08-10).
      pkill -9 -P "$CLAUDE_PID" 2>/dev/null || true
      kill -9 "$CLAUDE_PID" 2>/dev/null || true
      exit 0
    fi
  done ) &
WATCHDOG_PID=$!
disown "$WATCHDOG_PID" 2>/dev/null || true   # 정상 종료 때 "Terminated: 15" 잡메시지 억제

if wait "$CLAUDE_PID"; then
  STATUS="OK"
else
  STATUS="FAIL(exit=$?)"
fi
ELAPSED=$(( $(date +%s) - WATCH_START ))

pkill -9 -P "$WATCHDOG_PID" 2>/dev/null || true
kill -9 "$WATCHDOG_PID" 2>/dev/null || true

case "$STATUS" in
  *137*) ;;   # 워치독이 실제로 죽인 경우 — 누수가 아니다 (kill 후 wait 반환 지연분 여유 60초)
  *)
    if [ "$ELAPSED" -gt $((WATCHDOG_SEC + 60)) ]; then
      echo "🚨 소요 ${ELAPSED}초 — 워치독 상한 ${WATCHDOG_SEC}초를 넘겼는데 강제 종료되지 않았다(워치독 누수 의심)" >>"$LOG"
    fi
    ;;
esac

# --- 4. 검증 -------------------------------------------------------------
# 에이전트가 "완료"라고 해도 파일이 안 바뀌었으면 실패다. 종료코드만 믿지 않는다.
AFTER=$(state)

# 4-0. 아카이브 불가침 — 어떤 성공 경로에서도 아카이브가 바뀌면 실패다.
ARCHIVE_MD5_AFTER=$(hash_file "$ARCHIVE" 2>/dev/null || echo "none")
if [ "$ARCHIVE_MD5_BEFORE" != "$ARCHIVE_MD5_AFTER" ]; then
  STATUS="FAIL(archive)"
fi

# 4-1. 기존 파일 보존 — 이 스킬은 추가·보강만 하므로 파일이 지워지거나 줄어드는
# 정상 경로가 없다. 백업에 있던 모든 파일이 지금도 있고 크기가 같거나 커야 한다.
# ponytail: 같은 길이로 치환하는 삭제는 크기 비교로 못 잡는다. 필요해지면 줄 단위 검사로.
shrunk_check
if [ -n "$SHRUNK" ] && [ "$STATUS" = "OK" ]; then
  STATUS="FAIL(shrunk)"
fi

# 4-2. "쓸 게 없어서 안 썼다"는 실패가 아니다(2026-08-13 오탐 사고).
# 에이전트가 남기는 NO_CHANGE_NEEDED 표식을 이번 실행 로그 구간에서만 찾는다.
NO_CHANGE=""
if [ -n "${LOG_MARK:-}" ]; then
  NO_CHANGE=$(tail -c "+$((LOG_MARK + 1))" "$LOG" | grep -m1 '^NO_CHANGE_NEEDED:' || true)
fi

if [ "$STATUS" = "OK" ] && [ "$BEFORE" = "$AFTER" ] && [ -n "$NO_CHANGE" ]; then
  echo "=== $(date '+%F %T %Z') 종료 OK — 갱신 불필요 (대상 ${COUNT}건, 소요 ${ELAPSED}초) ===" >>"$LOG"
  echo "    ${NO_CHANGE}" >>"$LOG"
  rm -f "$BACKUP_DIR/FAILED-$DATE.md"
  rm -rf "$BACKUP"                       # 내용이 같으므로 이번 백업은 중복 — 한도 절약
  touch -r "$RUN_REF" "$STAMP"           # 기준선 전진 — 같은 대상을 매일 다시 잡지 않게
  exit 0
fi

if [ "$STATUS" = "OK" ] && [ "$BEFORE" != "$AFTER" ]; then
  echo "=== $(date '+%F %T %Z') 1차 갱신 OK — changelog/ 갱신됨 (대상 ${COUNT}건, 소요 ${ELAPSED}초) ===" >>"$LOG"

  # --- 4-B. 2차 검증 패스 ------------------------------------------------
  # 같은 세션이 자기 글을 검사하면 그냥 통과시킨다(2026-08-13 실증). 별도 claude
  # 프로세스로 신선한 컨텍스트에서 다시 본다. 대상이 많은 날에만 돈다.
  VERIFY_MIN_TARGETS=15
  VERIFY_SCRIPT="$SCRIPT_DIR/../../changelog-verify/scripts/check-detail.sh"

  if [ "$COUNT" -lt "$VERIFY_MIN_TARGETS" ]; then
    echo "2차 검증 생략 — 대상 ${COUNT}건 < ${VERIFY_MIN_TARGETS}건" >>"$LOG"
  elif [ ! -x "$VERIFY_SCRIPT" ]; then
    echo "🚨 2차 검증 생략 — $VERIFY_SCRIPT 없음(install.sh 실행 필요)" >>"$LOG"
  else
    echo "--- 2차 검증 패스 시작 $(date '+%F %T %Z') (대상 ${COUNT}건) ---" >>"$LOG"

    # 일별 분리 후 갱신분이 여러 파일에 흩어지므로, 검사기는 전/후 각각을
    # 파일명 순으로 이어 붙인 단일본으로 비교한다. 아카이브는 양쪽에 똑같이
    # 들어가 diff에서 상쇄된다.
    CONCAT_PRE=$(mktemp)
    CONCAT_POST=$(mktemp)
    find "$BACKUP" -name '*.md' -print0 | sort -z | xargs -0 cat >"$CONCAT_PRE" 2>/dev/null || true
    find "$CLDIR" -name '*.md' -print0 | sort -z | xargs -0 cat >"$CONCAT_POST" 2>/dev/null || true

    # 기계 검사 결과를 먼저 로그에 남긴다. 2차 claude는 이 로그를 Read로 읽는다.
    # (2차 패스에 Bash를 더 주지 않는다 — 2026-08-14 승인 프롬프트 사고. 할 일을 줄이는 쪽이 맞다.)
    "$VERIFY_SCRIPT" "$CONCAT_POST" "$CONCAT_PRE" "$ROOT" >>"$LOG" 2>&1 || true
    rm -f "$CONCAT_PRE" "$CONCAT_POST"

    # 2차 패스 직전 상태를 따로 떠 둔다. 보강분만 따로 비교할 수 있어야 한다.
    BACKUP2="$BACKUP_DIR/changelog-$(date '+%Y%m%d-%H%M%S')-preverify"
    cp -R "$CLDIR" "$BACKUP2"; rm -f "$BACKUP2/.last-run"
    BEFORE2=$(state)

    V_ALLOWED="$ALLOWED"
    V_START=$(date +%s)
    claude -p "/changelog-verify 작업 폴더: $ROOT. 무인 실행. 로그: $ROOT/$LOG. 1차 갱신분을 검증하라. 기준 백업 폴더: $ROOT/$BACKUP" \
      ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} \
      --permission-mode dontAsk \
      --allowedTools "$V_ALLOWED" >>"$LOG" 2>&1 &
    V_PID=$!
    ( while :; do
        sleep 30
        kill -0 "$V_PID" 2>/dev/null || exit 0
        if [ $(( $(date +%s) - V_START )) -ge "$WATCHDOG_SEC" ]; then
          echo "🚨 2차 검증 워치독 발동 $(date '+%F %T %Z') — ${WATCHDOG_SEC}초 경과, 강제 종료" >>"$LOG"
          pkill -9 -P "$V_PID" 2>/dev/null || true
          kill -9 "$V_PID" 2>/dev/null || true
          exit 0
        fi
      done ) &
    V_WD=$!
    disown "$V_WD" 2>/dev/null || true
    if wait "$V_PID"; then V_STATUS="OK"; else V_STATUS="FAIL(exit=$?)"; fi
    pkill -9 -P "$V_WD" 2>/dev/null || true
    kill -9 "$V_WD" 2>/dev/null || true

    AFTER2=$(state)
    V_ELAPSED=$(( $(date +%s) - V_START ))
    if [ "$BEFORE2" != "$AFTER2" ]; then
      V_RESULT="보강 있음"
      # 2차 패스도 아카이브 불가침·기존 파일 보존 규칙을 지켜야 한다.
      # (4-1은 1차 갱신 직후에 돌았으므로 검증 패스의 축소는 여기서 다시 잡는다.)
      if [ "$(hash_file "$ARCHIVE" 2>/dev/null || echo none)" != "$ARCHIVE_MD5_BEFORE" ]; then
        STATUS="FAIL(archive)"
      fi
      shrunk_check
      if [ -n "$SHRUNK" ] && [ "$STATUS" = "OK" ]; then
        STATUS="FAIL(shrunk)"
      fi
    else
      V_RESULT="보강 없음"
      rm -rf "$BACKUP2"    # 1차 결과와 동일 — 백업 한도 절약
    fi
    echo "--- 2차 검증 패스 $V_STATUS — $V_RESULT (소요 ${V_ELAPSED}초) ---" >>"$LOG"
  fi

  if [ "$STATUS" = "OK" ]; then
    echo "=== $(date '+%F %T %Z') 종료 OK — changelog/ 갱신됨 (대상 ${COUNT}건) ===" >>"$LOG"
    rm -f "$BACKUP_DIR/FAILED-$DATE.md"
    touch -r "$RUN_REF" "$STAMP"        # 성공 — 기준선을 실행 시작 시각으로 전진
    # 폴더 백업 30벌 유지 (구 단일파일 백업 CHANGELOG-*.md는 건드리지 않는다 — 수동 정리 대상)
    ls -dt "$BACKUP_DIR"/changelog-* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old_backup; do rm -rf -- "$old_backup"; done || true
    exit 0
  fi
fi

# --- 5. 실패 -------------------------------------------------------------
# 조용히 죽으면 아무도 모른다. 보는 자리에 흔적을 남긴다.
case "$STATUS" in
  *archive*) REASON="동결 아카이브($ARCHIVE)가 수정됨 — 백업($BACKUP)에서 복원 필요" ;;
  *shrunk*)  REASON="기존 기록 삭제·축소 의심:${SHRUNK} — 백업($BACKUP)과 대조해 복원 여부 판단 필요" ;;
  *137*)     REASON="워치독 ${WATCHDOG_SEC}초 초과 — claude가 응답하지 않아 강제 종료" ;;
  *)         if [ "$BEFORE" = "$AFTER" ]; then
               REASON="changelog/가 변경되지 않음"
             else
               REASON="claude 실행 실패"
             fi ;;
esac
echo "=== $(date '+%F %T %Z') 종료 $STATUS — 🚨 $REASON ===" >>"$LOG"

{
  echo "# 🚨 changelog 무인 갱신 실패 — $DATE"
  echo
  echo "- 실행 시각: $TS / 상태: $STATUS / 원인: $REASON"
  echo "- 로그: \`$ROOT/$LOG\`"
  echo "- 편집 전 백업: \`$ROOT/$BACKUP\` (폴더째. 자동 복원하지 않음 — 필요하면 직접 되돌릴 것)"
  echo "- 흔한 원인: \`claude\` 로그인 만료 · 네트워크 · CLI 버전 결함(2026-08-19·20 EINTR) · 대상 과다"
  echo
  echo '## 복구'
  echo '```bash'
  echo "claude                                                        # 로그인 상태 확인"
  echo "$SCRIPT_DIR/cron-run.sh         # 수동 재실행"
  echo "cp -R $ROOT/$BACKUP/ $ROOT/$CLDIR/   # 되돌리기(폴더째)"
  echo '```'
  echo
  echo "> 기준선(.last-run)은 성공해야만 전진하므로 **언제 재실행해도 같은 파일을 잡는다.** 서두를 필요 없음."
  echo
  echo '## 대상 파일'
  echo '```'
  printf '%s\n' "$CHANGED"
  echo '```'
  echo
  echo '## 로그 끝부분'
  echo '```'
  tail -30 "$LOG"
  echo '```'
} >"$BACKUP_DIR/FAILED-$DATE.md"

osascript -e "display notification \"changelog 갱신 실패 — .changelog-backups/FAILED-$DATE.md 확인\" with title \"workload changelog\"" 2>/dev/null || true
exit 1
