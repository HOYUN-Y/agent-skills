// Artificial Insight 로고 — insight-design-theme 스킬 assets/web/pixel.js의 좌표·래스터화 방식을 옮겼다.
// 로고 색·비율을 바꾸지 않는다. 눈 칸 배치만 대칭이 되도록 고쳤다(logoGrid 안 주석 참고).
import React from 'react';

const LOGO_BOX = [315.53, 289, 915, 817] as const;
const IVORY = 'M599.7 289.3 L315.53 817 L560.63 817 L623.1 701 L512 701 L599.7 538.14 L749.87 817 L804 817 L804 689.65 C804 637.27 776.54 617.69 736.5 543.33Z';
const GOLD_STEM = 'M765 488 H881 V817 H822 V678.89 C822 619.56 765 582.2 765 524.84Z';
const GOLD_EYE = 'M726 398 Q820.5 289 915 398 Q820.5 507 726 398Z M748 398 Q820.5 324 893 398 Q820.5 472 748 398Z';
// 작은 크기용 눈 도트: 기준축이 칸 중심이면 7칸(동공 1칸), 칸 경계면 8칸(동공 2칸)
const EYE_MASK = ['..###..', '.#...#.', '#..#..#', '.#...#.', '..###..'];
const EYE_MASK_EVEN = ['..####..', '.#....#.', '#..##..#', '.#....#.', '..####..'];

export type LogoCell = {x: number; y: number; k: 'gold' | 'ivory'};
export type LogoGrid = {cols: number; rows: number; cells: LogoCell[]};

const cache: Record<number, LogoGrid> = {};

// 로고를 cols칸 격자로 래스터화 (같은 cols면 항상 같은 결과)
export const logoGrid = (cols: number): LogoGrid => {
  if (cache[cols]) return cache[cols];
  const thr = 0.5;
  const thrGold = 0.32;
  const [x0, y0, x1, y1] = LOGO_BOX;
  const cell = (x1 - x0) / cols;
  const rows = Math.ceil((y1 - y0) / cell);
  const S = 8;
  const cv = document.createElement('canvas');
  cv.width = cols * S;
  cv.height = rows * S;
  const ctx = cv.getContext('2d', {willReadFrequently: true})!;
  const coverage = (draw: (c: CanvasRenderingContext2D) => void) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const k = S / cell;
    ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    ctx.fillStyle = '#000';
    draw(ctx);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const out = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let s = 0;
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) s += d[((r * S + yy) * cv.width + (c * S + xx)) * 4 + 3];
        out[r * cols + c] = s / (255 * S * S);
      }
    return out;
  };
  const iv = coverage((c) => c.fill(new Path2D(IVORY)));
  const stem = coverage((c) => c.fill(new Path2D(GOLD_STEM)));
  // ── 눈: 좌우·상하 대칭이 되도록 (원본 pixel.js 대비 수정)
  // 원본은 눈 중심(820.5, 398)이 칸 격자와 어긋난 채로 래스터화해 30·34칸에서 비대칭이 되고,
  // 7칸 도트는 기둥 축이 칸 경계일 때 반 칸 어긋났다.
  // 기준축 = i 기둥에서 가장 넓은 줄(위쪽)의 칸 범위 중심. 기둥은 아래로 갈수록 좁아지므로 맨 아래 줄은 쓰지 않는다.
  let stemTop = rows;
  for (let i = 0; i < stem.length; i++)
    if (stem[i] >= thr) {
      stemTop = Math.floor(i / cols);
      break;
    }
  let widest: number[] = [];
  for (let r = 0; r < rows; r++) {
    const run: number[] = [];
    for (let c = 0; c < cols; c++) if (stem[r * cols + c] >= thr) run.push(c);
    if (run.length > widest.length) widest = run;
  }
  const axis = (widest[0] + widest[widest.length - 1] + 1) / 2; // 칸 단위 x (정수 = 칸 경계, .5 = 칸 중심)
  // 테두리(약 17~22단위)가 칸보다 얇으면 래스터화가 뭉치므로 손으로 찍은 대칭 도트를 쓴다
  const useMask = cell > 18;
  const eyeCells = new Set<number>();
  if (useMask) {
    const mask = Number.isInteger(axis) ? EYE_MASK_EVEN : EYE_MASK;
    const left = Math.round(axis - mask[0].length / 2);
    const cr = Math.min(Math.floor((398 - y0) / cell), stemTop - 4); // 눈과 기둥 사이 최소 1칸
    mask.forEach((row, y) =>
      [...row].forEach((b, x) => {
        if (b === '#') eyeCells.add((cr - 2 + y) * cols + (left + x));
      }),
    );
  } else {
    // 눈 중심을 기준축·가장 가까운 칸 중심/경계로 옮겨 래스터화한 뒤 좌우·상하로 접어 평균
    const halfH = Math.ceil((452.5 - 398) / cell + 0.5);
    let ay = Math.round(((398 - y0) / cell) * 2) / 2;
    while (ay + halfH > stemTop - 1) ay -= 0.5;
    const dx = x0 + axis * cell - 820.5;
    const dy = y0 + ay * cell - 398;
    const eye = coverage((c) => {
      c.translate(dx, dy);
      c.fill(new Path2D(GOLD_EYE), 'evenodd');
      c.beginPath();
      c.arc(820.5, 398, 28.75, 0, Math.PI * 2);
      c.fill();
    });
    for (let r = 0; r < stemTop - 1; r++)
      for (let c = 0; c < cols; c++) {
        const mc = Math.round(2 * axis - 1 - c);
        const mr = Math.round(2 * ay - 1 - r);
        const vals = [eye[r * cols + c]];
        if (mc >= 0 && mc < cols) vals.push(eye[r * cols + mc]);
        if (mr >= 0 && mr < rows) vals.push(eye[mr * cols + c]);
        if (mc >= 0 && mc < cols && mr >= 0 && mr < rows) vals.push(eye[mr * cols + mc]);
        if (vals.reduce((s, v) => s + v, 0) / vals.length >= thrGold) eyeCells.add(r * cols + c);
      }
  }
  const cells: LogoCell[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const isEye = eyeCells.has(i);
      const gold = stem[i] >= thr || isEye;
      if (gold && (stem[i] >= iv[i] || useMask || isEye)) cells.push({x: c, y: r, k: 'gold'});
      else if (iv[i] >= thr) cells.push({x: c, y: r, k: 'ivory'});
    }
  cache[cols] = {cols, rows, cells};
  return cache[cols];
};

// 머리줄의 작은 로고 (네이비 정사각형 안에 원본 벡터)
export const LogoTile: React.FC<{size: number}> = ({size}) => {
  const pad = 0.16;
  const [x0, y0, x1, y1] = LOGO_BOX;
  const w = x1 - x0;
  const h = y1 - y0;
  const inner = size * (1 - pad * 2);
  const k = inner / Math.max(w, h);
  const tx = (size - w * k) / 2 - x0 * k;
  const ty = (size - h * k) / 2 - y0 * k;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#162033" />
      <g transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})`}>
        <path fill="#F6F1E7" d={IVORY} />
        <g fill="#FFB52E">
          <path d={GOLD_STEM} />
          <path fillRule="evenodd" d={GOLD_EYE} />
          <circle cx="820.5" cy="398" r="28.75" />
        </g>
      </g>
    </svg>
  );
};

// 4×4 베이어 디더 임계값
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
export const bayer = (x: number, y: number) => (BAYER[y & 3][x & 3] + 0.5) / 16;
