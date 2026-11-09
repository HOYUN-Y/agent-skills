// 마무리: 주인공 시각물의 픽셀이 날아가 로고 칸을 채운다("흩어진 픽셀이 모여 하나의 로고가 된다").
// 로고 → 브랜드 이름(타이핑) → `$ closing` 순서. 마무리의 금색은 로고 i 하나. 마지막 줄이 1.5초 이상 머물도록 T.finale을 잡는다.
import React from 'react';
import {interpolate, random} from 'remotion';
import {theme} from '../config/theme';
import {T} from '../config/timeline';
import {Layout} from '../config/layout';
import {brand, video} from '../data/scenario';
import {easeInOut, lerp, lin, typed} from '../lib/anim';
import {logoGrid} from '../lib/logo';

export type Point = {x: number; y: number; size: number; color: string};

const orderCache = new Map<number, number[]>();
const orderOf = (n: number) => {
  if (!orderCache.has(n)) orderCache.set(n, Array.from({length: n}, (_, i) => i).sort((a, b) => random(`fo${a}`) - random(`fo${b}`)));
  return orderCache.get(n)!;
};

// points = 마무리 시작 프레임에 화면에 있던 픽셀(화면 좌표). 비어 있으면 화면 가운데 넓게 흩어진 자리에서 출발한다.
export const FinaleLogo: React.FC<{frame: number; L: Layout; points: Point[]}> = ({frame, L, points}) => {
  if (frame < T.finale) return null;
  const {cols, cell, top, name, nameSpacing, closing} = L.logo;
  const g = logoGrid(cols);
  const LW = g.cols * cell;
  const LH = g.rows * cell;
  const LX = Math.round(L.W / 2 - LW / 2);
  const pts: Point[] = points.length
    ? points
    : Array.from({length: 400}, (_, i) => ({x: L.W * (0.15 + 0.7 * random(`px${i}`)), y: L.H * (0.25 + 0.5 * random(`py${i}`)), size: 4, color: theme.slate400}));
  const order = orderOf(pts.length);
  const flying = g.cells.map((c, k) => {
    const p = pts[order[k % order.length]];
    const st = T.finale + (c.y / g.rows) * 14 + random(`fd${k}`) * 10;
    const t = easeInOut(interpolate(frame, [st, st + 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
    const s0 = Math.min(10, Math.max(2.5, p.size));
    const s = lerp(s0, cell - 1.2, t);
    const x = lerp(p.x - s0 / 2, LX + c.x * cell + 0.6, t);
    const y = lerp(p.y - s0 / 2, top + c.y * cell + 0.6, t);
    const fill = t < 0.65 ? p.color : c.k === 'gold' ? theme.gold : theme.ivory;
    return <rect key={k} x={x} y={y} width={s} height={s} fill={fill} opacity={lin(frame, st - 6, st)} />;
  });
  const nameAt = T.finale + 34;
  const subAt = T.finale + 46;
  return (
    <>
      <svg width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} style={{position: 'absolute', left: 0, top: 0}}>
        {flying}
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, top: top + LH + name * 1.1, textAlign: 'center', fontFamily: theme.pixel, fontSize: name, letterSpacing: nameSpacing, color: theme.ivory, whiteSpace: 'pre'}}>
        {typed(brand.name, frame, nameAt, nameAt + 16)}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: top + LH + name * 2.7,
          textAlign: 'center',
          fontFamily: theme.mono,
          fontSize: closing,
          color: theme.slate400,
          opacity: lin(frame, subAt, subAt + 10),
        }}
      >
        <span style={{color: theme.slate400}}>$ </span>
        {video.closing}
      </div>
    </>
  );
};
