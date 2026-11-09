// 내용 창: 목록(트리), 문서(읽기·쓰기), 명령·결과, 로그. 데이터는 data/scenario.ts.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {pixelFont, theme} from '../config/theme';
import {T} from '../config/timeline';
import {docGutter, Layout, Rect} from '../config/layout';
import {hero} from '../data/hero';
import {changes, docs, logs, outputs, titles, tree, treeFocus, video} from '../data/scenario';
import type {Doc, Log, Output} from '../data/types';
import {appear, cursorOn, flash, fmtTime, latest, lin, typed} from '../lib/anim';
import {Panel} from './Panel';

type P = {frame: number; L: Layout};
const metaAt = (meta: [number, string][], frame: number) => [...meta].reverse().find(([f]) => frame >= f)?.[1] ?? '';
const docAt = (frame: number) => [...docs].reverse().find((d) => frame >= d.from);
const outAt = (frame: number) => [...outputs].reverse().find((o) => frame >= o.from);
const ACTIVE = {start: T.intro.end, end: T.allDone}; // 첫 단계 시작 ~ 완료

// ── 목록 창(16:9)
export const TreePanel: React.FC<P> = ({frame, L}) => {
  if (!L.tree) return null;
  const r = L.tree;
  const focus = new Set(treeFocus.filter((w) => frame >= w.start && frame < w.end).flatMap((w) => w.keys));
  const changeRows = changes.length + 1;
  const changesTop = r.h - L.t.bar - 2 - changeRows * L.t.line - 24;
  return (
    <Panel title="files" meta={video.path} {...r} active={frame >= ACTIVE.start && frame < ACTIVE.end}>
      <div style={{padding: '10px 14px', fontSize: L.t.body - 1, lineHeight: `${L.t.line - 1}px`}}>
        {tree.map((t, i) => {
          if (t.appearAt !== undefined && frame < t.appearAt) return null;
          const on = t.key ? focus.has(t.key) : false;
          const g = t.group ? hero.groups.find((x) => x.key === t.group) : undefined;
          const isNew = t.appearAt !== undefined;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: t.depth * 16,
                marginLeft: -8,
                paddingRight: 6,
                whiteSpace: 'nowrap',
                color: on ? theme.ivory : t.dir ? theme.slate400 : theme.slate300,
                background: on ? theme.navy700 : 'transparent',
                borderLeft: `2px solid ${on ? theme.ivory : 'transparent'}`,
                ...(isNew ? appear(frame, t.appearAt!, 10) : {}),
              }}
            >
              {g ? <i style={{width: 7, height: 7, background: g.colors[0], marginLeft: 6, marginRight: 2}} /> : null}
              <span style={{marginLeft: 6}}>
                {t.label}
                {t.collapsed ? ' ▸' : ''}
              </span>
              {isNew ? <span style={{fontSize: L.t.small - 2, marginLeft: 8, padding: '0 4px', color: theme.navy800, background: theme.ivory}}>NEW</span> : null}
              {g && video.mode === 'demo' ? <span style={{marginLeft: 'auto', color: theme.slate400, fontVariantNumeric: 'tabular-nums'}}>{g.count}</span> : null}
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 14, right: 14, top: changesTop, borderTop: `1px solid ${theme.navy600}`, paddingTop: 12, fontSize: L.t.small, lineHeight: `${L.t.line - 1}px`}}>
        <div style={{color: theme.slate400}}>// changes</div>
        {frame < changes[0].at ? <div style={{color: theme.slate400}}>  no changes yet</div> : null}
        {changes.map((c) =>
          frame >= c.at ? (
            <div
              key={c.path}
              style={{display: 'flex', gap: 8, color: flash(frame, c.at, 30) > 0 ? theme.ivory : theme.slate300, background: `rgba(246,241,231,${0.12 * flash(frame, c.at, 30)})`, ...appear(frame, c.at, 10)}}
            >
              <span style={{width: 12, color: theme.ivory}}>{c.sign}</span>
              <span style={{flex: 1, whiteSpace: 'nowrap', overflow: 'hidden'}}>{c.path}</span>
              <span style={{color: theme.slate400}}>{c.note}</span>
            </div>
          ) : null,
        )}
      </div>
    </Panel>
  );
};

// ── 문서 창: 읽는 막대(scan), 타이핑 줄(added), 표시 줄(mark). 줄이 창보다 많으면 지금 보는 줄이 보이게 내린다.
const DocBody: React.FC<{doc: Doc; frame: number; L: Layout; r: Rect}> = ({doc, frame, L, r}) => {
  const lh = L.t.line;
  const maxLines = Math.max(1, Math.floor((r.h - L.t.bar - 16) / lh));
  const visible = doc.lines.map((l) => !l.added || frame >= l.added.start);
  const scanRow = doc.scan ? Math.min(doc.scan.to, Math.floor(lin(frame, doc.scan.start, doc.scan.end) * (doc.scan.to + 1))) : -1;
  const typingRow = doc.lines.findIndex((l) => l.added && frame >= l.added.start);
  const marks = doc.lines.map((l, i) => (l.mark && frame >= l.mark.at ? i : -1)).filter((i) => i >= 0);
  const focusRow = typingRow >= 0 ? typingRow : marks.length ? marks[marks.length - 1] : Math.max(0, scanRow);
  const rows = doc.lines.map((l, i) => ({l, i})).filter(({i}) => visible[i]);
  const pos = rows.findIndex(({i}) => i === focusRow);
  const offset = Math.max(0, Math.min(pos - maxLines + 2, rows.length - maxLines));
  const gutter = docGutter(L);
  const scanning = doc.scan && frame >= doc.scan.start && frame < doc.scan.end + 20;
  return (
    <div style={{padding: '8px 0', fontSize: L.t.body, lineHeight: `${lh}px`, position: 'relative', ...appear(frame, doc.from, 8)}}>
      {rows.slice(offset, offset + maxLines).map(({l, i}, k) => {
        const text = l.added ? typed(l.text, frame, l.added.start, l.added.end) : l.text;
        const typing = l.added && frame < l.added.end;
        const marked = l.mark && frame >= l.mark.at;
        const scanHere = scanning && i === scanRow;
        const mf = l.mark ? flash(frame, l.mark.at, 16) : 0;
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              display: 'flex',
              background: marked || l.added || scanHere ? theme.navy700 : 'transparent',
              borderLeft: `2px solid ${scanHere || marked ? theme.ivory : 'transparent'}`,
              backgroundImage: mf > 0 ? `linear-gradient(rgba(246,241,231,${0.1 * mf}), rgba(246,241,231,${0.1 * mf}))` : undefined, // 단색 덧칠(그림자 아님)
              color: l.kind === 'h1' || marked || l.added ? theme.ivory : l.kind === 'note' ? theme.slate400 : theme.slate300,
              fontWeight: l.kind === 'h1' || l.kind === 'h2' ? 700 : 400,
            }}
          >
            <span style={{width: gutter, flex: 'none', textAlign: 'right', paddingRight: 10, boxSizing: 'border-box', color: theme.slate400}}>{offset + k + 1}</span>
            <span style={{width: L.t.body, flex: 'none', color: theme.ivory}}>{l.added ? '+' : ''}</span>
            {/* 넘치면 …로 끝난다(표시에 가려지지 않게). 넘침은 npm run check:fit이 미리 잡는다 */}
            <span style={{flex: '1 1 auto', minWidth: 0, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis'}}>
              {text}
              {typing && cursorOn(frame) ? <span style={{background: theme.ivory}}> </span> : null}
            </span>
            {marked ? <span style={{marginLeft: 'auto', paddingLeft: 8, paddingRight: 12, flex: 'none', color: theme.ivory}}>◀ {l.mark!.label}</span> : null}
          </div>
        );
      })}
    </div>
  );
};

type WinProps = P & {r?: Rect; bodyStyle?: React.CSSProperties};
// 아직 내용이 없는 창: 주제 고유의 첫 줄(video.idle)을 보인다
const Idle: React.FC<{L: Layout}> = ({L}) => <div style={{padding: '10px 16px', fontSize: L.t.body, color: theme.slate400, whiteSpace: 'nowrap', overflow: 'hidden'}}>{video.idle}</div>;

export const FilePanel: React.FC<WinProps> = ({frame, L, r = L.file, bodyStyle}) => {
  const doc = docAt(frame);
  const writing = doc?.lines.some((l) => l.added && frame >= l.added.start && frame < l.added.end + 12);
  const reading = doc?.scan && frame >= doc.scan.start && frame < doc.scan.end + 20;
  return (
    <Panel title={doc ? doc.title : 'file'} meta={doc ? metaAt(doc.meta, frame) : 'idle'} {...r} active={!!(writing || reading)} bodyStyle={bodyStyle}>
      {doc ? <DocBody doc={doc} frame={frame} L={L} r={r} /> : <Idle L={L} />}
    </Panel>
  );
};

// ── 명령·결과 창
// 결과 줄은 모두 고정폭(명령·파일명·로그 원문과 같은 글꼴, 한글은 Pretendard로 대체). 세로는 보조 설명(sub)을 다음 줄에 둔다.
const OutBody: React.FC<{o: Output; frame: number; L: Layout; busy: boolean}> = ({o, frame, L, busy}) => {
  const compact = L.kind === 'portrait';
  const p = o.prompt;
  const lh = compact ? L.t.line - 4 : L.t.line - 1;
  return (
    <div style={{padding: '10px 16px', fontSize: L.t.body, lineHeight: `${lh}px`, ...appear(frame, o.from, 8)}}>
      {p ? (
        <div style={{color: frame >= p.start ? theme.ivory : theme.slate400, whiteSpace: 'pre'}}>
          <span style={{color: busy ? theme.gold : theme.slate400}}>$ </span>
          {typed(p.text, frame, p.start, p.end)}
          {frame < p.end + 8 && cursorOn(frame) ? <span style={{background: theme.ivory}}> </span> : null}
        </div>
      ) : null}
      {o.route && frame >= o.route.at && !compact ? (
        <div style={{color: theme.slate400, fontSize: L.t.small, marginTop: 4}}>
          route:{' '}
          {o.route.steps.map((s, i) => (
            <span key={s} style={{...appear(frame, o.route!.at + i * 8, 8)}}>
              <span style={{color: theme.ivory}}>{s}</span>
              {i < o.route!.steps.length - 1 ? ' → ' : ''}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{marginTop: compact ? 2 : 6}}>
        {o.lines.map((l, i) => {
          if (frame < l.at) return null;
          const f = flash(frame, l.at, 20);
          const score = (l.score ?? 0) * lin(frame, l.at, l.at + 12);
          const glyph =
            l.mark === 'fail' ? (
              <span style={{fontFamily: theme.mono, fontSize: L.t.small, padding: '0 5px', marginRight: 10, background: theme.ivory, color: theme.navy800, fontWeight: 700}}>FAIL</span>
            ) : (
              <span style={{fontFamily: theme.mono, color: l.mark === 'ok' ? theme.ivory : theme.slate400, marginRight: 10}}>{l.mark === 'ok' ? '✓' : l.mark === 'info' ? '·' : String(i + 1).padStart(2, '0')}</span>
            );
          return (
            <div key={i} style={{marginTop: compact ? 4 : 8, ...appear(frame, l.at, 10), background: f > 0 ? `rgba(246,241,231,${0.1 * f})` : 'transparent'}}>
              <div style={{fontFamily: theme.mono, fontSize: L.t.body, color: theme.ivory, whiteSpace: 'nowrap', overflow: 'hidden'}}>
                {glyph}
                {l.text}
              </div>
              {compact && l.sub ? (
                <div style={{fontSize: L.t.small, lineHeight: `${L.t.small + 6}px`, color: theme.slate400, paddingLeft: Math.round(L.t.body * 1.2), whiteSpace: 'nowrap', overflow: 'hidden'}}>{l.sub}</div>
              ) : null}
              {!compact && (l.sub || l.score !== undefined) ? (
                <div style={{display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 28, fontSize: L.t.small, lineHeight: '18px', color: theme.slate400}}>
                  <span>↳ {l.sub}</span>
                  {l.score !== undefined ? (
                    <>
                      <span style={{marginLeft: 'auto', width: 90, height: 4, background: theme.navy600}}>
                        <span style={{display: 'block', width: `${score * 100}%`, height: '100%', background: theme.slate300}} />
                      </span>
                      <span style={{color: theme.slate300, width: 34, textAlign: 'right'}}>{score.toFixed(2)}</span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const OutputPanel: React.FC<WinProps> = ({frame, L, r = L.output, bodyStyle}) => {
  const o = outAt(frame);
  const busy = !!o && frame < (o.lines[o.lines.length - 1]?.at ?? o.from) + 20;
  return (
    <Panel title={o ? o.title : 'run'} meta={o ? metaAt(o.meta, frame) : 'idle'} {...r} active={busy} bodyStyle={bodyStyle}>
      {o ? <OutBody o={o} frame={frame} L={L} busy={busy} /> : <Idle L={L} />}
    </Panel>
  );
};

// ── 세로 배치: 문서·결과가 한 자리를 나눠 쓴다. 마지막으로 무언가 바뀐 창을 보인다(바뀔 때 8프레임 등장).
const lastDocEvent = (frame: number) => {
  const d = docAt(frame);
  if (!d) return -1;
  return Math.max(d.from, ...d.lines.flatMap((l) => [l.added && frame >= l.added.start ? l.added.start : -1, l.mark && frame >= l.mark.at ? l.mark.at : -1]));
};
const lastOutEvent = (frame: number) => {
  const o = outAt(frame);
  if (!o) return -1;
  return Math.max(o.from, ...o.lines.map((l) => (frame >= l.at ? l.at : -1)));
};
const SWAP = (() => {
  const pick: ('doc' | 'out')[] = [];
  const since: number[] = [];
  for (let f = 0; f <= T.end; f++) {
    const p = lastOutEvent(f) > lastDocEvent(f) ? 'out' : 'doc';
    pick.push(p);
    since.push(f > 0 && pick[f - 1] === p ? since[f - 1] : f);
  }
  return {pick, since};
})();

const SWAP_OUT = 4; // 앞 내용이 사라지는 프레임
const SWAP_IN = 5; // 그 뒤 새 내용이 나타나는 프레임(두 창 글자가 겹쳐 보이지 않게 차례로)
const swapView = (pick: 'doc' | 'out', frame: number, L: Layout, bodyStyle: React.CSSProperties) =>
  pick === 'out' ? <OutputPanel frame={frame} L={L} r={L.output} bodyStyle={bodyStyle} /> : <FilePanel frame={frame} L={L} r={L.file} bodyStyle={bodyStyle} />;

// 바뀔 때 창 틀은 그대로 두고 내용만 4프레임에 사라진 뒤 5프레임에 나타난다(빈 창이 보이지 않게, 글자가 겹치지 않게).
// 새 창의 첫 글자(명령 타이핑·첫 줄)는 그 창의 from에서 6프레임 안에 시작하게 잡는다(direction.md 5절).
export const SwapPanel: React.FC<P> = ({frame, L}) => {
  const f = Math.max(0, Math.min(T.end, frame));
  const since = SWAP.since[f];
  if (since > 0 && frame < since + SWAP_OUT) return swapView(SWAP.pick[since - 1], frame, L, {opacity: 1 - lin(frame, since, since + SWAP_OUT)});
  const k = since > 0 ? lin(frame, since + SWAP_OUT, since + SWAP_OUT + SWAP_IN) : 1;
  return swapView(SWAP.pick[f], frame, L, {opacity: k});
};

// ── 로그: 16:9는 창(최근 n줄), 9:16은 한 줄 상태 표시.
// 한 줄은 읽을 수 있게 LOG_HOLD 이상 머문다: 보이던 줄이 LOG_HOLD를 채우면 그때의 최신 로그로 바뀐다
// (빠르게 이어진 로그는 건너뛴다). 단, 단계 제목이 바뀐 뒤의 첫 로그는 바로 보인다(제목과 로그가 어긋나지 않게).
// 세로에서 모든 로그를 읽히게 하려면 로그 간격을 30프레임 이상으로 잡는다. 프레임별 표를 한 번 만든다(결정적).
const LOG_HOLD = 30;
const stageOf = (at: number) => titles.filter((t) => at >= t.at).length;
const LOG_LINE = (() => {
  const shown: {log?: Log; since: number}[] = [];
  let cur: Log | undefined;
  let since = 0;
  for (let f = 0; f <= T.end; f++) {
    const next = latest(logs, f);
    if (next !== cur && (!cur || f - since >= LOG_HOLD || (next && stageOf(next.at) !== stageOf(cur.at)))) {
      cur = next;
      since = f;
    }
    shown.push({log: cur, since});
  }
  return shown;
})();

export const LogPanel: React.FC<P & {doneBadge: React.ReactNode}> = ({frame, L, doneBadge}) => {
  const {fps} = useVideoConfig();
  const r = L.log;
  const visible = logs.filter((l) => frame >= l.at).slice(-r.lines);
  if (!r.panel) {
    const {log: l, since} = LOG_LINE[Math.max(0, Math.min(T.end, frame))];
    return (
      <div style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, display: 'flex', alignItems: 'center', gap: 14, fontSize: L.t.log, whiteSpace: 'nowrap', overflow: 'hidden'}}>
        {frame >= T.allDone ? (
          doneBadge
        ) : l ? (
          <div key={l.at} style={{display: 'flex', gap: 14, minWidth: 0, ...appear(frame, since, 8)}}>
            <span style={{color: theme.slate400, flex: 'none'}}>[{l.tag}]</span>
            <span style={{color: theme.ivory, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'}}>{l.text}</span>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <Panel title="agent.log" meta="tail -f" {...r}>
      <div style={{padding: '6px 16px', fontSize: L.t.log, lineHeight: `${L.t.logLine}px`}}>
        {visible.map((l, i) => {
          const isLast = i === visible.length - 1;
          const a = appear(frame, l.at, 8);
          const nf = flash(frame, l.at, 16);
          return (
            <div key={l.at + l.tag} style={{display: 'flex', gap: 18, ...a, color: isLast ? theme.ivory : theme.slate400, background: nf > 0 ? `rgba(246,241,231,${0.1 * nf})` : 'transparent'}}>
              {video.mode === 'demo' ? <span style={{color: theme.slate400}}>{fmtTime(l.at, fps)}</span> : null}
              <span style={{width: 76, color: isLast ? theme.slate300 : theme.slate400}}>{l.tag}</span>
              <span>{l.text}</span>
            </div>
          );
        })}
      </div>
      {frame >= T.allDone ? <div style={{position: 'absolute', right: 16, top: 18}}>{doneBadge}</div> : null}
    </Panel>
  );
};

export const DoneBadge: React.FC<P> = ({frame, L}) => (
  <div style={{fontFamily: pixelFont(video.doneBadge), fontSize: L.kind === 'portrait' ? 28 : 20, letterSpacing: 2, color: theme.navy800, background: theme.ivory, padding: '6px 16px', whiteSpace: 'nowrap', ...appear(frame, T.allDone, 10)}}>
    {video.doneBadge}
  </div>
);
