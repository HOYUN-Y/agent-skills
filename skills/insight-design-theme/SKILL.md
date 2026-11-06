---
name: insight-design-theme
description: "Artificial Insight 브랜드 디자인 테마(네이비·슬레이트, 흩어진 픽셀이 모여 하나가 되는 모티프)를 공유용 자료에 입힌다. 원본 자료를 섹션과 블록(문단, 목록, 강조, 인용, 큰 숫자, 단계, 요점, 표, 코드·프롬프트)으로 정리해 A4 PDF, 인스타그램 4:5 카드 이미지, 16:9 PowerPoint를 Mosaic(밝은 점 격자)·Terminal(다크 픽셀) 스타일로 빌드하고 넘침·복사 품질·개인정보 노출을 검사한다. 테마 정의 문서(색·글꼴·지면·모티프)도 제공한다. '인스타에 올릴 카드로 만들어줘', '우리 스타일로 PDF 만들어줘', '구현 과정·프롬프트 자료', '발표용 PPT로도', 'B/C 스타일', '모자이크·터미널 스타일', 'Artificial Insight 템플릿·테마' 같은 요청에 사용한다. 기존 PDF·PPT를 읽거나 고치는 일, 브랜드와 무관한 일반 문서·슬라이드에는 사용하지 않는다."
---

# Artificial Insight 디자인 테마

Artificial Insight의 공유 자료(인스타그램·X 게시물, 내려받는 PDF, 발표 자료)에 같은 얼굴을 입힌다. **테마는 고정, 내용은 자유**다. 템플릿이 디자인을 맡으니 시간은 내용 파일(doc.json)과 확인에 쓴다. 지킬 것은 두 가지다. 독자가 **코드·프롬프트를 복사해 그대로 쓸 수 있어야** 하고, 공개 게시물이므로 **원본과 다른 사실이 없어야** 한다.

## 출력과 스타일

| 형식 | 용도 | 결과 |
|---|---|---|
| `cards` | 인스타그램 게시물(캐러셀) | 4:5 PNG(1080×1350) 묶음 + 카드 PDF |
| `pdf` | 내려받아 읽는 자료(링크·DM 배포, 인쇄) | A4 세로 PDF |
| `ppt` | 발표·화면 공유 | 16:9 PowerPoint(글자는 편집 가능, 발표자 노트는 섹션 `speaker`로 선택) |

- **mosaic**(시안 B): 밝은 슬레이트 점 격자, 디더링이 네이비 면으로 합쳐짐. 에디토리얼·인쇄물 느낌.
- **terminal**(시안 C): 다크 네이비, 한글 픽셀 제목, 터미널 모티프. 휴대폰 화면에서 눈에 띔.

형식이나 스타일 지정이 없으면 한 번 묻는다. 답을 기다릴 상황이 아니면 "인스타" → `cards`, "PDF·자료" → `pdf`, "발표" → `ppt`로 하고, 스타일은 `pdf`·`ppt`면 mosaic, `cards`면 terminal로 만든 뒤 그렇게 했다고 알린다. 같은 doc.json으로 다른 형식도 바로 만들 수 있다.

테마의 색·글꼴·지면·픽셀 모티프 정의는 [references/theme.md](references/theme.md). 템플릿이 없는 매체(웹 페이지, 썸네일)에 적용할 때도 이 문서를 따른다.

## 작업 순서

진행하며 이 목록을 복사해 체크한다.

```
- [ ] 1. 원본 자료 읽기
- [ ] 2. doc.json 작성 (references/content.md)
- [ ] 3. 검사: python3 -I scripts/lint_content.py doc.json
- [ ] 4. 빌드: scripts/build.sh doc.json <스타일> <형식> <출력 폴더>
- [ ] 5. 모든 페이지 미리보기 + 넘침·복사·노출 검사 결과 확인
- [ ] 6. 원본과 다시 대조
- [ ] 7. 보고
```

1. **원본 자료 읽기.** 끝까지 읽고, 무엇이 실제로 확인됐고 무엇이 계획·추정인지 구분해 둔다(예: 결과가 초안이면 "완성했다"고 쓰지 않는다).
2. **doc.json 작성.** 반드시 [references/content.md](references/content.md)를 읽고 쓴다. 내용을 섹션으로 나누고, 섹션마다 맞는 블록을 고른다. 코드·프롬프트는 요약하지 말고 원문을 옮기며, 빼는 부분은 `··· 생략:` 줄로 표시한다. 예시: [assets/examples/prompt-kit.json](assets/examples/prompt-kit.json)(프롬프트 자료), [assets/examples/showcase.json](assets/examples/showcase.json)(모든 블록). 파일은 사용자 작업 폴더(원본 옆)에 둔다.
3. **검사.** `python3 -I scripts/lint_content.py doc.json`. 오류(개인 경로·이메일·키, 해설 번호 짝, 필수 항목, 알 수 없는 블록)는 고친 뒤에만 빌드한다. 경고는 읽고 판단한다.
4. **빌드.** 출력 폴더는 사용자 작업 폴더 안(예: `<자료 폴더>/insight-docs/`).
   ```sh
   python3 -I scripts/fetch_fonts.py                         # 처음 한 번(스킬 폴더 안에 웹 글꼴 저장·코드 글꼴 복사 보정, 인터넷 필요)
   scripts/build.sh doc.json terminal cards <출력 폴더>      # 인스타 카드
   scripts/build.sh doc.json mosaic pdf <출력 폴더>          # A4 PDF
   scripts/build.sh doc.json mosaic ppt <출력 폴더>          # PPT(요청했을 때만)
   ```
   경로는 이 스킬 폴더 기준이다(Claude Code에서는 `${CLAUDE_SKILL_DIR}`). PPT에 필요한 npm 패키지·글꼴 설치는 사용자 승인 후에만 한다([references/formats.md](references/formats.md) 1절). 종료 코드 3은 넘침 경고다(3절).
5. **확인.** `preview/`의 PNG를 **모든 페이지** 직접 본다. 겹침·잘린 글자·거의 빈 페이지·혼자 남은 줄을 찾는다. 넘침 경고가 없고, 복사 검사(`check_pdf_text.py`)·PPT 점검(`check_pptx.py`)이 "문제 0개"인지 본다. 카드는 20장 이하인지 본다. 문제가 나오면 [references/formats.md](references/formats.md)의 해당 절대로 doc.json을 고치고 다시 빌드한다.
6. **원본 대조.** 렌더된 문장(특히 일반화한 요점, 큰 숫자, 표지 부제)을 원본과 한 번 더 맞춰 본다. 다듬으면서 새로 쓴 문장이 원본과 반대가 되는 일이 실제로 있었다.
7. **보고.** 아래 형식.

## 보고 형식

- 결과 파일 경로, 형식·스타일, 페이지(장) 수
- 검사 결과: 내용 검사 경고, 넘침 경고, 복사·노출 검사 문제 수, PowerPoint 확인 여부
- 원문에서 생략·가린 부분과 그 이유
- 사용자 확인이 필요한 것: 임시 핸들(`assets/brand.json`의 `handlePlaceholder`), 직접 쓴 공개 문구(표지·요점·강조), 확인하지 못한 사실
- 하지 않은 것(예: 실제 휴대폰 업로드 확인, 독립 검수)

더 엄격한 디자인 확인이 필요하면 별도 검수 에이전트(예: `inspecting-vibe` 스킬)를 제안한다.

## 하지 말 것

- 코드·프롬프트를 바꿔 쓰거나 요약해 "원문"처럼 싣기. 발췌면 발췌로 표시된다(`excerpt`).
- 원본에 없는 사실 만들기: 버전, 완료 여부, 수치, 후기, 실제로 없는 명령·파일.
- 로컬 경로·이메일·키를 문서에 넣기. 검사기가 막지만, 이미지·파일명에도 들어가지 않게 한다.
- 테마 밖의 색·글꼴 쓰기, 한 문서에 두 스타일 섞기.
- 승인 없이 글꼴을 시스템에 설치하거나 npm 패키지를 스킬 밖에 설치하기.
- PowerPoint를 강제 종료하기. 멈추면 사용자에게 부탁한다.
- 템플릿(`assets/web/*.html`, `kit.js`, `deck.js`)을 일회성 요청 때문에 고치기. 블록 조합으로 해결되지 않는 디자인 문제는 사용자에게 알리고 템플릿 수정 여부를 묻는다.

## 파일

| 경로 | 역할 |
|---|---|
| `references/theme.md` | 테마 정의: 로고, 색, 글꼴·크기, 지면, 픽셀 모티프, 블록 모양, 다른 매체 적용 |
| `references/content.md` | doc.json 구조, 블록, 원문 발췌, 사실 확인, 문체 |
| `references/formats.md` | 형식별 준비·빌드·페이지 나눔·확인·문제 해결 |
| `scripts/build.sh` | 빌드 입구(pdf·cards는 직접, ppt는 `build_ppt.sh`) |
| `scripts/lint_content.py` | 내용 검사(`--selftest` 자체 테스트) |
| `scripts/check_pdf_text.py`, `scripts/check_pptx.py` | 복사 품질·노출 검사 |
| `scripts/fetch_fonts.py` | 글꼴 받기·검증, 코드 글꼴 복사 보정본 만들기(`--desktop`, `--check`, `--selftest`) |
| `scripts/pdf2png.swift`, `scripts/pdf_fonts.py` | PDF 페이지 PNG·추출 텍스트, 내장 글꼴 목록 |
| `assets/web/` | PDF·카드 템플릿(`mosaic.html`, `terminal.html`, `kit.js` 블록 배치, `pixel.js` 픽셀 그래픽, `base.css` 색·글꼴 변수) |
| `assets/ppt/` | PPT 생성(`deck.js`, `assets.html`, 고정 버전 `package.json`) |
| `assets/examples/` | 예시 doc.json(`showcase`는 테마 견본) |
| `assets/brand.json` | 브랜드 이름·핸들·태그라인 |
| `assets/fonts/fonts.json` | 글꼴 주소·검증값, `licenses/`에 라이선스 |
