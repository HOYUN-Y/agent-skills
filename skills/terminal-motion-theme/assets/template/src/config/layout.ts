// 화면비별 배치와 글자 크기 — 배치 수정 지점. 같은 장면을 두 배치로 그린다.
// landscape(16:9): 데스크톱·X·유튜브. 정보 밀도가 높은 대시보드.
// portrait(9:16): 릴스·쇼츠. 휴대폰 폭(약 390pt)에 맞춰 글자를 키우고, 칸을 줄이고, 릴스 UI 안전 영역 안에만 정보를 둔다.
import {useVideoConfig} from 'remotion';
import {heroKind} from '../data/hero';

export type Rect = {x: number; y: number; w: number; h: number};

export type Layout = {
  kind: 'landscape' | 'portrait';
  W: number;
  H: number;
  // 플랫폼 UI가 덮는 가장자리(px). 이 안쪽에만 읽어야 하는 글자를 둔다.
  safe: {top: number; right: number; bottom: number; left: number};
  t: {
    title: number; // 단계 제목(픽셀 글꼴)
    titleLine: number;
    tag: number; // 제목 아래 // 설명
    body: number; // 창 본문
    line: number; // 창 본문 줄 높이
    small: number; // 보조 글자(최소 크기)
    metric: number;
    metricLabel: number;
    cardTitle: number;
    cardStep: number;
    log: number;
    logLine: number;
    heroLabel: number;
    bar: number; // 창 제목줄 높이
    barFont: number;
    header: number;
    footer: number;
  };
  header: Rect;
  logoTile: number;
  title: Rect;
  metrics: Rect | null; // null이면 머리줄 오른쪽에 둔다
  // null이면 그리지 않는다. compact = 한 줄 카드(상태 칸·이름·진행 칸, 지금 하는 일 문장 없음)
  actors: (Rect & {cols: number; gap: number; cells: number; cellW: number; cellH: number; compact: boolean}) | null;
  tree: Rect | null; // null이면 그리지 않는다
  hero: Rect;
  file: Rect;
  output: Rect;
  swap: boolean; // true면 file·output이 한 자리를 나눠 쓴다(최근에 바뀐 쪽을 보인다)
  log: Rect & {lines: number; panel: boolean};
  band: {y: number; h: number; cell: number; top: number}; // top = 위쪽 디더 띠 높이(0이면 없음)
  footerY: number | null;
  phases: boolean;
  legend: boolean;
  logo: {cols: number; cell: number; top: number; name: number; nameSpacing: number; closing: number};
};

export const LANDSCAPE: Layout = {
  kind: 'landscape',
  W: 1920,
  H: 1080,
  safe: {top: 0, right: 0, bottom: 0, left: 0},
  t: {
    title: 54,
    titleLine: 62,
    tag: 20,
    body: 15,
    line: 23,
    small: 13,
    metric: 19,
    metricLabel: 13,
    cardTitle: 16,
    cardStep: 13,
    log: 14,
    logLine: 23,
    heroLabel: 14,
    bar: 34,
    barFont: 13,
    header: 18,
    footer: 15,
  },
  header: {x: 64, y: 28, w: 1792, h: 40},
  logoTile: 40,
  title: {x: 64, y: 100, w: 876, h: 110},
  metrics: null,
  actors: {x: 964, y: 100, w: 892, h: 104, cols: 4, gap: 12, cells: 10, cellW: 11, cellH: 9, compact: false},
  tree: {x: 64, y: 226, w: 340, h: 634},
  hero: {x: 420, y: 226, w: 820, h: 634},
  file: {x: 1256, y: 226, w: 600, h: 338},
  output: {x: 1256, y: 580, w: 600, h: 280},
  swap: false,
  log: {x: 64, y: 876, w: 1792, h: 112, lines: 3, panel: true},
  band: {y: 1002, h: 78, cell: 6, top: 0},
  footerY: 1036,
  phases: true,
  legend: true,
  logo: {cols: 30, cell: 14, top: 236, name: 44, nameSpacing: 6, closing: 20},
};

// 릴스 안전 영역: 위 220 · 아래 420 · 오른쪽 140(좋아요·댓글 버튼) — clawd 추격씬 영상(2026-11-04)에서 정한 값
// 글자 크기: 휴대폰(폭 약 390pt)에서 영상은 약 0.36배로 보인다. 본문 34px ≈ 12pt, 보조 28px ≈ 10pt가 하한(2026-11-09 독립 검수).
// 좌우 여백은 오른쪽 안전 영역과 같은 140으로 맞춰 내용을 화면 가운데에 둔다(x 140~940, 폭 800). 왼쪽만 48로 좁히면 내용이 56px 왼쪽으로 치우쳐 보인다(2026-11-11 사용자 지적).
// 창 테두리는 오른쪽 안전선(x 940)까지, 글자는 창 안쪽 여백만큼 더 안쪽. 아래는 안전선에서 20px 이상 띄운다(y 끝 1480).
export const PORTRAIT: Layout = {
  kind: 'portrait',
  W: 1080,
  H: 1920,
  safe: {top: 220, right: 140, bottom: 420, left: 140},
  t: {
    title: 60,
    titleLine: 70,
    tag: 30,
    body: 34,
    line: 48,
    small: 28,
    metric: 32,
    metricLabel: 24,
    cardTitle: 26,
    cardStep: 28,
    log: 30,
    logLine: 40,
    heroLabel: 28,
    bar: 52,
    barFont: 24,
    header: 28,
    footer: 26,
  },
  header: {x: 140, y: 232, w: 800, h: 48},
  logoTile: 44,
  title: {x: 140, y: 292, w: 800, h: 124},
  metrics: {x: 140, y: 424, w: 800, h: 44},
  // 세로에서는 카드가 한 줄(2열 × 2행): 지금 하는 일은 단계 제목 태그와 로그 줄이 맡는다
  actors: {x: 140, y: 480, w: 800, h: 116, cols: 2, gap: 12, cells: 8, cellW: 14, cellH: 12, compact: true},
  tree: null,
  hero: {x: 140, y: 610, w: 800, h: 442},
  file: {x: 140, y: 1066, w: 800, h: 358},
  output: {x: 140, y: 1066, w: 800, h: 358},
  swap: true,
  log: {x: 140, y: 1434, w: 800, h: 46, lines: 1, panel: false},
  band: {y: 1600, h: 320, cell: 8, top: 190}, // 릴스 UI가 덮는 위·아래는 디더 띠로 채운다(읽을 글자 없음)
  footerY: null,
  phases: false,
  legend: false,
  logo: {cols: 30, cell: 22, top: 600, name: 44, nameSpacing: 4, closing: 30},
};

// 주인공이 단계 파이프라인이면 세로에서 카드를 숨긴다: 같은 진행을 두 번 보이지 않고, 그 높이를 주인공에 준다
export const PORTRAIT_PIPELINE: Layout = {...PORTRAIT, actors: null, hero: {x: 140, y: 482, w: 800, h: 570}};

export const layoutFor = (width: number, height: number): Layout => (height > width ? (heroKind === 'pipeline' ? PORTRAIT_PIPELINE : PORTRAIT) : LANDSCAPE);

export const useLayout = (): Layout => {
  const {width, height} = useVideoConfig();
  return layoutFor(width, height);
};

// 창 안쪽(제목줄 아래) 영역
export const inner = (r: Rect, L: Layout): Rect => ({x: r.x + 1, y: r.y + 1 + L.t.bar, w: r.w - 2, h: r.h - L.t.bar - 2});

// 고정폭 글자(JetBrains Mono 0.6em) 폭 어림
export const monoWidth = (chars: number, size: number) => Math.ceil(chars * size * 0.6);

const WIDE = /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

// 문자열 폭 어림: 한글·전각은 1em(대체 글꼴), 나머지는 고정폭 0.6em
export const textWidth = (text: string, size: number) => Math.ceil([...text].reduce((s, c) => s + (WIDE.test(c) ? 1 : 0.6), 0) * size);

// 픽셀 글꼴 폭 어림: Silkscreen 약 0.65em + 자간, Galmuri11(한글) 1em + 자간
export const pixelWidth = (text: string, size: number, spacing = 0) =>
  Math.ceil([...text].reduce((s, c) => s + (WIDE.test(c) ? size : size * 0.65) + spacing, 0));

// 문서 창 줄 번호 칸 폭(세로는 한 자리 번호에 맞춰 좁힌다)
export const docGutter = (L: Layout) => Math.round(L.t.body * (L.kind === 'portrait' ? 1.7 : 2.6));
