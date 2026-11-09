// 주인공 시각물: 픽셀 네트워크(2D). 흩어진 픽셀이 모여 덩어리(묶음)가 되고, 이야기에 나오는 노드만 강조된다.
// 모든 상태는 프레임의 순수 함수다(Remotion은 여러 탭에서 순서 없이 렌더한다). 설정은 data/hero.ts.
// 다른 주인공 시각물로 바꿀 때도 같은 약속을 지킨다: heroPoints()로 마무리 픽셀의 출발점을 내주고, 강조·이름표 규칙을 따른다.
import React from 'react';
import {random} from 'remotion';
import {theme} from '../config/theme';
import {T} from '../config/timeline';
import {hero} from '../data/hero';
import {video} from '../data/scenario';
import {textWidth} from '../config/layout';
import {clamp01, easeInOut, lerp, lin, popIn, windowWeight} from '../lib/anim';

// ── 연출 상수(references/direction.md "주인공 시각물")
const OPEN_LEAD = 4; // 첫 프레임부터 조금씩 모이기 시작
const OPEN_DUR = 46; // 한 픽셀이 날아오는 시간
const OPEN_STAGGER = 34; // 픽셀마다 출발이 늦는 최대 폭 → 약 2.8초 안에 다 모임
const RAMP = 10; // 강조가 켜지고 꺼지는 프레임
const DIM = 0.45; // 강조 중 나머지 노드 밝기(0.3보다 어두우면 그래프가 사라져 보인다)
const EDGE_ALPHA = 0.2;
const EDGE_GROW = 18;
const SHOT_DUR = 36; // 카메라 이동
const SETTLE = 24; // 장면이 바뀐 뒤 이름표 자리를 정하는 시점(카메라가 거의 멈춘 뒤)
const LABEL_FADE = 8; // 이름표가 생기고 사라지는 프레임(한 프레임에 튀지 않게)
const SIGNALS = 36;

type V = {x: number; y: number};
type HNode = {group: number; pos: V; from: V; delay: number; color: string; key?: string; label?: string; at?: number};
type HEdge = {a: number; b: number; group: number; at?: number};

const add = (a: V, b: V): V => ({x: a.x + b.x, y: a.y + b.y});
const lerpV = (a: V, b: V, t: number): V => ({x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t)});
const d2 = (a: V, b: V) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// ── 그래프 생성(시드 고정, 모듈을 불러올 때 한 번)
const G = (() => {
  const nodes: HNode[] = [];
  const edges: HEdge[] = [];
  const taken = new Set<string>();
  const firstOf: number[] = [];
  const total = hero.groups.reduce((s, g) => s + g.count, 0);
  const ring = Math.sqrt(total) * 0.56;
  const free = (p: V) => !taken.has(`${p.x},${p.y}`);
  hero.groups.forEach((g, gi) => {
    const ang = -Math.PI / 2 + (gi / hero.groups.length) * Math.PI * 2 + 0.6;
    const c = g.center ?? {x: Math.cos(ang) * ring * 1.35, y: Math.sin(ang) * ring * 0.85};
    const spread = Math.sqrt(g.count) * 0.74;
    const first = nodes.length;
    firstOf.push(first);
    for (let i = 0; i < g.count; i++) {
      let p: V = {x: Math.round(c.x), y: Math.round(c.y)};
      for (let t = 0; t < 60 && !(i === 0 && t === 0 && free(p)); t++) {
        const r = spread * Math.sqrt(random(`nr${gi}-${i}-${t}`)) * (0.8 + 0.4 * random(`nj${gi}-${i}`));
        const a = random(`na${gi}-${i}-${t}`) * Math.PI * 2;
        p = {x: Math.round(c.x + Math.cos(a) * r * 1.15), y: Math.round(c.y + Math.sin(a) * r)};
        if (free(p)) break;
      }
      taken.add(`${p.x},${p.y}`);
      nodes.push({group: gi, pos: p, from: p, delay: 0, color: g.colors[Math.floor(random(`nc${gi}-${i}`) * g.colors.length)]});
      if (i > 0) {
        // 앞 노드 몇 개 중 가장 가까운 노드와 잇는다(덩어리 안 짧은 선 → 나무 모양)
        let best = first;
        let bd = Infinity;
        for (let s = 0; s < 5; s++) {
          const j = first + Math.floor(random(`ne${gi}-${i}-${s}`) * i);
          const d = d2(nodes[j].pos, p);
          if (d < bd) [best, bd] = [j, d];
        }
        edges.push({a: best, b: first + i, group: gi});
        if (random(`n2${gi}-${i}`) < 0.22) edges.push({a: first + Math.floor(random(`n3${gi}-${i}`) * i), b: first + i, group: gi});
      }
    }
  });
  // 묶음 중심끼리 고리 + 몇 개의 묶음 사이 선
  hero.groups.forEach((_, gi) => {
    const nx = (gi + 1) % hero.groups.length;
    if (nx !== gi) edges.push({a: firstOf[gi], b: firstOf[nx], group: -1});
    for (let k = 0; k < 3; k++) {
      const ga = hero.groups[gi];
      const gb = hero.groups[nx];
      edges.push({a: firstOf[gi] + Math.floor(random(`xa${gi}-${k}`) * ga.count), b: firstOf[nx] + Math.floor(random(`xb${gi}-${k}`) * gb.count), group: -1});
    }
  });
  const keyIndex = new Map<string, number>();
  for (const s of hero.story) {
    const gi = hero.groups.findIndex((g) => g.key === s.group);
    if (gi < 0) throw new Error(`hero.story ${s.key}: 없는 묶음 ${s.group}`);
    const g = hero.groups[gi];
    let i = firstOf[gi] + (s.pick ?? 1 + Math.floor(random(`pk${s.key}`) * (g.count - 1) * 0.5));
    while (nodes[i].key) i = firstOf[gi] + ((i - firstOf[gi] + 1) % g.count);
    nodes[i].key = s.key;
    nodes[i].label = s.label;
    keyIndex.set(s.key, i);
  }
  const idx = (k: string) => {
    const i = keyIndex.get(k);
    if (i === undefined) throw new Error(`hero: 이름 없는 노드 ${k}`);
    return i;
  };
  for (const [a, b] of hero.links) edges.push({a: idx(a), b: idx(b), group: -2});
  for (const n of hero.added) {
    const m = n.near.map((k) => nodes[idx(k)].pos);
    let p: V = {x: Math.round(m.reduce((s, q) => s + q.x, 0) / m.length + (n.offset?.x ?? 0)), y: Math.round(m.reduce((s, q) => s + q.y, 0) / m.length + (n.offset?.y ?? 0))};
    while (!free(p)) p = add(p, {x: 1, y: 0});
    taken.add(`${p.x},${p.y}`);
    const i = nodes.length;
    nodes.push({group: -1, pos: p, from: p, delay: 0, color: theme.ivory, key: n.key, label: n.label, at: n.at});
    keyIndex.set(n.key, i);
    n.links.forEach((k, j) => edges.push({a: i, b: idx(k), group: -2, at: n.at + 6 + j * 6}));
  }
  // 경계 · 오프닝 출발점(넓게 흩어진 자리)
  const xs = nodes.map((n) => n.pos.x);
  const ys = nodes.map((n) => n.pos.y);
  const box = {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)};
  const center = {x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2};
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const maxR = Math.sqrt((bw / 2) ** 2 + (bh / 2) ** 2);
  nodes.forEach((n, i) => {
    n.from = {x: center.x + (random(`fx${i}`) - 0.5) * bw * 2.1, y: center.y + (random(`fy${i}`) - 0.5) * bh * 2.1};
    n.delay = random(`fd${i}`) * OPEN_STAGGER * 0.6 + (Math.sqrt(d2(n.pos, center)) / maxR) * OPEN_STAGGER * 0.4;
  });
  // 묶음 이름 자리: 전체 중심에서 바깥쪽으로, 그 방향 가장 먼 노드보다 1.5칸 바깥(다른 묶음 위에 겹치지 않게)
  const groupChip = hero.groups.map((_, gi) => {
    const own = nodes.filter((n) => n.group === gi);
    const c = {x: own.reduce((s, n) => s + n.pos.x, 0) / own.length, y: own.reduce((s, n) => s + n.pos.y, 0) / own.length};
    const len = Math.hypot(c.x - center.x, c.y - center.y) || 1;
    const dir = {x: (c.x - center.x) / len, y: (c.y - center.y) / len};
    const far = Math.max(...own.map((n) => (n.pos.x - c.x) * dir.x + (n.pos.y - c.y) * dir.y));
    return {x: c.x + dir.x * (far + 1.5), y: c.y + dir.y * (far + 1.5), dir};
  });
  return {nodes, edges, idx, box, center, bw, bh, groupChip};
})();

export const heroIndex = G.idx;

// ── 카메라
type Cam = {c: V; z: number};
const shotTarget = (s: (typeof hero.shots)[number]): Cam => {
  if (!s.focus?.length) return {c: G.center, z: s.zoom ?? 1};
  const ps = s.focus.map((k) => G.nodes[G.idx(k)].pos);
  return {c: {x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length}, z: s.zoom ?? 1};
};
const camAt = (frame: number): Cam => {
  const shots = hero.shots;
  let from = shotTarget(shots[0]);
  let to = from;
  let at0 = shots[0].at;
  for (let i = 1; i < shots.length && shots[i].at <= frame; i++) {
    const k = easeInOut(lin(shots[i].at, at0, at0 + SHOT_DUR));
    from = {c: lerpV(from.c, to.c, k), z: lerp(from.z, to.z, k)};
    to = shotTarget(shots[i]);
    at0 = shots[i].at;
  }
  const k = easeInOut(lin(frame, at0, at0 + SHOT_DUR));
  const c = lerpV(from.c, to.c, k);
  // 아주 느린 흔들림(정지 화면처럼 보이지 않게)
  return {c: {x: c.x + Math.sin(frame / 95) * 0.45, y: c.y + Math.cos(frame / 120) * 0.3}, z: lerp(from.z, to.z, k)};
};

export const heroView = (frame: number, w: number, h: number) => {
  const cam = camAt(frame);
  const s = Math.min((w * 0.84) / (G.bw + 2), (h * 0.8) / (G.bh + 2)) * cam.z;
  const toScreen = (p: V): V => ({x: (p.x - cam.c.x) * s + w / 2, y: (p.y - cam.c.y) * s + h / 2});
  return {s, z: cam.z, toScreen};
};

const worldAt = (i: number, frame: number): V => {
  const n = G.nodes[i];
  if (n.at !== undefined) return n.pos;
  const t = easeInOut(lin(frame, OPEN_LEAD + n.delay, OPEN_LEAD + n.delay + OPEN_DUR));
  return lerpV(n.from, n.pos, t);
};
const openK = (i: number, frame: number) => {
  const n = G.nodes[i];
  return n.at !== undefined ? 1 : lin(frame, OPEN_LEAD + n.delay, OPEN_LEAD + n.delay + OPEN_DUR);
};
const exists = (i: number, frame: number) => G.nodes[i].at === undefined || frame >= G.nodes[i].at!;

// ── 강조 상태: 여러 구간이 겹치면 최댓값(더하면 밝기가 튄다)
const statesAt = (frame: number) => {
  let focus = 0;
  const sel = new Map<number, number>();
  const lit = new Map<number, number>();
  const edges: [number, number, number][] = [];
  for (const w of hero.windows) {
    const k = windowWeight(frame, w.start, w.end, RAMP);
    if (k <= 0) continue;
    focus = Math.max(focus, k);
    for (const key of w.sel ?? []) sel.set(G.idx(key), Math.max(sel.get(G.idx(key)) ?? 0, k));
    for (const key of w.lit ?? []) lit.set(G.idx(key), Math.max(lit.get(G.idx(key)) ?? 0, k));
    for (const [a, b] of w.edges ?? []) edges.push([G.idx(a), G.idx(b), k]);
  }
  return {focus, sel, lit, edges};
};

// ── 이름표: 강조 구간의 경계마다 장면을 나누고, 장면 안에서는 자리를 바꾸지 않는다.
type Seg = {a: number; b: number; keys: string[]};
const SEGS: Seg[] = (() => {
  const cuts = new Set<number>([0, T.end]);
  hero.windows.forEach((w) => {
    cuts.add(w.start);
    cuts.add(w.end);
  });
  const xs = [...cuts].sort((p, q) => p - q);
  const out: Seg[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const keys = new Set<string>();
    for (const w of hero.windows)
      if (w.start <= xs[i] && w.end >= xs[i + 1]) [...(w.sel ?? []), ...(w.lit ?? [])].forEach((k) => keys.add(k));
    out.push({a: xs[i], b: xs[i + 1], keys: [...keys]});
  }
  return out;
})();

type Place = {side: 1 | -1; dy: number};
const labelText = (k: string) => G.nodes[G.idx(k)].label ?? k;
const labelBox = (k: string, fs: number) => ({w: textWidth(labelText(k), fs) + 18, h: Math.round(fs * 1.5) + 6});
const GAP = 12;

const placeCache = new Map<string, Map<string, Place>[]>();
const placements = (w: number, h: number, fs: number) => {
  const ck = `${w}x${h}x${fs}`;
  const hit = placeCache.get(ck);
  if (hit) return hit;
  const res = SEGS.map((seg) => {
    const f = Math.min(seg.b - 1, seg.a + SETTLE);
    const v = heroView(f, w, h);
    const items = seg.keys
      .map((k) => ({k, p: v.toScreen(worldAt(G.idx(k), f)), box: labelBox(k, fs)}))
      .sort((p, q) => p.p.y - q.p.y);
    const taken: {x0: number; x1: number; y0: number; y1: number}[] = [];
    const out = new Map<string, Place>();
    for (const it of items) {
      const prefer: (1 | -1)[] = it.p.x + GAP + it.box.w > w - 8 ? [-1, 1] : [1, -1];
      let chosen: Place = {side: prefer[0], dy: 0};
      search: for (const dy of [0, it.box.h + 4, -(it.box.h + 4), 2 * (it.box.h + 4)])
        for (const side of prefer) {
          const x0 = side > 0 ? it.p.x + GAP : it.p.x - GAP - it.box.w;
          const r = {x0, x1: x0 + it.box.w, y0: it.p.y - it.box.h / 2 + dy, y1: it.p.y + it.box.h / 2 + dy};
          const inside = r.x0 >= 6 && r.x1 <= w - 6 && r.y0 >= 6 && r.y1 <= h - 6;
          if (inside && !taken.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) {
            chosen = {side, dy};
            taken.push(r);
            break search;
          }
        }
      out.set(it.k, chosen);
    }
    return out;
  });
  placeCache.set(ck, res);
  return res;
};

// 마무리 픽셀의 출발점(주인공 시각물 영역 안 좌표)
export const heroPoints = (frame: number, w: number, h: number) => {
  const v = heroView(frame, w, h);
  const size = Math.max(2.5, v.s * 0.62);
  return G.nodes.flatMap((n, i) => (exists(i, frame) ? [{...v.toScreen(worldAt(i, frame)), size, color: n.color}] : []));
};

export const heroStats = (frame: number) => ({
  nodes: G.nodes.filter((_, i) => exists(i, frame)).length,
  edges: G.edges.filter((e) => e.at === undefined || frame >= e.at).length,
});

type Props = {frame: number; w: number; h: number; labelSize: number; small: number; legend: boolean; hud: boolean};

export const PixelNetwork: React.FC<Props> = ({frame, w, h, labelSize, small, legend, hud}) => {
  const v = heroView(frame, w, h);
  const st = statesAt(frame);
  const pos = G.nodes.map((_, i) => v.toScreen(worldAt(i, frame)));
  const base = Math.max(2, v.s * 0.62);
  const edgeIn = lin(frame, 34, 70);
  const ew = Math.max(1, v.s * 0.09);

  // 바탕 선: 묶음별 한 path(색 = 묶음 기본색)
  const paths = new Map<number, string>();
  const growing: React.ReactNode[] = [];
  G.edges.forEach((e, k) => {
    const a = pos[e.a];
    const b = pos[e.b];
    if (e.at !== undefined) {
      if (frame < e.at) return;
      const g = lin(frame, e.at, e.at + EDGE_GROW);
      const m = lerpV(a, b, g);
      // 자라는 동안은 밝게, 다 자란 뒤 20프레임에 걸쳐 바탕 선 밝기로(강조 중이면 강조 선이 따로 그려진다)
      const ga = lerp(0.85, Math.min(1, EDGE_ALPHA * 2.5) * (1 - 0.75 * st.focus), lin(frame, e.at + EDGE_GROW, e.at + EDGE_GROW + 20));
      growing.push(<line key={`g${k}`} x1={a.x} y1={a.y} x2={m.x} y2={m.y} stroke={theme.ivory} strokeWidth={ew * 1.6} opacity={ga} />);
      return;
    }
    paths.set(e.group, (paths.get(e.group) ?? '') + `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  });
  const edgeA = EDGE_ALPHA * (1 - 0.75 * st.focus) * edgeIn;

  // 떠도는 신호(아이보리 점): 강조 중에는 약해진다
  const signals: React.ReactNode[] = [];
  if (frame > 60) {
    const base0 = G.edges.filter((e) => e.at === undefined);
    for (let i = 0; i < SIGNALS; i++) {
      const P = 36 + Math.floor(random(`sp${i}`) * 40);
      const off = Math.floor(random(`so${i}`) * P);
      const cyc = Math.floor((frame + off) / P);
      const e = base0[Math.floor(random(`se${i}-${cyc}`) * base0.length)];
      const t = ((frame + off) % P) / P;
      const p = lerpV(pos[e.a], pos[e.b], t);
      const s = Math.max(2, base * 0.45);
      signals.push(<rect key={`s${i}`} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} fill={theme.ivory} opacity={Math.sin(Math.PI * t) * 0.7 * (1 - 0.6 * st.focus)} />);
    }
  }

  // 에이전트 흐름(금색 픽셀)
  const flows: React.ReactNode[] = [];
  hero.flows.forEach((fl, fi) => {
    const k = windowWeight(frame, fl.start, fl.end, RAMP);
    if (k <= 0) return;
    for (let s = 0; s < fl.path.length - 1; s++) {
      const a = pos[G.idx(fl.path[s])];
      const b = pos[G.idx(fl.path[s + 1])];
      for (let j = 0; j < 3; j++) {
        const t = (((frame - fl.start) / 24 + j / 3) % 1 + 1) % 1;
        const p = lerpV(a, b, t);
        const sz = Math.max(3, base * 0.7);
        flows.push(<rect key={`f${fi}-${s}-${j}`} x={p.x - sz / 2} y={p.y - sz / 2} width={sz} height={sz} fill={theme.gold} opacity={k} />);
      }
    }
  });

  // 노드
  const rects: React.ReactNode[] = [];
  const rings: React.ReactNode[] = [];
  G.nodes.forEach((n, i) => {
    if (!exists(i, frame)) return;
    const sel = st.sel.get(i) ?? 0;
    const lit = st.lit.get(i) ?? 0;
    let a = 0.92 * (1 + (DIM - 1) * st.focus);
    a += (1 - a) * Math.max(lit, sel);
    a *= 0.2 + 0.8 * openK(i, frame);
    const pop = n.at !== undefined ? popIn(frame, n.at) : 1;
    const s = base * (1 + 0.6 * sel) * pop;
    const p = pos[i];
    rects.push(<rect key={i} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} fill={n.color} opacity={a} />);
    if (sel > 0) {
      const r = s + 8;
      rings.push(<rect key={`r${i}`} x={p.x - r / 2} y={p.y - r / 2} width={r} height={r} fill="none" stroke={theme.gold} strokeWidth={2} opacity={sel} />);
    }
  });

  // 이름표
  const segI = SEGS.findIndex((sg) => frame >= sg.a && frame < sg.b);
  const labels: React.ReactNode[] = [];
  if (segI >= 0) {
    const pl = placements(w, h, labelSize);
    const seg = SEGS[segI];
    const same = (j: number, k: string, p: Place) => {
      const q = pl[j]?.get(k);
      return !!q && SEGS[j].keys.includes(k) && q.side === p.side && q.dy === p.dy;
    };
    for (const k of seg.keys) {
      const p = pl[segI].get(k)!;
      const i = G.idx(k);
      const fadeIn = same(segI - 1, k, p) ? 1 : lin(frame, seg.a, seg.a + LABEL_FADE);
      const fadeOut = same(segI + 1, k, p) ? 1 : 1 - lin(frame, seg.b - LABEL_FADE, seg.b);
      const q = pos[i];
      const onScreen = clamp01(Math.min(q.x, w - q.x, q.y, h - q.y) / 24); // 노드가 화면 밖이면 이름표도 숨긴다
      const born = G.nodes[i].at !== undefined ? lin(frame, G.nodes[i].at!, G.nodes[i].at! + LABEL_FADE) : 1;
      const o = Math.min(fadeIn, fadeOut) * onScreen * born;
      if (o <= 0) continue;
      const box = labelBox(k, labelSize);
      const x = p.side > 0 ? q.x + GAP : q.x - GAP - box.w;
      const isSel = (st.sel.get(i) ?? 0) > 0.5;
      labels.push(
        <div
          key={`l${k}`}
          style={{
            position: 'absolute',
            left: x,
            top: q.y - box.h / 2 + p.dy,
            height: box.h,
            boxSizing: 'border-box',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            background: theme.navy900,
            border: `1px solid ${theme.navy600}`,
            borderLeft: `2px solid ${isSel ? theme.gold : theme.slate400}`,
            fontFamily: theme.mono,
            fontSize: labelSize,
            color: theme.ivory,
            whiteSpace: 'nowrap',
            opacity: o,
          }}
        >
          {labelText(k)}
        </div>,
      );
    }
  }

  // 묶음 이름(강조가 없을 때만)
  const chipA = (1 - st.focus) * lin(frame, 50, 70);
  const chips =
    chipA > 0
      ? hero.groups.map((g, gi) => {
          const gc = G.groupChip[gi];
          const c = v.toScreen(gc);
          const on = clamp01(Math.min(c.x, w - c.x, c.y, h - c.y) / 30);
          // 묶음 바깥쪽에 붙이되 영역 안으로 밀어 넣는다(가장자리에서 잘리지 않게)
          const cw = textWidth(g.label, small) + Math.round(small * 0.6) + 18;
          const ch = Math.round(small * 1.4) + 2;
          const ax = gc.dir.x < -0.3 ? c.x - cw : gc.dir.x > 0.3 ? c.x : c.x - cw / 2;
          const left = Math.max(4, Math.min(w - cw - 4, ax));
          const top = Math.max(4, Math.min(h - ch - 4, c.y - ch / 2));
          return (
            <div
              key={`c${g.key}`}
              style={{
                position: 'absolute',
                left,
                top,
                padding: '1px 6px',
                background: theme.navy900,
                fontFamily: theme.mono,
                fontSize: small,
                color: theme.slate300,
                whiteSpace: 'nowrap',
                opacity: chipA * on,
              }}
            >
              <i style={{display: 'inline-block', width: small * 0.6, height: small * 0.6, background: g.colors[0], marginRight: 6}} />
              {g.label}
            </div>
          );
        })
      : null;

  const status = hero.status.find((s) => frame >= s.start && frame < s.end)?.text ?? 'idle';
  const stats = heroStats(frame);

  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden'}}>
      <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0}} shapeRendering="crispEdges">
        {[...paths.entries()].map(([g, d]) => (
          <path key={`e${g}`} d={d} stroke={g >= 0 ? hero.groups[g].colors[0] : theme.slate400} strokeWidth={ew} opacity={edgeA} fill="none" />
        ))}
        {st.edges.map(([a, b, k], j) =>
          exists(a, frame) && exists(b, frame) ? (
            <line key={`le${j}`} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke={theme.ivory} strokeWidth={ew * 2} opacity={0.9 * k} />
          ) : null,
        )}
        {growing}
        {signals}
        {rects}
        {rings}
        {flows}
      </svg>
      {chips}
      {labels}
      {legend ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            padding: '8px 10px',
            minWidth: 150,
            background: theme.navy900,
            border: `1px solid ${theme.navy600}`,
            fontFamily: theme.mono,
            fontSize: small,
            lineHeight: 1.5,
          }}
        >
          {hero.groups.map((g) => (
            <div key={g.key} style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <i style={{width: 8, height: 8, background: g.colors[0]}} />
              <span style={{color: theme.slate400}}>{g.label}</span>
              {video.mode === 'demo' ? <span style={{marginLeft: 'auto', color: theme.slate300, fontVariantNumeric: 'tabular-nums'}}>{g.count}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {hud ? (
        <div style={{position: 'absolute', left: 8, bottom: 6, padding: '3px 6px', background: theme.navy900, fontFamily: theme.mono, fontSize: small, color: theme.slate400}}>
          {video.mode === 'demo' ? `${stats.nodes} nodes · ` : ''}zoom {v.z.toFixed(2)}x
        </div>
      ) : null}
      <div style={{position: 'absolute', right: 8, bottom: 6, padding: '3px 6px', background: theme.navy900, fontFamily: theme.mono, fontSize: small, color: status === 'idle' ? theme.slate400 : theme.ivory}}>
        {status}
      </div>
    </div>
  );
};
