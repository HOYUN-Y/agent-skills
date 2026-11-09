// 모든 타이밍(프레임, 30fps) — 타이밍 수정 지점.
// 예시 주제: 릴리스 점검 에이전트(가상). 주제를 바꾸면 단계 이름·사건 프레임을 새로 정하되 아래 장면 순서와 체류 시간 기준은 유지한다.
// 제목(0~2초) → 01(2~5.7초) → 02(6~10.9초) → 03(11.1~15초) → 완료 요약(15.3~16.7초) → 로고 마무리(16.7~20초)
export const T = {
  end: 600,
  intro: {start: 0, end: 60},

  // 01 SCAN
  scan: {start: 60, end: 170},
  diffOpen: 68,
  changed: [96, 110, 124] as const, // 바뀐 파일을 하나씩 찾음

  // 02 TEST
  test: {start: 180, end: 326},
  testType: {start: 186, end: 204},
  testFail: 222,
  fix: {start: 236, end: 300},
  fixType: {start: 252, end: 278},
  testPass: 300,

  // 03 SHIP
  ship: {start: 334, end: 450},
  notesType: {start: 344, end: 380},
  tag: 388,
  releaseType: {start: 392, end: 408},
  results: 414, // 결과 줄 3개가 8프레임 간격으로 나온 뒤 완료까지 2초 이상 머문다

  allDone: 458, // 완료 요약(1초 이상)
  finale: 500, // 대시보드가 사라지고 주인공 시각물의 픽셀이 로고로 모인다. 태그라인은 마지막 1.5초 머문다
} as const;
