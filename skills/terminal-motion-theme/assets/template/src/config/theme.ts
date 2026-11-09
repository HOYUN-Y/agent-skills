// Artificial Insight 디자인 테마(terminal 스타일) — 값은 insight-design-theme 스킬의 base.css와 같다. 값을 바꾸지 않는다.
// 규칙: 남색·회색·아이보리만 쓰고 금색은 "지금 일하는 곳" 한 가지 뜻에만. 그라데이션·그림자·둥근 모서리 없음.
export const theme = {
  navy950: '#0B1220', // 터미널 창 바탕
  navy900: '#0F1828', // 강조 상자, 바닥 디더 띠, HUD 바탕판
  navy800: '#162033', // 지면, 로고 바탕
  navy700: '#1F2B42', // 카드 면, 강조 줄
  navy600: '#2B3A56', // 구분선, 빈 진행 칸
  slate500: '#64748B', // 픽셀 그래픽 음영(글자에는 쓰지 않음)
  slate400: '#94A3B8', // 라벨
  slate300: '#CBD5E1', // 보조 글자
  slate200: '#E2E8F0',
  ivory: '#F6F1E7', // 제목, 강조 글자
  gold: '#FFB52E', // 강조 하나: $ 프롬프트, 창 첫 점, 진행 중 칸, 선택된 노드 테두리, 에이전트 흐름, 로고 i
  sans: '"Pretendard", sans-serif',
  mono: '"JetBrains Mono", "Pretendard", monospace',
  pixel: '"Silkscreen", "Galmuri11", "Pretendard", monospace', // 영문 = Silkscreen, 한글 = Galmuri11(글자마다 대체)
} as const;

// 데이터 색 — 테마 밖 예외(사용자 승인, 2026-11-08 세컨드 브레인 영상). 주인공 시각물의 범주 구분(최대 4개)에만 쓴다.
// 글자·창·진행 칸·강조에는 쓰지 않는다. 범주 구분이 필요 없으면 slate를 쓴다. 각 배열 = [기본, 밝게, 어둡게].
export const dataColors = {
  blue: ['#6CB8FF', '#8FCBFF', '#4E9BEF'],
  violet: ['#B89CFF', '#CDB8FF', '#9C7EF4'],
  mint: ['#4FD9B9', '#7FE7CE', '#30C2A2'],
  rose: ['#FF86B4', '#FFA7C9', '#F2699E'],
  slate: ['#CBD5E1', '#94A3B8', '#E2E8F0'],
} as const;

// 픽셀 글꼴 고르기: 한글이 섞이면 숫자·영문까지 Galmuri11 하나로 그린다(Silkscreen 숫자와 한글이 섞이면 크기·기준선이 어긋난다)
export const pixelFont = (text: string) => (/[\uac00-\ud7af]/.test(text) ? '"Galmuri11", "Pretendard", monospace' : theme.pixel);

export const FPS = 30;
