# 초기 설정

설치·수리 요청 때만 실행한다. 이미 준비된 세션의 일반 작업에서는 건너뛴다.
이 문서는 Codex CLI와 Claude Code의 로컬 터미널 환경을 대상으로 한다.

## 확인

```bash
command -v herdr
herdr --version
herdr --help
```

Herdr 실행 파일이 없다면 공식 https://herdr.dev 의 현재 설치 안내를 확인한다.
이 스킬에는 변동 가능한 다운로드 URL이나 원격 스크립트 실행을 고정하지 않는다.
Codex·Claude 자체 설치나 로그인 변경은 별도 요청 없이 수행하지 않는다.

## 공통 스킬 설치

현재 읽은 `SKILL.md`가 있는 `herdr-workflow/` 전체(참조 파일 포함)를
다음 위치로 복사한다. 저장소에서는 `skills/herdr-workflow/`이며,
이미 설치된 스킬로 설정 중이라면 그 설치 디렉터리가 원본이다.
기본은 사용자 범위이며 프로젝트 범위를 요청받으면 아래 대체 위치를 쓴다.

| 대상 | 사용자 범위 | 프로젝트 범위 |
| --- | --- | --- |
| Codex | `~/.agents/skills/herdr-workflow/` | `.agents/skills/herdr-workflow/` |
| Claude Code | `~/.claude/skills/herdr-workflow/` | `.claude/skills/herdr-workflow/` |

공식 조작 스킬도 원하면 `herdr --skill` 출력을 임시 파일로 받아 성공 여부와
`name: herdr`인 SKILL.md인지 확인한 뒤, 같은 범위의 `herdr/SKILL.md`에 설치한다.
이 공식 스킬이 없어도 workflow는 실행 시 `herdr --skill`로 읽을 수 있다.
공식 스킬의 설명을 바꾸어 포크하지 않는다. 우선순위는 다음 상시 지침으로 정한다.

원본과 대상이 같은 실제 경로이면 복사를 건너뛴다.
설치 대상이 없으면 생성하고, 같으면 건너뛴다. 기존 파일이나 심볼릭 링크가
있으면 먼저 읽는다. 갱신이 필요하면 기존 내용을 백업하고 사용자 수정은
보존한다. 셸 리다이렉션으로 기존 SKILL.md를 먼저 비우지 않는다.
사용자 범위와 프로젝트 범위에 같은 스킬을 중복 설치하지 않는다.

## 세션이 먼저 읽게 만드는 상시 지침

스킬 설치만으로 매 세션 첫 로드를 보장할 수 없으므로 다음 블록도 반영한다.
Codex 사용자 지침은 `${CODEX_HOME:-$HOME/.codex}/AGENTS.md`, Claude Code는
`~/.claude/CLAUDE.md`다. 프로젝트 설치이면 프로젝트의 `AGENTS.md`와 `CLAUDE.md`를 쓴다.

기존 내용을 읽고 관련 규칙이 이미 있으면 정합성을 맞춘다. 나머지 지침은
보존한다. 아래 마커 블록은 한 번만 넣고, 재실행 시 그 블록만 갱신한다.
기존 Orca 우선 지침에는 `HERDR_ENV=1`인 터미널 협업 작업의 예외를 명시한다.
다른 도구 자체를 제거하거나 Herdr 밖의 작업 규칙을 바꾸지 않는다.

```markdown
<!-- herdr-workflow:start -->
## Herdr 세션 준비

- HERDR_ENV=1에서 세션을 시작하면 작업 전에 herdr-workflow 스킬을 읽는다.
  스킬 목록에 없으면 설치 범위의 herdr-workflow/SKILL.md를 직접 읽는다
  (사용자 범위: Codex ~/.agents/skills, Claude Code ~/.claude/skills;
  프로젝트 범위: .agents/skills 또는 .claude/skills).
- 페인·탭·워크스페이스를 열거나 다른 에이전트를 띄우고 제어하는 요청에서
  HERDR_ENV=1이면 Orca 등 다른 도구보다 Herdr CLI를 우선 사용한다.
  요청에 Herdr라는 말이 없어도 적용한다.
- herdr pane send-text로 넣은 입력은 herdr pane send-keys <pane> enter로 제출한다.
<!-- herdr-workflow:end -->
```

지침 파일은 로드 시점의 영향을 받는다. 설치 후 새 세션에서 확인한다.
현재 세션은 SKILL.md를 직접 읽어 계속 진행할 수 있다.

## 상태 연동 훅은 별도

```bash
herdr integration status
```

스킬과 상태 연동 훅은 다르다. 훅이 없다고 스킬을 다시 설치하지 않는다.
초기 설정 요청 범위에서 상태 연동도 필요하면 현재 `herdr integration` 도움말을
읽고 Codex·Claude의 기존 설정/훅을 확인·백업한 뒤 내장 설치기를 사용한다.

```bash
herdr integration install codex
herdr integration install claude
herdr integration status
```

기존 설정을 통째로 재작성하거나 권한 우회 플래그를 추가하지 않는다.
로드에 재시작이 필요하면 사용자에게 알리고 현재 에이전트는 강제로 재시작하지 않는다.

## 완료 확인

스킬 두 경로의 본문·참조 파일과 상시 지침을 읽어 누락·중복이 없는지 확인한다.
Herdr 안이면 `herdr pane current --current`, `herdr agent list`로 접근을 확인한다.
`HERDR_ENV=1`이어도 현재 페인을 찾지 못하면 준비 완료로 보고하지 않는다.
설치 결과와 호출자 컨텍스트 문제를 구분하고 Herdr 내부의 새 세션에서 확인한다.
설치 확인만을 위해 유료 에이전트나 새 페인을 생성하지 않는다.
설치 위치, 변경 지침, 훅 상태, 새 세션에서 확인할 항목을 보고한다.

설치 경로 참고: [Codex customization](https://learn.chatgpt.com/docs/customization/overview),
[Claude Code skills](https://code.claude.com/docs/en/skills).
