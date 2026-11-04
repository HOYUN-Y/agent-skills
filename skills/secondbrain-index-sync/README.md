# secondbrain-index-sync

Claude Code와 Codex에서 함께 쓰는 세컨드 브레인 색인 스킬입니다. 원본 자료는 옮기지 않고, 볼트 최상위의 안내 문서만 관리합니다.

- **라우터** `CLAUDE.md`: 영역 색인, 외부 자료 폴더, 주제 MOC, 운영 규칙, 비공개 목록
- **영역 색인** `work.md`, `personal.md` 등. 100줄이 넘으면 `<색인>--<주제>.md`로 나눕니다.
- **주제 MOC** `moc-<주제>.md`: 업무와 개인 자료를 주제로 묶습니다.
- **프로젝트 안내** `project-<이름>.md`: 문서·코드·규칙표 정본과 상태·변경기록을 짧게 연결합니다.
- **외부 자료** `src-<이름>`: Drive나 다른 폴더의 원본을 가리키는 심볼릭 링크입니다.

## 설치

**방법 1: skills CLI (간단)**

```sh
npx skills add HOYUN-Y/agent-skills -g
```

목록에서 `secondbrain-index-sync`를 선택합니다. 설치한 뒤 에이전트에게 "세컨드 브레인 설정해줘"라고 하면 볼트 위치를 묻고 라우터를 만듭니다.

**방법 2: clone (업데이트는 `git pull`)**

```sh
git clone https://github.com/HOYUN-Y/agent-skills.git
cd agent-skills/skills/secondbrain-index-sync
./install.sh ~/second-brain                                    # macOS·Linux
powershell -ExecutionPolicy Bypass -File install.ps1 C:\second-brain   # Windows
```

`~/.claude/skills`와 `~/.agents/skills`에 이 폴더로 가는 링크를 만듭니다. Windows에서는 정션을 쓰므로 관리자 권한이 필요 없습니다. 볼트 경로는 `~/.config/secondbrain-index-sync/vault`에 저장됩니다. 경로를 생략하면 처음 사용할 때 에이전트가 묻습니다.

## 사용

| 요청 | 동작 |
|------|------|
| "색인 갱신" | 바뀐 자료를 찾아 색인과 MOC에 반영합니다. 링크 점검도 함께 합니다. |
| "전체 재색인" | 문서 내용을 발췌해 색인 설명과 주제 묶음을 다시 만듭니다. |

날짜별로만 쌓인 폴더를 주제별로 묶을 때는 볼트에 `.secondbrain/topics.json`을 둡니다. 형식은 `templates/topics.example.json`을 참고하세요.

## 요구 사항

- Python 3.8 이상 (표준 라이브러리만 사용). macOS, Linux, Windows에서 동작합니다.
- 전체 재색인의 문서 발췌:
  - DOCX, ODT, PPTX, XLSX: 추가 설치 필요 없음
  - PDF: `pdftotext` (poppler. `brew install poppler`, `apt install poppler-utils`, Windows는 `scoop install poppler`)
  - DOC, RTF: macOS `textutil`만 지원
  - 도구가 없는 형식은 실패 목록에 들어갑니다.

## 안전 규칙

- 원본은 이동하거나 수정하거나 삭제하지 않습니다.
- 라우터의 "비공개" 줄에 적힌 경로와 명시적으로 지정한 `.secondbrain/private-paths.txt` 장부의 합집합 및 그 하위는 읽지 않습니다. 장부는 선택 기능이며 기존 볼트는 자동 전환하지 않습니다.
- 장부는 라우터에 `- 비공개 장부: .secondbrain/private-paths.txt`로 지정하고(실제 줄에는 백틱 없음), UTF-8 상대경로를 한 줄씩 씁니다. 장부만 남거나 표식을 해석하지 못하는 경우, 지정 장부가 누락·읽기 실패·잘못된 경로이면 자료 탐색 전에 중단합니다. Codex도 검색 전에 장부를 확인해야 하며 Claude 차단 설정도 유지합니다.
- `.env`, 키, 토큰처럼 보이는 파일 이름은 열지 않습니다. 처음 설정할 때 볼트에 `.claude/settings.json`을 만들어 Claude Code가 이런 파일을 읽거나 `src-` 원본을 고치는 것을 막습니다. Codex에는 적용되지 않습니다.
- 주민번호나 비밀번호 형식이 보이는 문서는 발췌하지 않고 따로 표시합니다.

## 테스트

```sh
python3 -I scripts/check_index.py --selftest
python3 -I scripts/manifest.py --selftest
python3 -I scripts/doc_manifest.py --selftest
python3 -I scripts/build_topics.py --selftest
```
