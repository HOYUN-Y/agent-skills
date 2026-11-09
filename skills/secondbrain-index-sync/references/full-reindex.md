# 전체 재색인 (내용 기반)

이 문서는 `SKILL.md`를 읽은 뒤에 쓴다. `<스킬 폴더>`는 이 문서가 있는 `references/`가 아니라 `SKILL.md`가 있는 폴더다. `SKILL.md`의 볼트 경로 결정과 절대 규칙, [색인 갱신 절차](index-update.md) 3단계의 용도 설명·중복 방지·색인 분할·주제 MOC·프로젝트별 정본 연결 규칙을 그대로 적용한다.

"전체 재색인", "내용 기준으로 다시 색인", "주제별로 다시 묶어줘" 같은 요청이나 큰 작업이 끝난 뒤(월 1회 정도)에 쓴다. 평소 갱신은 [색인 갱신 절차](index-update.md)와 [변경분 갱신](incremental-sync.md)으로 충분하다.

작업 폴더(`<work>`)는 볼트 밖 임시 폴더로 잡는다. 발췌에 개인 문서 내용이 들어가므로 끝나면 지운다. 스크립트는 볼트·원본 안의 출력 경로를 거부한다.

0. **기준 목록:** `python3 -I <스킬 폴더>/scripts/inventory.py "<볼트>"`로 자료원 상태와 제외 범위를 확인하고, `--write`로 기준 목록을 만든다. 기준 목록은 과거 자료를 검토한 이력이 아니다. 이어서 `--all --review-out "<work>/targets.tsv"`로 읽을 대상 목록(크기·수정 시각·자료원 ID 포함)을 저장한다. 목록만 다시 쓰는 재실행이면 이 단계에서 멈춘다.
1. **텍스트 발췌:** `python3 -I <스킬 폴더>/scripts/manifest.py "<볼트>" "<work>/manifest"` — `src-*`의 `.md`/`.txt` 제목·앞부분. 비공개(별칭 포함)·비밀정보 이름·개인정보 후보 이름·의존성 폴더·자료원 안의 링크는 건너뛴다. 범위를 좁히려면 `--paths "<work>/targets.tsv"`를 붙인다. 주민번호·비밀번호 형식이 보이는 텍스트는 발췌하지 않고 `sensitive-text.txt`에 경로만 남긴다.
2. **문서 발췌:** `python3 -I <스킬 폴더>/scripts/doc_manifest.py "<볼트>" "<work>/manifest"` (필요하면 `--paths`) — PDF(앞 3쪽, `pdftotext` 필요)·DOCX 본문·ODT·PPTX 슬라이드·XLSX 공유 문자열(모든 OS), DOC·RTF(macOS `textutil`만). 행은 `경로 | 추출 범위 | 발췌`다. 실패는 `failed.txt`에 상태 코드만 남는다(`tool_missing`, `timeout`, `exit_<n>`, `bad_archive`, `read_error`). 정상 변환됐지만 텍스트가 없으면 "(텍스트 없음 ...)" 행으로 남는다. Drive 파일은 다운로드가 일어나 오래 걸리므로 백그라운드로 돌린다. HWP·Pages·Keynote는 읽지 않는다.
3. **민감정보 검토:** `<work>/manifest/sensitive.txt`와 `sensitive-text.txt`(주민번호·비밀번호 형식이나 "주민등록번호" 단어가 나온 파일, 발췌 제외됨)를 파일마다 왜 걸렸는지 확인한다. 값은 출력하지 않는다.
   - 실제 개인정보·로그인 정보면 비공개 목록에 추가하고 사용자에게 보고한다. 추가 방법(라우터 비공개 줄 또는 지정 장부, `settings.json`의 `permissions.deny` 추가)은 `SKILL.md` 절대 규칙을 따른다.
   - 공고문 규정 문구·예제 비밀번호 같은 오탐은 숫자·비밀번호를 가린 발췌로 다시 넣을 수 있다.
   - 발췌 본문에서 `비밀번호:`·`PW=` 같은 줄이 새로 보이면 그 파일도 비공개 후보로 보고한다. 정규식이 모든 비밀정보를 찾는다고 보장하지 않는다.
4. **날짜 폴더 주제 분류:** 주제 없이 날짜별로만 쌓인 외부 폴더가 있으면(볼트의 `.secondbrain/topics.json`의 `source`) 날짜 구간으로 나눠(병렬 세션 가능) 폴더마다 주제를 뽑아 `<work>/topics-<구간>.tsv`로 저장한다. 열: `폴더⇥주제(;구분)⇥핵심문서(볼트 기준 경로, ;구분)⇥한 줄 설명`. 주제 이름은 `topics.json`의 `topics`/`alias`에 있는 것을 우선 쓴다. `topics.json`이 없으면 `<스킬 폴더>/templates/topics.example.json`을 참고해 첫 분류 결과로 주제 목록을 제안하고, 사용자 확인 후 만든다. 그런 폴더가 없으면 4~5단계는 건너뛴다.
5. **주제 색인 초안:** `python3 -I <스킬 폴더>/scripts/build_topics.py "<볼트>/.secondbrain/topics.json" "<work>" "<work>/drafts"` — 초안만 만들고 볼트는 쓰지 않는다. "매핑 없는 주제"가 나오면 `topics.json`의 `alias`에 추가하고 다시 만든다. 초안과 볼트의 `<index>--<주제>.md`를 비교해 새 폴더·문서만 합친다. 기존 줄에 손으로 붙인 문서 링크는 지우지 않는다.
6. **개인·공용 보강:** `personal.md`, `resources.md`는 발췌를 근거로 설명과 핵심 문서 링크를 고친다. 개인 문서는 용도만 한 줄로 적고 이름·연락처·주민번호·점수 같은 개인정보는 적지 않는다.
7. **MOC 반영:** 각 작업에서 나온 MOC 연결 후보 중 근거(본문·발췌)가 있는 것만 넣는다. 새 MOC 제안 기준은 [색인 갱신 절차](index-update.md) 3단계의 "주제 MOC"를 따른다.
8. **검토 기록:** 실제로 읽고 색인에 반영한 파일만 `targets.tsv`에서 남겨 `inventory.py "<볼트>" --mark <head|relevant|full> --from <파일>`로 기록한다. 발췌만 한 파일은 `head`, 관련 부분을 읽었으면 `relevant`, 전문을 읽었을 때만 `full`이다. 읽은 뒤 바뀐 파일은 기록되지 않고 다음 실행의 재검토 대상으로 남는다.
9. **검증·마무리:** `python3 -I <스킬 폴더>/scripts/check_index.py "<볼트>" --normalize`를 실행한 뒤 옵션 없이 다시 실행해 [색인 갱신 절차](index-update.md) 4단계 "검증" 기준을 확인한다. 특히 깨진 링크·비공개 링크·중복 0, 100줄 초과 0이어야 한다. 볼트가 git 저장소면 커밋한다. `<work>` 폴더를 지운다. 결과 보고는 같은 문서의 5단계를 따른다.

병렬 세션에 나눌 때는 세션마다 쓸 수 있는 파일을 정해 주고, MOC·라우터·목록 기준선·검토 기록은 한 곳(지휘하는 세션)에서만 고친다. 세션에는 git, `--normalize`, `inventory.py --write`·`--mark`를 금지한다.
