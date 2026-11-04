# Agent Skills

Codex와 Claude Code에서 사용하는 개인 스킬 7개를 한곳에서 관리합니다. 기존 6개 저장소의 최신 파일을 가져왔으며 스킬 이름과 기능은 유지합니다.

| 스킬 | 용도 |
|---|---|
| [inspecting-vibe](skills/inspecting-vibe/SKILL.md) | 웹·그래픽·영상 품질을 별도 에이전트로 검수하고 반복 개선 |
| [motion-web-builder](skills/motion-web-builder/SKILL.md) | 모션 중심 웹 설계·구현·검증 |
| [herdr-workflow](skills/herdr-workflow/SKILL.md) | Herdr의 터미널·에이전트 협업 및 초기 설정 |
| [changelog-update](skills/changelog-update/SKILL.md) | 변경 파일을 바탕으로 일별 작업 기록 갱신 |
| [changelog-verify](skills/changelog-verify/SKILL.md) | 원본과 대조해 기록 누락 검증·보강 |
| [ai-use-case-research](skills/ai-use-case-research/SKILL.md) | 브라우저로 AI 활용 사례 조사 |
| [secondbrain-index-sync](skills/secondbrain-index-sync/SKILL.md) | 세컨드브레인 색인·주제 연결 관리 |

## 설치와 갱신

```sh
git clone https://github.com/HOYUN-Y/agent-skills.git
cd agent-skills
```

원하는 `skills/<스킬 이름>/` 폴더 전체를 설치합니다. Codex 설치 위치는 `${CODEX_HOME:-$HOME/.codex}/skills`, Claude Code는 `~/.claude/skills`입니다. 기존 `~/.agents/skills` 설치도 확인해 같은 이름을 중복 설치하지 마세요. 호출은 Codex의 `$스킬이름`, Claude Code의 `/스킬이름`입니다.

개발 중인 원본을 바로 사용하려면 아래처럼 링크합니다(macOS/Linux). 저장소 루트에서 실행하세요. 기존 설치본이 있으면 먼저 내용과 개인 설정을 비교하고, 덮어쓰지 마세요.

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.claude/skills"
codex_target="${CODEX_HOME:-$HOME/.codex}/skills/inspecting-vibe"
if [ ! -e "$codex_target" ] && [ ! -L "$codex_target" ]; then
  ln -s "$PWD/skills/inspecting-vibe" "$codex_target"
fi
claude_target="$HOME/.claude/skills/inspecting-vibe"
if [ ! -e "$claude_target" ] && [ ! -L "$claude_target" ]; then
  ln -s "$PWD/skills/inspecting-vibe" "$claude_target"
fi
```

링크 설치는 `git pull --ff-only` 후 변경이 반영되지만, 커밋 전 수정과 브랜치 전환도 즉시 영향을 줍니다. 안정적인 버전이 필요하면 폴더를 복사하고 갱신 시 기존 내용과 비교하세요. 실행 중인 에이전트가 이미 읽은 지침은 새 세션에서 다시 확인하세요. Windows 설치는 스킬 폴더 전체를 복사할 수 있습니다.

### 스킬별 추가 설정

- **changelog:** 두 스킬을 같은 설치 디렉터리에 나란히 둡니다. 아래 기존 설치기는 복사 설치하며 이미 설치되어 있으면 중단합니다. 작업 폴더 설정은 설치본에만 저장됩니다.

  ```sh
  python3 install-changelog.py --skills-dir "$HOME/.claude/skills" --target-root "/path/to/work folder"
  ```

  작업 폴더 지정은 첫 실행에 할 수도 있습니다. `cron-run.sh`는 Claude CLI를 호출하는 별도 자동 실행 도구이며 설치만으로 실행되거나 스케줄러가 등록되지 않습니다. 기존 개인 설치본의 작업 폴더·스케줄 설정을 보존하세요.
- **secondbrain:** [기존 설치·사용 안내](skills/secondbrain-index-sync/README.md)를 따릅니다. `install.sh`/`install.ps1`은 기존 링크와 볼트 설정을 변경할 수 있으므로 검토 후 실행하세요. 이 통합 작업에서는 볼트를 초기화하지 않습니다.
- **herdr:** [초기 설정 안내](skills/herdr-workflow/references/setup.md)를 따릅니다. 단순 링크 설치는 세션 시작 지침이나 훅을 변경하지 않습니다.
- **motion:** 캡처 도구의 런타임 요구는 스킬 지침을 따릅니다. 포함된 엔진의 [출처](skills/motion-web-builder/engine/UPSTREAM.md)와 [라이선스](skills/motion-web-builder/engine/LICENSE)를 유지합니다.
- **research:** 브라우저 제어 도구가 필요합니다. 플랫폼 접근과 로그인 상태에 따라 확인 범위가 달라집니다.

## 검증

기존 저장소의 테스트를 위치만 맞춰 실행합니다. Python·Node.js 표준 모듈을 사용합니다.

```sh
python3 tests/check_portability.py
bash -n skills/changelog-update/scripts/changed-files.sh
bash -n skills/changelog-update/scripts/cron-run.sh
bash -n skills/changelog-verify/scripts/check-detail.sh
node skills/motion-web-builder/tests/video-hero.mjs
python3 -I skills/secondbrain-index-sync/scripts/check_index.py --selftest
python3 -I skills/secondbrain-index-sync/scripts/manifest.py --selftest
python3 -I skills/secondbrain-index-sync/scripts/doc_manifest.py --selftest
python3 -I skills/secondbrain-index-sync/scripts/build_topics.py --selftest
```

GitHub Actions에서 세컨드브레인의 기존 운영체제별 자체 테스트와 설치 검증을 유지합니다. 모션·changelog 검사도 자동 실행합니다. 이 검사는 실제 웹 화면·영상 재생·에이전트의 반복 수행을 대신하지 않습니다.

## 이전 출처와 이력

정확한 원본 커밋과 경로는 [이전 출처 목록](docs/import-sources.json), 변경·검증 기록은 [작업 기록](WORKLOG.md)에 있습니다. 과거 Git 이력은 기존 저장소에 남기고 파일만 통합했습니다. 기존 저장소는 삭제하거나 보관 처리하지 않았습니다. 전체에 새로운 라이선스를 부여하지 않으며 포함된 제3자 라이선스·출처를 그대로 유지합니다.
