# Terminal 모션 영상 (Remotion)

terminal-motion-theme 스킬의 템플릿으로 만든 프로젝트다. 같은 소스에서 16:9(`Landscape`)와 9:16(`Portrait`) 영상을 낸다. 연출 기준은 스킬의 `references/direction.md`, 환경·검증은 `references/production.md`.

- 출력: 1920×1080 · 1080×1920, 30fps, 600프레임(20초), H.264, 무음
- 예시 주제(바꿀 것): 가상 저장소의 릴리스 점검 에이전트 4개 — 01 SCAN → 02 TEST → 03 SHIP → 로고 마무리. 모든 파일명·수치는 모의 데이터다.

## 실행

```bash
npm install            # 처음 한 번(사용자 승인 후)
npm run setup:browser  # Chrome Headless Shell → ~/Library/Caches/terminal-motion
npm run studio         # 미리보기
npm run typecheck
npm run check:fit      # 문구가 화면 자리에 들어가는지(넘치면 문장을 줄인다)
npm run stills         # 두 화면비 정지 프레임 → out/stills/
npm run draft          # 절반 크기 초안
npm run render         # 최종 두 개 → out/
```

## 수정 지점

| 파일 | 역할 |
|---|---|
| `src/config/timeline.ts` | 모든 사건의 프레임 — **타이밍** |
| `src/data/scenario.ts` | 모드(`video.mode`: demo/record)·제목·주체·수치·목록·문서·명령 결과·로그·마무리 한 줄 — **문구·데이터** |
| `src/data/hero.ts` | 주인공 시각물 종류(`heroKind`)와 픽셀 네트워크: 묶음, 이름 붙은 노드, 강조 구간, 금색 흐름, 카메라 — **연출** |
| `src/data/pipeline.ts` | 단계 파이프라인(`heroKind: 'pipeline'`): 단계, 구간, 표시 |
| `src/data/brand.json` | 브랜드 이름·핸들·태그라인(insight-design-theme 사본) |
| `src/config/layout.ts` | 화면비별 배치·글자 크기·안전 영역 — **배치** |
| `src/config/theme.ts` | 테마 색·글꼴(바꾸지 않음), 데이터 색(승인된 예외) |
| `src/components/` | 창(`Panel`), 머리줄·제목·카드·띠(`Chrome`), 내용 창(`Windows`), 주인공 시각물(`Hero` → `PixelNetwork`·`PixelPipeline`), 마무리(`FinaleLogo`) |
| `src/check/fit.ts` | 문구 넘침 검사(`npm run check:fit`). 부품 배치를 바꾸면 폭 계산도 맞춘다 |
| `src/lib/` | 움직임 어휘(`anim`), 로고 래스터화(`logo`, 눈 대칭 보정 — 바꾸지 않음), 글꼴 불러오기(`fonts`) |

## 원칙

- 모든 변화는 `useCurrentFrame()` 기반. `Date.now()`·`Math.random()`·네트워크 금지(무작위는 `random(seed)`).
- 금색은 "지금 일하는 곳" 한 뜻. 모의 데이터면 `DEMO · SIMULATED DATA`를 유지하고, 실제 기록이면 `video.mode: 'record'`로 두고 화면 수치마다 출처를 아래 표에 적는다. 순서·명령을 재구성했으면 배지에 `순서 재구성`을 쓰고 표에도 표시한다.
- 세로 영상은 위 220 · 아래 420 · 오른쪽 140px에 읽을 글자를 두지 않는다(릴스 UI).
- 번호는 단계 제목에만. 카드·파이프라인 블록은 같은 이름, 머리줄 수치로 단계를 다시 세지 않는다.
- 세로 글자는 본문 34px·보조 28px 아래로 줄이지 않는다(넘치면 문장을 줄인다).

## 화면 수치 출처(record 모드)

| 화면 문구 | 출처(파일:줄) | 재구성 여부 |
|---|---|---|

## 확인 필요

- `src/data/brand.json`의 `handlePlaceholder`가 true면 게시 전 핸들을 바꾼다.
