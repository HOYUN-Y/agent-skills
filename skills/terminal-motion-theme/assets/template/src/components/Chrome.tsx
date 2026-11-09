// 화면 틀: 머리줄(로고·경로·DEMO·수치·시간), 단계 제목, 일하는 주체 카드, 바닥 디더 띠·핸들·단계 표시.
import React from 'react';
import {interpolate, random, useVideoConfig} from 'remotion';
import {pixelFont, theme} from '../config/theme';
import {Layout, monoWidth} from '../config/layout';
import {actors, brand, metrics, phases, titles, video} from '../data/scenario';
import type {Metric} from '../data/types';
import {cursorOn, flash, fmtK, fmtN, fmtTime, lin, typed} from '../lib/anim';
import {bayer, LogoTile} from '../lib/logo';

type P = {frame: number; L: Layout};

// 수치 값: keys마다 ramp 프레임 동안 이전 값에서 세어 올라간다
const metricValue = (m: Metric, frame: number) => {
  if (m.value) return m.value(frame);
  let v = 0;
  for (const k of m.keys ?? []) {
    if (frame < k.at) break;
    const r = k.ramp ?? 1;
    const x = interpolate(frame, [k.at, k.at + r], [v, k.v], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const q = 10 ** (m.decimals ?? 0);
    v = Math.round(x * q) / q;
  }
  return v;
};
const fmtMetric = (m: Metric, v: number) => (m.blankZero && v === 0 ? '–' : m.decimals ? v.toFixed(m.decimals) : fmtN(v));
const metricFlash = (m: Metric, frame: number) => Math.max(0, ...(m.keys ?? []).map((k) => flash(frame, k.at + (k.ramp ?? 0), 20)));

// 수치 칸은 고정 폭(자릿수가 바뀌어도 줄이 움직이지 않게). width = 쉼표 포함 최대 글자 수
const MetricCell: React.FC<{m: Metric; frame: number; L: Layout}> = ({m, frame, L}) => {
  const f = metricFlash(m, frame);
  return (
    <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
      <span style={{fontSize: L.t.metricLabel, letterSpacing: 1.5, color: theme.slate400}}>{m.label}</span>
      <span
        style={{
          display: 'inline-block',
          width: monoWidth(m.width, L.t.metric) + 6,
          padding: '0 3px',
          boxSizing: 'border-box',
          textAlign: 'right',
          fontSize: L.t.metric,
          fontWeight: 600,
          color: theme.ivory,
          fontVariantNumeric: 'tabular-nums',
          background: f > 0 ? `rgba(246,241,231,${0.16 * f})` : 'transparent',
        }}
      >
        {fmtMetric(m, metricValue(m, frame))}
      </span>
    </div>
  );
};

const Metrics: React.FC<P> = ({frame, L}) => {
  const {fps} = useVideoConfig();
  return (
    <>
      {metrics.map((m) => (
        <MetricCell key={m.label} m={m} frame={frame} L={L} />
      ))}
      {/* 재생 시계: 실제 기록 영상에서는 작업 시간으로 오해받으므로 숨긴다 */}
      {video.mode === 'demo' ? (
        <span style={{paddingLeft: 16, borderLeft: `1px solid ${theme.navy600}`, fontSize: L.t.metric, fontWeight: 600, color: theme.ivory, fontVariantNumeric: 'tabular-nums'}}>
          {fmtTime(frame, fps)}
        </span>
      ) : null}
    </>
  );
};

export const Header: React.FC<P & {fade: number}> = ({frame, L, fade}) => {
  const demo = (
    <span style={{fontSize: L.t.metricLabel, letterSpacing: 2, color: theme.slate300, border: `1px solid ${theme.navy600}`, padding: '5px 10px', whiteSpace: 'nowrap'}}>{video.badge}</span>
  );
  return (
    <>
      <div style={{position: 'absolute', left: L.header.x, top: L.header.y, width: L.header.w, height: L.header.h, display: 'flex', alignItems: 'center', gap: 14}}>
        <LogoTile size={L.logoTile} />
        <span style={{fontSize: L.t.header, whiteSpace: 'nowrap'}}>
          <b style={{color: theme.ivory, fontWeight: 700}}>{brand.slug}</b>
          {L.kind === 'landscape' ? <span style={{color: theme.slate400}}> {video.path}</span> : null}
        </span>
        <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 24, opacity: fade}}>
          {demo}
          {L.metrics ? null : <Metrics frame={frame} L={L} />}
        </div>
      </div>
      {L.metrics ? (
        <div style={{position: 'absolute', left: L.metrics.x, top: L.metrics.y, width: L.metrics.w, height: L.metrics.h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: fade}}>
          <Metrics frame={frame} L={L} />
        </div>
      ) : null}
    </>
  );
};

export const StageTitle: React.FC<P> = ({frame, L}) => {
  const title = [...titles].reverse().find((t) => frame >= t.at) ?? titles[0];
  const tt = typed(title.title, frame, title.at, title.at + 10);
  const tag = typed(title.tag, frame, title.at + 6, title.at + 24);
  const cw = Math.round(L.t.title * 0.4);
  return (
    <div style={{position: 'absolute', left: L.title.x, top: L.title.y, width: L.title.w}}>
      <div style={{fontFamily: pixelFont(title.title), fontSize: L.t.title, lineHeight: `${L.t.titleLine}px`, color: theme.ivory, letterSpacing: 2, whiteSpace: 'pre'}}>
        {/* `$`는 늘 Silkscreen: Galmuri11의 `$`는 1px 세로 자국(x=47)을 남겨 제목이 바뀐 뒤에도 영상 끝까지 보였다(2회차 독립 검수 N-05) */}
        <span style={{color: theme.gold, fontFamily: theme.pixel}}>$ </span>
        {tt}
        <span style={{display: 'inline-block', width: cw, height: L.t.title * 0.8, marginLeft: 8, verticalAlign: -4, background: theme.gold, opacity: cursorOn(frame) ? 1 : 0}} />
      </div>
      <div style={{marginTop: 8, fontSize: L.t.tag, color: theme.slate400, whiteSpace: 'pre'}}>// {tag}</div>
    </div>
  );
};

type Status = 'QUEUED' | 'RUNNING' | 'DONE';

// 카드 머리의 상태 칸: 일하는 중 = 금색, 끝남 = 슬레이트, 대기 = 빈 칸. 번호는 단계 제목에만 쓴다(번호 체계 하나).
const StatusDot: React.FC<{st: Status; size: number}> = ({st, size}) => (
  <i
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      marginRight: Math.round(size * 0.7),
      verticalAlign: 'middle',
      boxSizing: 'border-box',
      background: st === 'RUNNING' ? theme.gold : st === 'DONE' ? theme.slate400 : 'transparent',
      border: st === 'QUEUED' ? `2px solid ${theme.navy600}` : 'none',
    }}
  />
);

export const ActorCards: React.FC<P> = ({frame, L}) => {
  const A = L.actors;
  if (!A) return null;
  const rows = Math.ceil(actors.length / A.cols);
  const w = (A.w - A.gap * (A.cols - 1)) / A.cols;
  const h = (A.h - A.gap * (rows - 1)) / rows;
  const pad = L.kind === 'portrait' ? 14 : 13;
  return (
    <>
      {actors.map((a, i) => {
        const st: Status = frame < a.span.start ? 'QUEUED' : frame < a.span.end ? 'RUNNING' : 'DONE';
        const k = Math.round(lin(frame, a.span.start, a.span.end) * A.cells);
        const step = [...a.steps].reverse().find(([f]) => frame >= f);
        const stepF = step ? flash(frame, step[0], 8) : 0;
        const tokens = a.rate && video.mode === 'demo' ? Math.floor(a.rate * Math.max(0, Math.min(frame, a.span.end) - a.span.start)) : 0;
        const cells = (
          <>
            {Array.from({length: A.cells}, (_, c) => (
              <i key={c} style={{width: A.cellW, height: A.cellH, flex: 'none', background: st === 'DONE' ? theme.slate400 : st === 'RUNNING' && c < k ? theme.gold : theme.navy600}} />
            ))}
          </>
        );
        const name = (
          <div style={{fontFamily: pixelFont(a.name), fontSize: L.t.cardTitle, letterSpacing: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', color: st === 'QUEUED' ? theme.slate400 : theme.ivory}}>
            <StatusDot st={st} size={Math.round(L.t.cardTitle * 0.5)} />
            {a.name}
          </div>
        );
        const box: React.CSSProperties = {
          position: 'absolute',
          left: A.x + (i % A.cols) * (w + A.gap),
          top: A.y + Math.floor(i / A.cols) * (h + A.gap),
          width: w,
          height: h,
          boxSizing: 'border-box',
          background: st === 'RUNNING' ? theme.navy700 : theme.navy900,
          border: `1px solid ${st === 'RUNNING' ? theme.slate500 : theme.navy600}`,
        };
        if (A.compact)
          return (
            <div key={a.id} style={{...box, display: 'flex', alignItems: 'center', gap: 3, padding: `0 ${pad + 1}px`}}>
              <div style={{flex: 1, minWidth: 0, marginRight: 12}}>{name}</div>
              {cells}
            </div>
          );
        return (
          <div key={a.id} style={{...box, padding: `${pad - 2}px ${pad + 1}px`}}>
            {name}
            <div
              style={{
                marginTop: pad - 5,
                fontSize: L.t.cardStep,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                color: st === 'RUNNING' ? theme.ivory : st === 'DONE' ? theme.slate300 : theme.slate400,
                background: stepF > 0 && st === 'RUNNING' ? `rgba(246,241,231,${0.12 * stepF})` : 'transparent',
              }}
            >
              {st === 'DONE' ? `✓ ${a.done}` : st === 'RUNNING' && step ? `› ${step[1]}` : '· waiting'}
            </div>
            <div style={{position: 'absolute', left: pad + 1, right: pad + 1, bottom: pad - 2, display: 'flex', alignItems: 'center', gap: 3}}>
              {cells}
              <span style={{marginLeft: 'auto', fontSize: L.t.small, color: theme.slate400, fontVariantNumeric: 'tabular-nums'}}>{tokens > 0 ? fmtK(tokens) : ''}</span>
            </div>
          </div>
        );
      })}
    </>
  );
};

// 바닥 디더 띠(아래로 갈수록 짙어짐) — 고정 시드
const bandPath = (W: number, H: number, cell: number) => {
  let d = '';
  for (let y = 0; y < H; y += cell)
    for (let x = 0; x < W; x += cell)
      if (bayer(x / cell, y / cell) < (y / H) * 0.9 + (random(`bd${x}-${y}`) - 0.5) * 0.08) d += `M${x} ${y}h${cell}v${cell}h-${cell}Z`;
  return d;
};
const bandCache = new Map<string, string>();

export const Band: React.FC<{L: Layout}> = ({L}) => {
  const k = `${L.W}-${L.band.h}-${L.band.cell}`;
  if (!bandCache.has(k)) bandCache.set(k, bandPath(L.W, L.band.h, L.band.cell));
  const kt = `${L.W}-${L.band.top}-${L.band.cell}`;
  if (L.band.top > 0 && !bandCache.has(kt)) bandCache.set(kt, bandPath(L.W, L.band.top, L.band.cell));
  return (
    <>
      <svg width={L.W} height={L.band.h} style={{position: 'absolute', left: 0, top: L.band.y}}>
        <path d={bandCache.get(k)} fill={theme.navy900} />
      </svg>
      {L.band.top > 0 ? (
        <svg width={L.W} height={L.band.top} style={{position: 'absolute', left: 0, top: 0, transform: 'scaleY(-1)'}}>
          <path d={bandCache.get(kt)} fill={theme.navy900} />
        </svg>
      ) : null}
    </>
  );
};

export const Footer: React.FC<P & {fade: number}> = ({frame, L, fade}) => {
  if (L.footerY === null) return null;
  return (
    <>
      <div style={{position: 'absolute', left: L.header.x, top: L.footerY, fontSize: L.t.footer, color: theme.slate400}}>{brand.handle}</div>
      {L.phases ? (
        <div style={{position: 'absolute', right: L.W - L.header.x - L.header.w, top: L.footerY, fontSize: L.t.footer, display: 'flex', gap: 10, color: theme.slate400, opacity: fade}}>
          {phases.map((p, i) => {
            const active = frame >= p.start && frame < p.end;
            const done = frame >= p.end;
            return (
              <span key={p.label}>
                <span style={{color: active ? theme.ivory : done ? theme.slate300 : theme.slate400, fontWeight: active ? 700 : 400}}>
                  {active ? '■ ' : done ? '✓ ' : '□ '}
                  {p.label}
                </span>
                {i < phases.length - 1 ? <span style={{marginLeft: 10}}>→</span> : null}
              </span>
            );
          })}
        </div>
      ) : null}
    </>
  );
};
