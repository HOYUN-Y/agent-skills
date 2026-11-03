# 스크롤 엔진 (내장 scrollcraft) 사용 지침

스크롤이 페이지의 주된 진행 방식일 때 읽는다. 단순한 viewport 진입 등장은
[motion-patterns.md §E](motion-patterns.md)의 CSS/WAAPI 방식으로 충분하며 이 엔진을 강제하지 않는다.

이 스킬은 `engine/scrollcraft.js`와 `engine/scrollcraft.css`를 내장한다. 출처, 버전, 가져오지 않은
범위는 [engine/UPSTREAM.md](../engine/UPSTREAM.md)에 있다. 원본의 디자인 취향 규칙(장치 종류 수,
색·발광·레이아웃 기준, 사이트 레지스트리)은 가져오지 않았으므로 아래 내용은 **기계적 계약과
검증 절차**만 다룬다. 시각적 선택은 사용자 요구와 이 스킬의 설계 절차를 따른다.

## 목차

- 엔진이 하는 일과 하지 않는 일
- 설치와 마운트
- act: 스크롤 시간의 단위
- 장치(device): `p`가 구동하는 것 — cue 계약 / 클립 시간 ≠ cue 시간 / 플레이헤드 보간 / 장치별 주의
- 동작 감소
- 모바일
- 검증 절차 — 서버 확인 / 결과물 / 검사 도구가 보고하는 것 / 도구의 한계 / 수동 확인
- 자주 겪은 실패
- 완료 보고에 적을 것

## 엔진이 하는 일과 하지 않는 일

- 순수 JS, 의존성 0, DOM 생성 없음. 의미 있는 HTML을 직접 쓰고 `data-sc-*` 속성으로 표시하면
  엔진이 하나의 스크롤 값과 하나의 rAF 루프로 구동한다.
- 엔진은 페이지를 만들어 주지 않는다. 구조·문구·스타일은 페이지 쪽 책임이다.
- `.sc-stage`, `.sc-copy` 등 `[data-sc-*]`에 걸린 스타일은 동작 장치이므로 취향으로 재정의하지
  않는다. 페이지 고유 클래스에 스타일을 쓴다.
- CSS 토큰(`--sc-canvas`, `--sc-surface`, `--sc-ink`, `--sc-ink-soft`, `--sc-accent`,
  `--sc-accent-ink`, `--sc-font-display`, `--sc-font-text`)만 덮어쓰면 브랜드가 바뀐다.

## 설치와 마운트

빌드 폴더에 두 파일을 **복사**해서 쓴다. 스킬 폴더를 상대 경로로 참조하지 않는다.

```html
<link rel="stylesheet" href="scrollcraft.css">
…
<script src="scrollcraft.js"></script>
<script>ScrollCraft.mount(document.body);</script>
```

- `ScrollCraft.mount(root, opts)`는 인스턴스를 반환하고 `ScrollCraft.instances`에 등록한다.
- 클라이언트 라우터처럼 다시 마운트하는 환경에서는 반환값의 `destroy()`를 먼저 호출해
  리스너·rAF 루프·관찰자·Blob URL을 해제한다. 호출하지 않으면 재마운트마다 누적된다.
- `ScrollCraft.reduce`는 마운트 시점의 동작 감소 여부다.
- `file://`에서는 클립 Blob fetch가 막혀 포스터만 보인다. 반드시 서버로 띄운다(아래 검증 참조).

## act: 스크롤 시간의 단위

```html
<section data-sc-act="pin" data-sc-span="2.5">
  <div data-sc-stage> … </div>
</section>
```

| 속성 | 의미 |
|---|---|
| `data-sc-act` | `scrub` \| `pin` \| `pan` \| `flow` (기본 `flow`) |
| `data-sc-span` | 고정형(scrub/pin/pan) act가 차지하는 스크롤 길이, 뷰포트 높이 단위. 기본 1.5. 엔진이 바깥 높이를 설정하고 첫 `[data-sc-stage]`를 sticky로 고정 |
| `data-sc-dwell` | 0~0.6. 진행률을 중앙에서 느리게, 가장자리에서 빠르게 재매핑 |
| `data-sc-drift` | act가 화면에 있는 동안 페이지 배경을 이 색으로 보간 |
| `data-sc-clip-map="travel"` | 클립 시간을 고정 구간에만 매핑하는 옛 방식. 거의 쓸 이유가 없음 |
| `data-sc-lerp` | 플레이헤드 보간 비율 0.02~1. 마운트 루트 또는 개별 `<video>`에 지정. 기본 0.18 |

모든 act는 진행률 `p`(0~1)를 자기 요소의 `--sc-p` CSS 변수로 공개한다. 제공 장치로 안 되는
효과는 CSS `calc()`로 `--sc-p`를 읽어 직접 구동한다.

- 고정형: `p = (y - top) / (height - vh)`
- flow: `p = (y + vh - top) / (height + vh)`

**고정형 act의 최소 span은 약 1.2.** 1 이하이면 이동 거리가 1px이 되어 모든 cue·reveal이
0→1로 튄다. 한 화면 미만의 진행이면 `flow` act로 만든다.

## 장치(device): `p`가 구동하는 것

| 속성 | 대상 | 동작 |
|---|---|---|
| `data-sc-scrub` + `data-sc-src` (+`data-sc-src-mobile`) | `<video>` | `p`가 재생 위치를 스크럽. `src`가 아니라 `data-sc-src`를 쓴다. Blob으로 받아 range 요청 없이 seek하고, 동작 감소 시 fetch 자체를 생략 |
| `data-sc-sequence="a/{i}.webp:120:1"` | `<canvas>` | 이미지 시퀀스 스크럽. `경로 템플릿:프레임 수:시작 번호` |
| `data-sc-pan="0.06"` | `data-sc-act="pan"` 안의 넓은 레일 | `scrollWidth - 뷰포트` 만큼 가로 이동. 값은 추가 overshoot 비율 |
| `data-sc-parallax="-0.6"` | 레이어 | `rate * (p - 0.5) * 100` px 세로 이동. 음수는 스크롤보다 빨리 올라감 |
| `data-sc-cue="from [to [rampIn [rampOut]]]"` | 문구 블록 | 불투명도·상승을 `p`에 연동. 아래 cue 계약 참조 |
| `data-sc-kinetic="lines\|words\|chars"` | 제목 | 단위로 쪼개 cue 창 안에서 순차 등장. `document.fonts.ready` 후 재측정 |
| `data-sc-reveal="up\|down\|left\|right\|iris"` (+`data-sc-reveal-at`) | figure 등 | `clip-path` 와이프 |
| `data-sc-count="0 4,200"` (+`data-sc-count-at`, `data-sc-count-ms`) | 숫자 | act 안에서는 `p`로 스크럽, act 밖에서는 진입 시 한 번 카운트(기본 1400ms). 표시할 형식 그대로 쓴다 |
| `data-sc-in` (+부모에 `data-sc-stagger="60"`) | flow 섹션 | IntersectionObserver로 진입 시 **한 번** 등장. 되돌아갈 때 다시 숨지 않음 |
| `data-sc-tilt="8"`, `data-sc-magnet="0.3"`, `data-sc-spotlight` | 포인터 반응 | `(hover: hover) and (pointer: fine)`에서만 동작, 동작 감소 시 비활성. 터치에서는 발화하지 않음 |
| `data-sc-progress` | 임의 요소 | 페이지 전체 진행률 표시 바 |

### cue 계약

`data-sc-cue` 값은 모두 act 진행률(0~1) 기준이다.

| 형식 | 동작 |
|---|---|
| `"0.2"` | 0.2에서 나타나 **act 끝까지 유지** |
| `"0.1 0.6"` | 등장·유지·퇴장. 램프는 기본적으로 창의 30%씩 |
| `"0 0.78 0"` | **greet**: act 시작 시 이미 완전 표시, 이후 퇴장 |
| `"0.1 0.9 0.15 0.4"` | 빠른 등장, 느린 퇴장 |
| `"0 1 0 0"` | **greet 후 유지** |

검증에서 걸리는 규칙:

- 히어로의 첫 cue는 greet 형식이어야 한다. 아니면 첫 화면에 제목이 없다.
- 마지막 act의 마지막 cue는 한 값(유지)이어야 한다. 아니면 페이지 끝에서 CTA가 사라진다.
- **마지막 act만 유지할 수 있다.** 중간 고정 act의 한 값 cue는 un-pin 슬라이드 동안 켜진 채
  다음 섹션과 겹친다. 중간 act는 1에서 끝나는 두 값 창으로 닫는다.
- 고정 stage는 자기 진행률이 0을 벗어나기 약 한 뷰포트 전부터 보인다. 첫 콘텐츠가 두 값 cue면
  그동안 빈 stage가 보이므로, 바닥(이미지·색·고정 프레임)을 두거나 greet로 시작한다.
- `magnet`·`parallax`·`cue`는 모두 `transform`을 쓰므로 한 요소에 겹치지 않는다. magnet CTA에는
  `data-sc-rise="0"`을 함께 둔다.

### 클립 시간 ≠ cue 시간

고정 stage는 고정 구간 **앞뒤로 각 한 뷰포트씩** 화면에 보인다. 클립을 `p`에만 매핑하면 진입
동안 첫 프레임, 퇴장 동안 마지막 프레임에 멈춘 정지 사진이 페이지와 함께 미끄러진다. 엔진은
기본적으로 클립을 stage의 **전체 가시 구간**에 매핑하고, cue는 고정 구간(`p`)을 따른다.
`data-sc-dwell`과 짝지으면 빠른 구간이 슬라이드에, 느린 구간이 문구가 있는 고정 구간에 떨어진다.

### 플레이헤드 보간

스크롤은 `currentTime`을 직접 쓰지 않고 목표만 쓴다. 별도 rAF 루프가 프레임당 고정 비율
(`data-sc-lerp`, 기본 0.18)로 따라간다. 데스크톱 8ms·모바일 20ms 미만 변화는 무시하고, 디코더가
seek 중이면 다음 seek을 큐에 넣지 않는다. 동작 감소에서는 비율 1.0(보간 없음)이다.

### 장치별 주의

- **scrub**: 포스터 `<img class="sc-stage__poster">`는 실제 프레임이 그려질 때까지 유지된다. iOS는
  재생된 적 없는 muted 영상을 그리지 않으므로 엔진이 `loadedmetadata`와 터치·클릭·스크롤 이벤트에서
  `play()/pause()`로 디코더를 깨운다. 이 로직을 페이지 JS로 다시 구현하거나 엔진에서 제거하지 않는다.
- **pan**: 레일 `scrollWidth - innerWidth`가 양수인지 **직접 측정**한다. 레일이 뷰포트보다 좁으면
  이동 0으로 span 내내 멈춘 화면이 되는데 검증 도구는 이를 잡지 못한다. 동작 감소 시 엔진이
  stage를 네이티브 `overflow-x: auto` 영역으로 바꿔 항목 접근성을 유지한다.
- **reveal**: `clip-path`는 글리프가 아니라 border box 기준이다. `line-height < 1` 텍스트에 직접 걸면
  어센더·디센더가 잘린다. 래퍼에 건다.
- **kinetic**: 한 act에 하나까지. 줄 분할 마스크는 디센더 공간을 확보한다.
- **parallax**: 총 이동이 약 200px를 넘으면 깊이가 아니라 버그로 읽힌다. 본문 텍스트는 올리지 않는다.
  parallax 요소에 `transition: transform`을 두면 매 프레임 쓰기가 지연돼 모바일에서 한 박자 늦게 따라온다.
- **count**: 검증된 실제 수치에만 쓴다. 가공 브랜드에는 카운터를 두지 않는다.
- **drift**: 진행률이 0과 1 사이인 첫 act의 색을 따른다. 짧은 act가 여럿 동시에 진행 중인
  페이지에서는 색이 한 섹션 늦게 도착하므로, 그 경우 섹션별 배경색을 칠한다.
- **flow 섹션이 고정 act 바로 뒤에 올 때** 위쪽 패딩을 줄인다. stage가 빠져나가는 한 뷰포트에
  패딩이 더해져 빈 화면이 길어진다.

## 동작 감소

"없음"이 아니라 "적고 부드럽게"다. cue는 여전히 페이드하고(이해 가능성 유지), 이동은 사라지고,
영상 클립은 fetch하지 않고 포스터가 유지되며, 포인터 장치는 비활성이다. pan 레일은 네이티브
스크롤 영역으로 바뀐다. 동작 감소에서도 **삭제된 콘텐츠가 없는지**를 확인한다.

## 모바일

- 고정 stage는 `100svh`를 써서 URL 바 변화로 점프하지 않는다.
- `data-sc-src-mobile`로 세로 크롭 클립을 따로 준다. 16:9 클립을 9:16에 cover-fit하면 구도가 깨지고
  디코딩한 프레임의 3/4를 버린다.
- 헤드리스 Chrome은 iPhone의 디코더·자동재생 정책·저전력 모드·터치 스크롤을 재현하지 못한다.
  실기기 확인 없이 모바일 검증 완료라고 쓰지 않는다.
- 실기기에서 클립이 멈추면 [device-diag.html](device-diag.html)의 `TESTS` 배열을 빌드의 클립으로
  바꿔 사이트 옆에 배포한다. Blob 로드·직접 src·기준 클립을 나란히 스크럽해 MOVING/FROZEN을 판정한다.

## 검증 절차

스크롤 페이지는 한 장의 스크린샷으로 검증되지 않는다. 모든 스크롤 위치가 다른 프레임이다.

```bash
cd <빌드 폴더>
npm i playwright-core          # 최초 1회. 설치 전 사용자 승인 필요

node <스킬>/scripts/serve.mjs --root . --port 4500 &
node <스킬>/scripts/shoot.mjs --url http://localhost:4500 --out lab/shots
node <스킬>/scripts/shoot.mjs --url http://localhost:4500 --out lab/mobile --width 390 --height 844
node <스킬>/scripts/shoot.mjs --url http://localhost:4500 --out lab/reduced --reduced-motion
```

- `playwright-core`는 스킬이 아니라 **빌드 폴더**에 설치한다. `shoot.mjs`는 `process.cwd()`의
  `node_modules`에서 찾는다. 새 의존성이므로 설치 전에 사용자에게 승인을 받는다.
- 번들 Chromium이 아니라 **설치된 Chrome**을 쓴다. Chromium은 h264 디코더가 없어 클립이 전부
  포스터로 떨어지고 검사가 "통과"한다. `SCROLLCRAFT_CHROME` 환경변수로 경로를 바꿀 수 있다.
- `serve.mjs`는 기본 `127.0.0.1`에 바인딩한다. 실기기 테스트용 `--lan`은 폴더 전체를 같은
  네트워크에 노출하므로 필요한 시간만 쓴다.
- 이 세션에 브라우저 도구가 있으면 같은 서버 주소를 열어 보조 확인에 쓸 수 있다. 다만 act별
  연속 프레임과 대비 측정은 `shoot.mjs` 결과를 기준으로 삼는다.

### 서버가 내 빌드를 서빙하는지 먼저 확인

`serve.mjs`가 `EADDRINUSE`로 죽어도 백그라운드 로그에만 남고, `shoot.mjs`는 그 포트에 있는 **다른
사이트**를 찍어 깨끗한 보고서를 낸다. 실행 전에 확인한다.

```bash
curl -s http://localhost:4500 | grep -o "<title>.*</title>"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4500/assets/<알고 있는 파일>
```

`shoot.mjs`가 끝나면서 백그라운드 서버가 함께 내려갈 수 있다. 다음 패스 전에 포트를 확인한다.

### 결과물

`--out` 폴더에 위치별 PNG, `report.json`, `sheet.png`(컨택트 시트)가 생긴다. **`sheet.png`를 읽는다.**
연속 프레임을 나란히 봐야 중간이 죽은 구간이 보인다.

### 검사 도구가 보고하는 것

| 보고 | 의미 | 조치 |
|---|---|---|
| DEAD SCROLL | 연속 위치에서 아무것도 변하지 않음(cue·클립·레일·와이프·stage 모두) | span 축소 또는 cue 추가 |
| FROZEN CLIP | scrub stage가 보이는데 플레이헤드가 멈춤. 진입·퇴장 슬라이드도 샘플링 | `data-sc-clip-map="travel"` 제거, 엔진 버전 확인 |
| CUES THAT NEVER PEAK | 어디서도 불투명도 1에 도달하지 않는 요소 | 창을 넓히거나 램프를 명시 |
| CONTRAST | 합성된 화면에서 텍스트를 숨긴 뒤 실제 배경을 샘플링해 대비 측정. 3:1 미만 실패, 3~4.5:1 주의 | 스크림 보강. 단 스크림은 문구의 **형제** 요소여야 측정에 포함됨 |
| 콘솔 오류·실패 요청 | 클립 404는 포스터로 조용히 떨어져 겉으로는 정상 | 자산 경로 확인 |

act별 기본 6개 위치를 샘플링한다(`--per-act`). 문서 전체 균등 샘플링이 아니므로 다른 섹션 높이를
바꿔도 결과 위치가 흔들리지 않는다.

엔진 밖의 고정 레이어(분할 stage, 캔버스 등)로 화면이 바뀌는 페이지는 그 레이어에
`data-sc-verify-state`를 두고 실제로 그려지는 값의 서명을 갱신해야 검사 대상이 된다. 진행률
원값을 그대로 넣어 검사를 통과시키지 않는다. 의도된 정지에는 `data-sc-verify-hold="true"`를
정지 중에만 둔다.

### 도구의 한계 (초록 결과가 보장하지 않는 것)

- 같은 문구의 cue 두 개는 한 행으로 합쳐진다.
- 불투명도 0.85 미만 줄은 대비 측정에서 제외된다. 시트에서 흐릿한 글자를 눈으로 본다.
- 대비 기준이 글자 크기를 모른다. 큰 제목의 3~4.5:1은 보통 괜찮고 16px 캡션은 아니다.
- `[data-sc-cue]`가 없는 act는 대비 측정 대상이 아니다.
- 일반 `flow` act는 dead scroll 검사에서 제외된다.
- **오버플로가 없는 pan 레일은 정상으로 보고된다.** 직접 측정한다.
- 구도가 좋은지, 움직임이 고른지, 페이지가 의미가 있는지는 사람이 시트를 보고 판단한다.

### 수동 확인

- **키보드**: Tab 순서가 시각 순서와 같고, 포커스 링이 모든 배경에서 보이고, 불투명도 0에 머무는
  포커스 가능 요소가 없다. 엔진은 `focusin` 시 cue가 0.85 미만인 요소를 뷰포트 중앙으로
  즉시 스크롤하지만, **고정 act 안의 컨트롤은 해결하지 못한다**(sticky라 위치가 한 곳에 고정됨).
  고정 act에 포커스 가능한 컨트롤이 있으면 그 cue가 열리는 진행률로 act를 이동시키는 핸들러를
  페이지에서 작성한다.
- **동작 감소**: 포스터 유지, cue 페이드, 콘텐츠 누락 없음, pan 레일 항목 접근 가능.
- **다시 보기**: 20분 조정한 타이밍은 잊은 뒤 다시 보면 다르게 읽힌다.

## 자주 겪은 실패

| 증상 | 원인 |
|---|---|
| 히어로 제목이 여섯 줄로 줄바꿈 | 컨테이너에 `ch` 단위 `max-width`. 컨테이너 글꼴 크기 기준으로 계산됨 |
| 가운데 문구가 왼쪽 가장자리에 걸림 | `left: 50%` 뒤에 `inset-inline` 선언. 축약형이 `left`를 초기화 |
| act가 고정되지 않음 | 페이지 CSS가 stage의 `position`을 덮어씀. 엔진이 콘솔 경고 출력 |
| 이전 act 제목이 다음 섹션 위에 남음 | 중간 act의 한 값 유지 cue |
| 클립이 act 시작에서 포스터에 멈춤 | 시간 0인 클립은 `seeked`가 발생하지 않음. 엔진이 타임아웃으로 처리 |
| 마지막 CTA가 페이지 끝 전에 사라짐 | 마지막 act의 두 값 cue, 또는 그 뒤에 긴 섹션 |
| 복사한 제목이 "even whenbreakfast"로 붙음 | 줄 분할 span 사이에 공백 없음 |
| 숫자가 민무늬 막대로 렌더링 | `line-height < 1` 텍스트에 직접 `data-sc-reveal` |
| 이미지가 세 배로 커져 라벨을 밀어냄 | CSS에서 `width`만 덮어쓰고 `height`는 HTML 속성값 유지 |
| 배경색이 한 섹션 늦게 도착 | 짧은 act가 여럿인 페이지의 drift. 섹션별 배경으로 전환 |
| 조용한 act의 모든 cue가 0→1로 튐 | 고정 act의 `data-sc-span` ≤ 1 |
| 데스크톱은 정상, 실기기 iPhone에서 히어로 클립만 멈춤 | iOS가 재생된 적 없는 muted 영상을 그리지 않음. 엔진 0.3.x가 클립별로 디코더를 깨움 |
| 네 차례 모바일 수정 뒤에도 실기기 고장 | 헤드리스 Chrome은 iOS를 재현하지 못함. device-diag.html을 배포해 기기가 답하게 함 |

## 완료 보고에 적을 것

사용한 엔진 버전(UPSTREAM.md 기준), 실행한 `shoot.mjs` 패스(데스크톱·모바일·동작 감소), 시트를
육안 확인한 범위, 실기기 미검증 여부, `playwright-core` 설치 여부. 문서를 읽고 명세만 쓴 것을
엔진 통합·화면 검증 완료라고 쓰지 않는다.
