# 공통 Code Reviewer

하나의 리뷰 지침에서 Claude Code·Codex의 프로젝트용 `code-reviewer` 서브에이전트 정의를 생성합니다. 일반 스킬을 자동 선택하는 방식이 아니라 각 도구의 에이전트 등록 경로에 설치하는 도구입니다. Claude의 실제 호출과 합성 예제 검증, Codex의 Herdr 대화형 CLI에서 전용 종류 선택·공통 지침 주입·결함 발견을 확인했습니다. Codex 비대화형 검증에서는 호출이 차단됐으며, 환경별 차이의 원인은 아직 분리하지 못했습니다. [검증 결과와 한계](VALIDATION.md)를 확인하세요.

## 합의한 동작

- 사용자가 요청할 때만 실행합니다. 자동 호출을 유도하는 지침·훅은 등록하지 않습니다. 자연어 설명만으로 자동 호출을 기술적으로 차단하는 것은 아닙니다.
- 변경사항, 전체 코드베이스, 특정 영역을 검토합니다. diff가 없다고 최근 커밋으로 대상을 바꾸지 않습니다.
- ECC처럼 결함·보안·품질·설계·성능·테스트를 살피되, 확인된 결함과 개선 제안을 나누고 근거 없는 취향 지적을 제외합니다.
- 지원 언어 목록으로 제한하지 않습니다. 해당 프로젝트 기술에 맞는 기준을 적용하고 확인 한계를 보고합니다.
- 큰 저장소는 위험 영역부터 읽고 검토·미검토 영역을 표시합니다. 줄 수만으로 문제를 판정하거나 전체 검토를 보장하지 않습니다.
- 검사 결과·근거·심각도·검증 상태만 보고합니다. 승인·차단 판정, 코드 수정, 자동 게시, 병렬 리뷰어는 지원하지 않습니다.

## 구성과 설치

원본은 [reviewer-spec.md](reviewer-spec.md), 도구별 메타데이터는 [adapters/](adapters/)에 있습니다. 생성할 때 동일한 지침과 SHA-256 버전 식별자를 두 정의 파일에 넣습니다. 모델은 고정하지 않습니다. Claude의 `inherit`, Codex의 모델 설정 생략을 사용합니다.

Node.js 20 이상이 필요하며 새 의존성은 없습니다. 저장소 루트에서 실제 설치할 프로젝트의 기존 디렉터리를 지정합니다.

```sh
node reviewer/scripts/build-agents.mjs --project "/path/to/project"
node reviewer/scripts/build-agents.mjs --project "/path/to/project" --check
```

생성 파일:

```text
<project>/.claude/agents/code-reviewer.md
<project>/.codex/agents/code-reviewer.toml
```

내용이 같으면 재실행해도 파일을 쓰지 않습니다. 하나라도 기존 내용과 다르면 양쪽 파일 생성 전에 중단합니다. 설치 경로 내부의 심볼릭 링크는 따라가지 않습니다. 설정 파일이나 개인용 설치 위치는 변경하지 않습니다. 두 파일을 하나의 트랜잭션으로 생성하는 것은 아니므로, 쓰기 권한 문제·중간 종료 시 일부만 생성될 수 있습니다. 원인을 해결한 뒤 재실행할 수 있습니다.

기존 설치본과 다른 버전을 검토할 때는 새 임시 폴더에 생성하고 두 에이전트 파일을 각각 비교합니다. 자동 덮어쓰기나 강제 갱신 옵션은 없습니다.

```sh
reviewer_stage="$(mktemp -d)"
node reviewer/scripts/build-agents.mjs --project "$reviewer_stage"
```

생성 후 해당 도구의 새 프로젝트 세션에서 등록 여부를 확인합니다. 기존 이름의 전역 에이전트가 있으면 실제 선택된 프로젝트 정의와 지침 버전도 확인합니다. 자연어 요청만으로 실제 위임을 보장하지 않으므로 실행 기록을 확인해야 합니다.

```text
code-reviewer 서브에이전트를 호출해서 현재 미커밋 변경사항을 리뷰해 주세요.
테스트 실행은 허용하지 않습니다. 제외 경로는 <경로 목록>입니다.
```

```text
code-reviewer 서브에이전트를 호출해서 저장소 전체를 리뷰해 주세요.
최근 diff에 한정하지 말고 검토·미검토 범위를 보고해 주세요.
```

```text
code-reviewer 서브에이전트를 호출해서 인증·권한 영역을 리뷰해 주세요.
```

## 권한의 실제 한계

기본적으로 소스 조회·분석만 수행하고 테스트는 별도 허용이 있을 때만 문서화된 명령으로 실행합니다. 사용자·프로젝트 제외 경로는 요청에 전달합니다. 별도의 제외 설정 파일은 만들지 않습니다.

- Claude: Read·Grep·Glob·Bash만 허용하고 plan 모드를 지정합니다. 셸 자체는 쓰기·외부 통신이 가능한 도구이며, 부모 모드에 따라 plan 설정이 무시될 수 있습니다.
- Codex: 커스텀 에이전트는 부모 권한과 MCP를 상속합니다. 에이전트 TOML에 `sandbox_mode`를 넣어도 부모 권한을 바꾸지 못하므로 넣지 않습니다. 엄격한 제한이 필요하면 부모 세션에서 읽기 전용 샌드박스·네트워크·도구 권한을 설정해야 합니다.
- 비밀값·제외 경로 접근 금지는 공통 지침에 있습니다. 생성기가 운영체제의 읽기 접근 제어를 구성하는 것은 아닙니다. 강제 차단이 필요하면 부모 환경에서 제한해야 합니다.

권한 근거: [Codex 공식 서브에이전트 문서](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Claude 공식 서브에이전트 문서](https://code.claude.com/docs/en/sub-agents). 확인일: 2026-11-05.

## 로컬 검증

저장소 루트에서 실행합니다. TOML 파싱 검증에는 Python 3.11 이상의 표준 `tomllib`을 사용합니다.

```sh
node reviewer/tests/build-agents.mjs
python3 -I reviewer/tests/fixtures.py
```

생성 지침 일치, TOML 파싱, 재실행 시 파일 보존, 검사 모드, 기존 파일 충돌, 심볼릭 링크와 잘못된 디렉터리 차단, 특수문자 전달을 확인합니다. 예제 자체의 결함·정상 동작 확인은 모델의 결함 발견 능력 검증과 다릅니다.

2026-11-05에 위 두 명령을 Node.js 26.7.0·Python 3.14.6에서 실행해 통과했습니다. Node 검사의 최초 실행에서는 macOS 임시 경로 별칭 때문에 CLI가 실행을 건너뛰는 결함을 발견했습니다. 진입점의 실제 경로를 비교하도록 수정한 뒤 같은 검사를 통과했습니다. Node.js 20·다른 운영체제의 실행은 확인하지 않았습니다.

## 실제 실행 검증 절차

검증용 예제는 합성 데이터만 사용합니다. 모델 호출은 코드·데이터의 외부 전송을 수반하므로 별도 승인을 받은 뒤 수행합니다. 실제 저장소 대신 임시 프로젝트에 예제를 복사하고 생성한 정의를 설치합니다. 기대 결과는 아래에 있으므로 리뷰어에게 이 README를 함께 주지 않습니다.

승인된 비대화형 검증에서는 생성한 정의가 있는 실제 Git 프로젝트 루트를 작업 폴더로 지정하고 다음 CLI 형식으로 실행 기록을 수집합니다. 프롬프트는 표준 입력으로 전달합니다. 사용자 설정·외부 MCP·훅을 제외하고 코드 편집 도구를 제공하지 않습니다. Codex는 `--sandbox read-only`, Claude는 `--permission-mode plan`을 사용합니다. CLI가 자체 실행에 필요한 인증을 사용하는 것은 허용하되 자격증명 파일을 직접 열거나 복사하지 않습니다. 아래 Codex 명령은 시도한 검증 형식이며 전용 리뷰어 호출 성공을 보장하지 않습니다.

```sh
codex exec --ignore-user-config --json --color never --sandbox read-only --enable multi_agent -C "/path/to/isolated-project" -c project_doc_max_bytes=0 -c agents.enabled=true -c 'shell_environment_policy.inherit="core"' -c shell_environment_policy.ignore_default_excludes=false -c shell_environment_policy.experimental_use_profile=false -
claude -p --output-format stream-json --verbose --forward-subagent-text --no-session-persistence --permission-mode plan --permission-prompts none --tools Agent,Read,Grep,Glob,Bash --allowedTools Agent,Read,Grep,Glob,Bash --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' --settings '{"disableAllHooks":true}' --no-chrome
```

1. 각 CLI 버전과 선택 모델·권한을 기록합니다. 각 프로젝트의 파일 목록·해시와 Git 상태를 기록합니다.
2. `tests/fixtures/buggy/`를 임시 프로젝트에 복사합니다. 전체 리뷰를 요청하고 실제 `code-reviewer` 호출 기록과 지침 버전을 확인합니다.
3. 특정 영역 모드로 `invoice_response`부터 `find_invoice`까지 추적하게 합니다.
4. 변경사항 모드는 별도의 임시 Git 프로젝트에 정상 예제를 기준 커밋으로 두고, `invoices.py`만 결함 예제로 바꿔 리뷰합니다. 기준점을 보고하는지 확인합니다.
5. diff가 없는 프로젝트에서 변경사항 리뷰가 최근 커밋 리뷰로 바뀌지 않는지 확인합니다.
6. 전체 리뷰에서는 결함 예제를 기준 커밋에 포함하고 README만 변경합니다. diff 밖의 기존 소유권 결함을 발견하는지 확인합니다.
7. 정상 예제만 있는 별도 프로젝트를 리뷰합니다. 취향에 따른 결함을 만들지 않는지 확인합니다.
8. 사용자 제외 경로를 지정한 별도 실행에서 해당 경로를 도구로 열지 않고 미검토로 보고하는지 확인합니다. 실제 비밀값은 사용하지 않습니다.
9. 검사 후 파일 목록·해시와 Git 상태를 대조해 파일 생성·수정·삭제가 없는지 확인합니다. 도구 기록에서 제외 경로 접근·외부 통신·검증 명령 실행 여부도 확인합니다.

기대 결과: 결함 예제는 계정 1이 계정 2의 청구서를 ID로 조회하면 200 응답을 반환합니다. 호출자가 전달한 계정 ID를 검색 함수가 무시합니다. 정상 예제는 같은 요청에 404를 반환하며, 본인 청구서 조회는 정상 동작합니다. 함수가 짧거나 문서가 없다는 이유로 결함을 만들면 오탐으로 기록합니다.

| 환경 | 확인한 버전 | 등록·실제 위임·세 모드 | 품질·파일 무변경 |
|---|---|---|---|
| Codex 비대화형 CLI | 0.166.0 / gpt-6.1-sol | 해당 실행에서 전용 종류 선택 기능이 없어 차단 | 리뷰 품질 미검증, 시도 전후 파일·Git 상태 동일 |
| Codex Herdr 대화형 CLI | 0.166.0 / gpt-6-astra | `agent_type=code-reviewer` 실제 호출·지침 버전 일치, 전체 리뷰 1건 확인 | 합성 예제 HIGH 결함 1건 발견, 4개 파일 원본 동일. 다른 모드·정상·제외 예제 미실행 |
| Claude Code | 2.1.318 / claude-opus-5-5 | 실제 호출·세 모드 확인 | 기본 6건 확인. 보고 규칙 보완본의 영역·정상 예제 2건 재검증, 역할 보고·불필요한 제안 개선 및 파일 무변경 확인 |

이전 비대화형 추가 확인에서는 v1 모델(`gpt-5.6-luna`)의 지연 도구 선언과 로컬 모의 API로 수집한 v2 스키마에 등록 종류 선택 필드가 없었습니다. 이후 Herdr 대화형 실행에서는 같은 생성 구조로 종류 선택과 지침 자동 주입에 성공했습니다. 앞선 스키마 관찰을 모든 Codex 환경의 제한으로 일반화하지 않습니다. 모델·설정·실행 경로가 함께 달라져 어느 차이가 성공 원인인지는 미확인입니다. 자세한 근거는 [검증 기록](VALIDATION.md)에 있습니다.

## 출처

[ECC code-reviewer](https://github.com/affaan-m/ECC/blob/main/agents/code-reviewer.md)의 검토 범위·근거 중심 필터·오탐 방지 원칙을 참고했습니다. 원문·예제 코드를 복사하지 않고 공통 지침과 검증 예제를 새로 작성했습니다. ECC의 자동 호출, diff가 없을 때 최근 커밋 탐색, 줄 수 기반 심각도, 승인 판정은 채택하지 않았습니다.
