// 주인공 시각물: 단계 파이프라인. 단계마다 칸 블록이 있고, 그 단계가 일하는 동안 픽셀이 아래부터 쌓여 차오른다.
// 오프닝에 흩어진 픽셀이 빈 칸 자리로 모이고, 다음 단계로 넘어갈 때 금색 픽셀이 블록 사이를 흐른다. 설정은 data/pipeline.ts.
// 약속은 PixelNetwork와 같다: 프레임의 순수 함수, 장면 단위 이름표(8프레임 페이드), heroPoints()로 마무리 픽셀 출발점.
import React from 'react';
import {random} from 'remotion';
import {theme} from '../config/theme';
import {textWidth} from '../config/layout';
import {pipeline} from '../data/pipeline';
import type {PipeStage} from '../data/types';
import {easeInOut, flash, lerp, lin} from '../lib/anim';

const OPEN_LEAD = 4;
const OPEN_DUR = 46;
const OPEN_STAGGER = 34;
const MARK_FADE = 8;
const COLS = 8; // 블록 가로 칸 수

type Cell = {stage: number; x: number; y: number; order: number; color: string; delay: number; fx: number; fy: number};

// 배치(크기별 캐시): 4단계 이하 한 줄, 그보다 많으면 두 줄
const geomCache = new Map<string, ReturnType<typeof buildGeom>>();
const buildGeom = (w: number, h: number, labelSize: number) => {
  const n = pipeline.stages.length;
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  const rows = n <= 4 ? 1 : 2;
  const m = Math.round(w * 0.05);
  const gap = Math.max(28, Math.round(w * 0.045));
  const labelH = Math.round(labelSize * 2.6);
  const top = Math.round(h * 0.12);
  const bw = (w - 2 * m - (cols - 1) * gap) / cols;
  const bh = (h - top - m - rows * labelH - (rows - 1) * gap) / rows;
  const c = Math.floor(Math.min(bw / COLS, bh / 4));
  const brows = Math.max(4, Math.min(14, Math.floor(bh / c)));
  const blockW = c * COLS;
  const blockH = c * brows;
  const blocks = pipeline.stages.map((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = m + col * (bw + gap) + (bw - blockW) / 2;
    const y = top + row * (bh + labelH + gap) + (bh - blockH) / 2;
    return {x, y, w: blockW, h: blockH};
  });
  const cells: Cell[] = [];
  pipeline.stages.forEach((s: PipeStage, si) => {
    const list: Omit<Cell, 'order'>[] = [];
    for (let y = 0; y < brows; y++)
      for (let x = 0; x < COLS; x++) {
        const k = `${si}-${x}-${y}`;
        list.push({
          stage: si,
          x: blocks[si].x + x * c,
          y: blocks[si].y + y * c,
          color: s.colors[Math.floor(random(`pc${k}`) * s.colors.length)],
          delay: random(`pd${k}`) * OPEN_STAGGER,
          fx: (random(`px${k}`) - 0.5) * w * 1.6 + w / 2,
          fy: (random(`py${k}`) - 0.5) * h * 1.6 + h / 2,
        });
      }
    // 채우는 순서: 아래 줄부터, 줄 안에서는 섞어서(쌓이는 느낌)
    const ordered = [...list].sort((a, b) => b.y - a.y || random(`po${a.x}-${a.y}`) - random(`po${b.x}-${b.y}`));
    ordered.forEach((cell, order) => cells.push({...cell, order}));
  });
  return {c, blocks, cells, perStage: COLS * brows, labelH};
};
const geom = (w: number, h: number, labelSize: number) => {
  const k = `${w}x${h}x${labelSize}`;
  if (!geomCache.has(k)) geomCache.set(k, buildGeom(w, h, labelSize));
  return geomCache.get(k)!;
};

const filledAt = (frame: number, si: number, total: number) => {
  const s = pipeline.stages[si];
  return Math.round(lin(frame, s.span.start, s.span.end) * total);
};
const openT = (cell: Cell, frame: number) => easeInOut(lin(frame, OPEN_LEAD + cell.delay, OPEN_LEAD + cell.delay + OPEN_DUR));

export const pipelinePoints = (frame: number, w: number, h: number, labelSize: number) => {
  const g = geom(w, h, labelSize);
  return g.cells.map((cell) => {
    const on = cell.order < filledAt(frame, cell.stage, g.perStage);
    return {x: cell.x + g.c / 2, y: cell.y + g.c / 2, size: g.c * 0.8, color: on ? cell.color : theme.slate500};
  });
};

type Props = {frame: number; w: number; h: number; labelSize: number; small: number};

export const PixelPipeline: React.FC<Props> = ({frame, w, h, labelSize, small}) => {
  const g = geom(w, h, labelSize);
  const s = g.c * 0.8;
  const active = pipeline.stages.findIndex((st) => frame >= st.span.start && frame < st.span.end);

  const cells = g.cells.map((cell, i) => {
    const t = openT(cell, frame);
    const x = lerp(cell.fx, cell.x, t);
    const y = lerp(cell.fy, cell.y, t);
    const n = filledAt(frame, cell.stage, g.perStage);
    const on = cell.order < n;
    // 지금 채워지는 맨 앞 칸 2개만 금색(지금 일하는 곳)
    const front = cell.stage === active && on && cell.order >= n - 2;
    const fill = front ? theme.gold : on ? cell.color : theme.navy600;
    return <rect key={i} x={x + (g.c - s) / 2} y={y + (g.c - s) / 2} width={s} height={s} fill={fill} opacity={(on ? 0.95 : 0.55) * (0.25 + 0.75 * t)} />;
  });

  const frameIn = lin(frame, 40, 70);
  const blocks = g.blocks.map((b, i) => {
    const st = pipeline.stages[i];
    const state = frame >= st.span.end ? 'done' : i === active ? 'active' : 'wait';
    return (
      <rect
        key={`b${i}`}
        x={b.x - 6}
        y={b.y - 6}
        width={b.w + 12}
        height={b.h + 12}
        fill="none"
        stroke={state === 'active' ? theme.gold : state === 'done' ? theme.slate400 : theme.navy600}
        strokeWidth={state === 'active' ? 2 : 1}
        opacity={frameIn}
      />
    );
  });

  // 블록 사이 흐름: 다음 단계가 일하는 동안 앞 블록에서 금색 픽셀이 건너간다(같은 줄일 때)
  const flows: React.ReactNode[] = [];
  for (let i = 1; i < g.blocks.length; i++) {
    const a = g.blocks[i - 1];
    const b = g.blocks[i];
    if (Math.abs(a.y + a.h - (b.y + b.h)) > 1) continue;
    const st = pipeline.stages[i].span;
    const k = Math.min(lin(frame, st.start, st.start + 10), 1 - lin(frame, st.end - 10, st.end));
    const y = a.y + a.h / 2;
    const x0 = a.x + a.w + 8;
    const x1 = b.x - 8;
    flows.push(<line key={`fl${i}`} x1={x0} y1={y} x2={x1} y2={y} stroke={theme.slate500} strokeWidth={1} opacity={frameIn} />);
    if (k > 0)
      for (let j = 0; j < 3; j++) {
        const t = (((frame - st.start) / 24 + j / 3) % 1 + 1) % 1;
        const sz = Math.max(4, g.c * 0.4);
        flows.push(<rect key={`fp${i}-${j}`} x={lerp(x0, x1, t) - sz / 2} y={y - sz / 2} width={sz} height={sz} fill={theme.gold} opacity={k} />);
      }
  }

  // 단계 이름(블록 아래): 일하는 중 ▸(금색), 끝남 ✓, 대기는 이름만
  const labels = g.blocks.map((b, i) => {
    const st = pipeline.stages[i];
    const done = frame >= st.span.end;
    const isActive = i === active;
    return (
      <div
        key={`sl${i}`}
        style={{
          position: 'absolute',
          left: b.x - 6,
          top: b.y + b.h + 14,
          width: b.w + 12,
          textAlign: 'center',
          fontFamily: theme.mono,
          fontSize: labelSize,
          whiteSpace: 'nowrap',
          color: isActive ? theme.ivory : done ? theme.slate300 : theme.slate400,
          fontWeight: isActive ? 700 : 400,
          opacity: frameIn,
        }}
      >
        {/* 번호는 단계 제목에만 쓴다(번호 체계 하나). 블록은 상태 기호 + 이름 */}
        {isActive ? <span style={{color: theme.gold}}>▸ </span> : done ? '✓ ' : ''}
        {st.label}
      </div>
    );
  });

  // 표시(mark): 블록 위쪽 안에 바탕판, 같은 단계의 다음 표시가 나오면 교체. 생기고 사라질 때 8프레임
  const marks = pipeline.marks.map((mk, mi) => {
    const si = pipeline.stages.findIndex((st) => st.key === mk.stage);
    if (si < 0) return null;
    const next = pipeline.marks.find((o, oi) => oi > mi && o.stage === mk.stage && o.at > mk.at);
    const until = mk.until ?? next?.at ?? pipeline.stages[si].span.end + 30;
    const o = Math.min(lin(frame, mk.at, mk.at + MARK_FADE), 1 - lin(frame, until - MARK_FADE, until));
    if (o <= 0) return null;
    const b = g.blocks[si];
    const prefix = mk.kind === 'ok' ? '✓ ' : mk.kind === 'fail' ? '✗ ' : '';
    const bw = textWidth(prefix + mk.label, labelSize) + 26; // 기호 칸까지 넣어 재야 창 안쪽 12px 제한이 맞는다
    const f = flash(frame, mk.at, 20);
    return (
      <div
        key={`mk${mi}`}
        style={{
          position: 'absolute',
          left: Math.max(12, Math.min(w - bw - 12, b.x + b.w / 2 - bw / 2)), // 창 테두리에 붙지 않게 12px 안쪽
          top: b.y - labelSize * 2.2,
          padding: '2px 10px',
          background: mk.kind === 'fail' ? theme.ivory : theme.navy900,
          border: `1px solid ${theme.navy600}`,
          borderLeft: `2px solid ${mk.kind === 'fail' ? theme.ivory : theme.slate400}`,
          fontFamily: theme.mono,
          fontSize: labelSize,
          fontWeight: mk.kind === 'fail' ? 700 : 400,
          color: mk.kind === 'fail' ? theme.navy800 : theme.ivory,
          whiteSpace: 'nowrap',
          opacity: o,
          outline: f > 0 ? `${Math.round(3 * f)}px solid rgba(246,241,231,${0.25 * f})` : undefined,
        }}
      >
        {prefix}
        {mk.label}
      </div>
    );
  });

  const status = pipeline.status.find((st) => frame >= st.start && frame < st.end)?.text ?? 'idle';
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden'}}>
      <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0}} shapeRendering="crispEdges">
        {flows}
        {blocks}
        {cells}
      </svg>
      {labels}
      {marks}
      <div style={{position: 'absolute', right: 8, bottom: 6, padding: '3px 6px', background: theme.navy900, fontFamily: theme.mono, fontSize: small, color: status === 'idle' ? theme.slate400 : theme.ivory}}>
        {status}
      </div>
    </div>
  );
};
