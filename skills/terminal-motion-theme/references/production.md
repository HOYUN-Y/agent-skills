# 제작 환경과 검증

## 목차
1. 버전과 설치
2. 결정성(같은 프레임 = 같은 화면)
3. 글꼴과 브랜드
4. 렌더 브라우저(macOS)
5. 3D(three.js)로 바꿀 때
6. 명령
7. 검증
8. 알려진 문제
9. 라이선스

## 1. 버전과 설치

템플릿 `package.json`은 버전을 고정한다: `remotion`·`@remotion/cli` 4.0.540, `react`·`react-dom` 19.3.1, `typescript` 7.0.2, `@types/react` 19.3.0. 두 영상(2026-11)에서 이 조합으로 렌더를 확인했다.

- `npm install`은 사용자 승인 후 실행한다(처음 한 번). 버전을 올리거나 새 패키지를 더하는 것도 먼저 묻는다.
- 같은 버전의 `node_modules`가 다른 프로젝트에 있으면 설치 대신 링크해도 렌더된다(`ln -s <다른 프로젝트>/node_modules node_modules`, 이 스킬의 템플릿 검증에서 사용).
- Remotion은 개인·3명 이하 조직은 무료, 4명 이상 회사는 Company License가 필요하다(게시 전 사용자 상황 확인).

## 2. 결정성(같은 프레임 = 같은 화면)

Remotion은 프레임을 여러 탭에서 **순서 없이** 렌더한다. 그래서:

- 모든 값은 `useCurrentFrame()`의 순수 함수다. 직전 프레임 상태, 누적 변수, `useState`로 시간을 세지 않는다.
- `Date.now()`, `Math.random()`, `performance.now()`, 네트워크를 쓰지 않는다. 무작위는 `remotion`의 `random('고정 문자열')`.
- 무거운 계산(그래프 생성, 이름표 자리, 디더 띠)은 모듈을 불러올 때 한 번 하거나 입력(크기)별로 캐시한다. 캐시도 입력만으로 결정돼야 한다.
- 누적이 필요한 값(카메라 이동, 세어 올라가는 수치)은 "시점 목록을 처음부터 다시 훑는" 함수로 만든다(`PixelNetwork.camAt`, `Chrome.metricValue`).
- 확인: 같은 프레임을 `remotion still`로 따로 뽑아 영상의 같은 프레임과 비교한다(PSNR 35dB 이상이면 같은 화면, JPEG·H.264 손실만 있음).

## 3. 글꼴과 브랜드

- `new_project.sh`가 insight-design-theme 스킬의 `assets/fonts/web/`에서 10개(Pretendard 400·600·700, JetBrains Mono 400·600·700, Silkscreen 400·700, Galmuri11 400·700)와 라이선스를 `public/fonts/`로 복사한다. 그 스킬에 글꼴이 없으면 `python3 -I <insight-design-theme>/scripts/fetch_fonts.py`(인터넷 필요).
- `src/lib/fonts.ts`가 모든 글꼴을 불러온 뒤에 렌더를 시작하고(`delayRender`), 하나라도 실패하면 렌더를 멈춘다(`cancelRender`). 대체 글꼴로 조용히 렌더되지 않게 하기 위해서다.
- 브랜드 이름·핸들·태그라인은 `src/data/brand.json`(insight-design-theme `assets/brand.json` 사본). `handlePlaceholder: true`면 게시 전에 실제 핸들로 바꾼다. 브랜드가 바뀌면 프로젝트의 사본도 다시 복사한다.

## 4. 렌더 브라우저(macOS)

- `npm run setup:browser` = `npx remotion browser ensure`(Chrome Headless Shell 내려받기) + `~/Library/Caches/terminal-motion/`으로 복사. `remotion.config.ts`가 그 사본을 먼저 쓴다.
- 이유: `~/Documents` 같은 보호 폴더 안의 Chrome이 `icudtl.dat` 접근 실패로 렌더에 실패한 적이 있다.
- 다른 위치의 브라우저를 쓰려면 `REMOTION_BROWSER_EXECUTABLE=<경로>`.
- 렌더가 `Target closed`(`GPU process exited`)로 멈추면 그 사본이 아직 없어 보호 폴더 쪽 Chrome을 쓴 것이다. `npm run setup:browser`를 다시 하거나 위 변수로 `~/Library/Caches` 안의 사본을 가리킨다.

## 5. 3D(three.js)로 바꿀 때

새 의존성(`three`, `@types/three`)이므로 사용자 승인 후 버전을 고정해 설치한다(세컨드 브레인 영상: 0.187.0, MIT).

- `remotion.config.ts`의 `Config.setChromiumOpenGlRenderer('angle')`이 있어야 헤드리스 Chrome에서 WebGL이 그려진다(템플릿에 이미 있음).
- 렌더러: `preserveDrawingBuffer: true`, 그리기는 `useLayoutEffect` 안에서 그 프레임 상태로 한 번. 렌더러·장면은 캔버스 크기별로 하나 만들어 재사용한다.
- 회전·카메라·강조·신호는 모두 프레임 함수로(2절). 실시간 시계로 움직이는 원본 코드(애니메이션 루프, `clock.getDelta()`)는 그대로 쓸 수 없다.
- 마무리 픽셀 출발점은 노드의 3D 위치를 화면에 투영해 `heroPoints`처럼 내준다.
- 렌더 시간 참고: 복셀 5,000개, 1920×1080 600프레임 약 14초(Apple Silicon).

## 6. 명령

| 명령 | 하는 일 |
|---|---|
| `npm run studio` | 미리보기(브라우저). 두 Composition을 오가며 본다 |
| `npm run typecheck` | 타입 검사 |
| `npm run check:fit` | 화면 글자 넘침 어림(`src/check/fit.ts`, 두 화면비). 넘치면 종료 코드 1. Remotion에 딸린 esbuild로 실행(새 의존성 아님) |
| `npm run stills [-- 폴더 프레임...]` | 두 화면비 정지 프레임(기본 0·130·230·430·480·599) → `out/stills/` |
| `npm run draft` | 절반 크기 초안 두 개 |
| `npm run render` | 최종 두 개(`out/video_1920x1080.mp4`, `out/video_1080x1920.mp4`, 이름은 주제에 맞게 바꾼다) |
| `npx remotion still src/index.ts Portrait out/f.png --frame=252` | 한 프레임 |

렌더 시간 참고(템플릿, Apple Silicon): 각 화면비 600프레임 약 12초, 용량 가로 약 5.5MB · 세로 약 4.1MB.

## 7. 검증

1. `npm run typecheck`, `npm run check:fit`(부품 배치를 바꿨으면 `fit.ts`의 폭 계산도 맞춘다)
2. 정지 프레임을 **모두 열어** 본다: 겹침, 잘린 글자, 빈 창, 세로 안전 영역 밖 글자, 금색이 두 뜻으로 쓰였는지.
3. 렌더 후 `check_video.py`:
   - `--expect 1920x1080@30:600`: 해상도·fps·프레임 수가 다르면 종료 코드 1.
   - 튐 후보: 앞 프레임과의 차이가 주변의 3배 이상인 프레임. 단계 제목 교체·줄 삽입은 의도한 변화다. 나머지는 프레임을 열어 direction.md 11절과 대조한다.
   - `--sheet`: 1초 간격 20장 접촉 시트. 흐름과 체류 시간을 한눈에 본다.
4. 화면 문장·수치를 브리프·원본과 다시 맞춘다(모의 데이터 표시 포함).
5. 정지 프레임과 접촉 시트로 "움직임"을 다 검증했다고 말하지 않는다. 실제 재생 확인을 했는지 보고에 적는다.
6. 독립 검수가 필요하면 inspecting-vibe(영상·모션 기준)에 영상 경로·브리프·화면비 목적을 넘긴다. 9:16은 휴대폰 크기 판독성을 평가에 넣는다.

## 8. 알려진 문제

- ffmpeg 빌드에 `drawtext`가 없을 수 있다. 접촉 시트는 `select`+`tile`만 쓴다(`check_video.py`).
- zsh에서 없는 파일 패턴(`rm out/*.png`)은 오류로 멈춘다. `find ... -delete`를 쓴다.
- `logo.tsx`의 `getContext('2d', {willReadFrequently: true})`는 경고를 줄이기 위한 것이다. 지우지 않는다.
- 세로 영상의 문서 창은 줄이 많으면 지금 보는 줄 쪽으로 한 줄씩 내려간다(터미널처럼 끊어서 이동).

## 9. 라이선스

| 구성 요소 | 라이선스 |
|---|---|
| remotion, @remotion/cli 4.0.540 | Remotion License(개인·3명 이하 무료, 4명 이상 회사는 Company License) |
| react, react-dom 19.3.1 | MIT |
| typescript 7.0.2 / @types/react | Apache-2.0 / MIT(개발용) |
| Chrome Headless Shell | Chromium 라이선스 |
| Pretendard, JetBrains Mono, Silkscreen, Galmuri11 | SIL OFL 1.1(`public/fonts/licenses/`) |
| Artificial Insight 로고·브랜드 | 사용자 소유(insight-design-theme `pixel.js` 좌표, 눈 대칭 보정) |
