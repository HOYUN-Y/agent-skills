// 화면 글자 넘침 검사: 모든 문구가 배치(layout.ts)의 자리 안에 들어가는지 두 화면비에서 어림한다.
// 실행: npm run check:fit — 넘치는 문구마다 필요한 폭과 가능한 폭을 보이고 종료 코드 1.
// 폭 계산은 components/의 실제 배치(여백·기호 칸)를 따른다. 부품을 고치면 여기도 맞춘다.
// 어림값(고정폭 0.6em, 한글 1em, 픽셀 0.65em)이라 경계에 걸친 문구는 정지 프레임으로 확인한다.
declare const process: {exit(code: number): never}; // Node 전역(@types/node 없이)

import {docGutter, LANDSCAPE, Layout, layoutFor, monoWidth, pixelWidth, textWidth} from '../config/layout';
import {hero, heroKind} from '../data/hero';
import {pipeline} from '../data/pipeline';
import {actors, brand, docs, logs, metrics, outputs, titles, video} from '../data/scenario';

type Issue = {where: string; text: string; need: number; have: number};

const check = (L: Layout): Issue[] => {
  const out: Issue[] = [];
  const fit = (where: string, text: string, need: number, have: number) => {
    if (need > have) out.push({where, text, need: Math.ceil(need), have: Math.floor(have)});
  };
  const t = L.t;
  const barTitle = (w: number) => (w - 2 * t.barFont - 4 * Math.round(t.barFont * 0.62)) * 0.7; // Panel: 제목은 제목줄의 70%까지

  // 머리줄
  const badge = textWidth(video.badge, t.metricLabel) + 2 * video.badge.length + 22;
  const metricRow = metrics.reduce((s, m) => s + textWidth(m.label, t.metricLabel) + 1.5 * m.label.length + 8 + monoWidth(m.width, t.metric) + 6, 0) + (metrics.length - 1) * 24;
  const clock = video.mode === 'demo' ? monoWidth(7, t.metric) + 17 : 0;
  const path = L.kind === 'landscape' ? textWidth(' ' + video.path, t.header) : 0;
  const headLeft = L.logoTile + 14 + textWidth(brand.slug, t.header) + path;
  if (L.metrics) {
    fit('머리줄', `${brand.slug} + ${video.badge}`, headLeft + 24 + badge, L.header.w);
    fit('머리줄 수치', metrics.map((m) => m.label).join(' · '), metricRow + clock, L.metrics.w);
  } else fit('머리줄', `${brand.slug} + 배지 + 수치`, headLeft + 24 + badge + 24 + metricRow + clock, L.header.w);

  // 단계 제목·태그
  for (const ti of titles) {
    fit('단계 제목', ti.title, pixelWidth('$ ' + ti.title, t.title, 2) + t.title * 0.4 + 8, L.title.w);
    fit('태그', ti.tag, textWidth('// ' + ti.tag, t.tag), L.title.w);
  }

  // 카드
  const A = L.actors;
  if (A) {
    const w = (A.w - A.gap * (A.cols - 1)) / A.cols;
    const pad = L.kind === 'portrait' ? 14 : 13;
    const inner = w - 2 * (pad + 1);
    for (const a of actors) {
      const name = Math.round(t.cardTitle * 0.5) * 1.7 + pixelWidth(a.name, t.cardTitle, 1.5);
      fit('카드 이름', a.name, name, A.compact ? inner - A.cells * (A.cellW + 3) - 12 : inner);
      if (!A.compact) {
        for (const [, s] of a.steps) fit(`카드 ${a.name}`, s, textWidth('› ' + s, t.cardStep), inner);
        fit(`카드 ${a.name}`, a.done, textWidth('✓ ' + a.done, t.cardStep), inner);
      }
    }
  }

  // 문서 창
  for (const d of docs) {
    fit('문서 창 제목', d.title, textWidth(d.title, t.barFont), barTitle(L.file.w));
    d.lines.forEach((l, i) => {
      const mark = l.mark ? textWidth('◀ ' + l.mark.label, t.body) + 20 : 0;
      fit(`문서 창 '${d.title}' ${i + 1}행`, l.text, textWidth(l.text, t.body), L.file.w - 2 - docGutter(L) - t.body - mark);
    });
  }

  // 명령·결과 창
  const ow = L.output.w - 2 - 32;
  const compact = L.kind === 'portrait';
  for (const o of outputs) {
    fit('결과 창 제목', o.title, textWidth(o.title, t.barFont), barTitle(L.output.w));
    if (o.prompt) fit(`결과 창 '${o.title}' 명령`, o.prompt.text, textWidth('$ ' + o.prompt.text, t.body), ow);
    o.lines.forEach((l, i) => {
      const glyph = l.mark === 'fail' ? textWidth('FAIL', t.small) + 20 : t.body * 0.6 + 10;
      fit(`결과 창 '${o.title}' ${i + 1}줄`, l.text, glyph + textWidth(l.text, t.body), ow);
      if (l.sub) {
        if (compact) fit(`결과 창 '${o.title}' ${i + 1}줄 보조`, l.sub, Math.round(t.body * 1.2) + textWidth(l.sub, t.small), ow);
        else fit(`결과 창 '${o.title}' ${i + 1}줄 보조`, l.sub, 28 + textWidth('↳ ' + l.sub, t.small) + (l.score !== undefined ? 144 : 0), ow);
      }
    });
  }

  // 로그
  for (const l of logs) {
    if (L.log.panel) {
      const time = video.mode === 'demo' ? monoWidth(7, t.log) + 18 : 0;
      fit('로그', l.text, time + 76 + 18 + textWidth(l.text, t.log), L.log.w - 2 - 32);
    } else fit('로그 한 줄', `[${l.tag}] ${l.text}`, textWidth(`[${l.tag}]`, t.log) + 14 + textWidth(l.text, t.log), L.log.w);
  }

  // 주인공 시각물
  const hw = L.hero.w - 2;
  if (heroKind === 'pipeline') {
    fit('주인공 창 제목', pipeline.title, textWidth(pipeline.title, t.barFont), barTitle(L.hero.w));
    const n = pipeline.stages.length;
    const cols = n <= 4 ? n : Math.ceil(n / 2);
    const m = Math.round(hw * 0.05);
    const gap = Math.max(28, Math.round(hw * 0.045));
    const bw = (hw - 2 * m - (cols - 1) * gap) / cols;
    for (const s of pipeline.stages) fit('파이프라인 블록 이름', s.label, textWidth('✓ ' + s.label, t.heroLabel), bw + 12);
    for (const mk of pipeline.marks) fit('파이프라인 표시', mk.label, textWidth('✓ ' + mk.label, t.heroLabel) + 26, hw - 24);
    for (const s of pipeline.status) fit('주인공 상태', s.text, textWidth(s.text, t.small) + 12, hw - 16);
  } else {
    fit('주인공 창 제목', hero.title, textWidth(hero.title, t.barFont), barTitle(L.hero.w));
    for (const s of hero.status) fit('주인공 상태', s.text, textWidth(s.text, t.small) + 12, hw - 16);
  }

  // 완료 배지·마무리 한 줄(세로는 오른쪽 안전 영역을 피해 가운데 800px 안)
  fit('완료 배지', video.doneBadge, pixelWidth(video.doneBadge, L.kind === 'portrait' ? 28 : 20, 2) + 32, L.log.w);
  const closingRoom = L.kind === 'portrait' ? 2 * (L.W / 2 - L.safe.right) : L.header.w;
  fit('마무리 한 줄', video.closing, textWidth('$ ' + video.closing, L.logo.closing), closingRoom);
  return out;
};

// 세로 한 줄 로그는 1초 머문다. 같은 단계 안에서 30프레임보다 빨리 이어진 로그는 한 줄 표시에서 건너뛴다(넘침은 아님, 참고만)
const stageOf = (at: number) => titles.filter((ti) => at >= ti.at).length;
const skipped = logs.filter((l, i) => i + 1 < logs.length && logs[i + 1].at - l.at < 30 && stageOf(logs[i + 1].at) === stageOf(l.at));

let failed = 0;
for (const [name, L] of [
  ['16:9', LANDSCAPE],
  ['9:16', layoutFor(1080, 1920)],
] as const) {
  const issues = check(L);
  failed += issues.length;
  console.log(issues.length ? `[${name}] 넘침 ${issues.length}개` : `[${name}] 넘침 없음`);
  for (const i of issues) console.log(`  ${i.where}: 필요 ${i.need}px > 가능 ${i.have}px  "${i.text}"`);
}
if (skipped.length) console.log(`[9:16 참고] 로그 한 줄에서 건너뛸 수 있는 로그 ${skipped.length}개(다음 로그까지 30프레임 미만): ${skipped.map((l) => l.at).join(', ')}`);
if (failed) {
  console.log('문장을 줄인다(세로 글자 크기는 줄이지 않는다). 어림값이라 경계에 가까운 문구는 정지 프레임으로 확인한다.');
  process.exit(1);
}
