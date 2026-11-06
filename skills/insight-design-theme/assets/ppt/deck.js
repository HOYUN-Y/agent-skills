// 사용: node deck.js <doc.json> <brand.json> <mosaic|terminal> <그래픽 폴더> <출력.pptx>
// 16:9 PowerPoint. 표지 → 섹션마다 슬라이드(블록을 위에서 아래로 쌓고, 넘치면 다음 장) → 마무리.
// 글자는 모두 편집 가능한 텍스트, 픽셀 그래픽은 build_ppt.sh가 만든 PNG.
// PowerPoint는 실제 높이를 잴 수 없어 글자 폭으로 줄 수를 어림해 나눈다(넉넉하게 잡는다).
const fs = require('fs');
const path = require('path');
const pptxgen = require(path.join(__dirname, 'node_modules', 'pptxgenjs'));
const JSZip = require(require.resolve('jszip', { paths: [path.join(__dirname, 'node_modules', 'pptxgenjs')] }));

const [DOCF, BRANDF, STYLE, IMGDIR, OUT] = process.argv.slice(2);
if (!OUT || !['mosaic', 'terminal'].includes(STYLE)) { console.error('사용: node deck.js doc.json brand.json mosaic|terminal 그래픽폴더 출력.pptx'); process.exit(2); }
const D = JSON.parse(fs.readFileSync(DOCF, 'utf8'));
const M = D.meta || {};
const B = JSON.parse(fs.readFileSync(BRANDF, 'utf8'));
const IMG = (n) => path.join(IMGDIR, n + '.png');
const W = 13.333, H = 7.5, MX = 0.75, CW = W - MX * 2, TOP = 1.95, BOTTOM = 6.8, GAP = 0.22, FULL = BOTTOM - TOP;
const MARKS = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9' };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const paras = (t) => String(t || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
const pad2 = (n) => String(n).padStart(2, '0');

// ---------- 분량 추정 ----------
const WIDE = /[ᄀ-ᇿ㄰-㆏가-힯⺀-鿿豈-﫿＀-￯　-〿①-⑨]/;
function estWidth(text, pt, mono) {
  let em = 0;
  for (const ch of String(text)) em += WIDE.test(ch) ? 1 : ch === ' ' ? (mono ? 0.6 : 0.3) : mono ? 0.6 : 0.56;
  return (em * pt) / 72 * 1.04;
}
const estLines = (text, widthIn, pt, mono) => Math.max(1, Math.ceil(estWidth(text, pt, mono) / widthIn));
const LH = (pt, mult) => (pt * 1.2 * (mult || 1)) / 72; // PowerPoint 줄 높이 ≈ 글자 크기 × 1.2 × 줄 간격
const textH = (t, w, pt, mult, mono) => String(t ?? '').split('\n').reduce((a, l) => a + estLines(l, w, pt, mono), 0) * LH(pt, mult);
// 한 줄에 넘치는 제목은 낱말 경계에서 두 줄로 고르게 나눈다(PowerPoint에는 text-wrap: balance가 없다)
function balance(text, widthIn, pt) {
  if (estLines(text, widthIn, pt, false) < 2) return text;
  const words = String(text).split(' ');
  let best = text, diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.abs(a.length - b.length);
    if (d < diff) { diff = d; best = a + '\n' + b; }
  }
  return best;
}
const split = (n, max) => { const k = Math.ceil(n / max), per = Math.ceil(n / k); return Array.from({ length: k }, (_, i) => [i * per, Math.min(n, (i + 1) * per)]); };

// 코드: DejaVu 15pt, 줄 간격 1.2. DejaVu 줄 높이가 글자 크기의 약 1.16배라 실측 줄당 약 0.29in → 0.305로 잡는다
const CODE_LINE = 0.305, CODE_PAD = 0.42, BAR = STYLE === 'terminal' ? 0.45 : 0;
// 내어쓰기: 화면에서 줄바꿈된 다음 줄을 앞 공백과 목록 기호(-, *, +, 1., 1))만큼 들여 쓴다(웹 pixel.js와 같은 규칙).
// DejaVu Sans Mono 한 글자 폭 = 1233/2048em. PowerPoint에서는 finish()가 코드 문단에 marL·indent로 넣는다.
const hangChars = (l) => Math.min(12, (String(l).match(/^( *)((?:[-*+]|\d{1,3}[.)]) +)?/) || [''])[0].length);
const CODE_CH = (15 * 1233) / 2048 / 72; // 15pt 한 글자 폭(in)
function codeLineH(l, w) {
  if (!l.trim()) return 0.45 * CODE_LINE;
  if (/^··· /.test(l)) return 0.8 * estLines(l, w, 12, false) * CODE_LINE;
  const t = l.replace(/\s*[①-⑨]/g, ' 0 '), tw = estWidth(t, 15, true);
  if (tw <= w) return CODE_LINE;
  return (1 + Math.ceil((tw - w) / (w - hangChars(l) * CODE_CH))) * CODE_LINE; // 다음 줄은 내어쓴 만큼 좁다
}
function chunkCode(lines, w, budgetAt) {
  const out = [];
  let cur = [], used = 0;
  for (const l of lines) {
    const h = codeLineH(l, w);
    if (cur.length && used + h > budgetAt(out.length)) {
      // 소제목(## …)이 슬라이드 끝에 혼자 남지 않게 다음 슬라이드로 넘긴다
      const carry = [];
      while (cur.length > 1 && (/^## /.test(cur[cur.length - 1]) || !cur[cur.length - 1].trim())) carry.unshift(cur.pop());
      out.push(cur);
      cur = carry.filter((x) => x.trim());
      used = cur.reduce((a, x) => a + codeLineH(x, w), 0);
    }
    if (!cur.length && !l.trim()) continue; // 새 슬라이드는 빈 줄로 시작하지 않는다
    cur.push(l); used += h;
  }
  if (cur.length) out.push(cur);
  return out;
}
const marksIn = (lines) => lines.join('\n').match(/[①-⑨]/g) || [];
const noteNeed = (notes) => notes.reduce((a, n) => a + 0.42 + textH(n.text, 2.85, 13, 1.2) + 0.18, 0);

const stepNeed = (st, iw) => {
  let h = 0.22 + 0.45 + textH(st.title, iw, 20, 1.05) + (st.sub ? 0.32 : 0) + (st.text ? 0.12 + textH(st.text, iw, 14, 1.15) : 0);
  for (const [, v] of st.rows || []) h += 0.18 + 0.26 + textH(v, iw, 14, 1.1);
  return h + 0.3;
};
const pointNeed = (t, w) => 0.62 + 0.2 + textH(t.title, w - 0.6, 21, 1.1) + (t.text ? 0.15 + textH(t.text, w - 0.6, 15, 1.25) : 0) + 0.4;
// 칸 막대 그림: 한 줄 10칸(칸 14px + 간격 4px, 96px = 1in)
const CELL_W = (10 * 18 - 4) / 96, cellH = (R) => (R * 18 - 4) / 96, UNIT_H = 0.36;
const cellRows = (items) => Math.max(1, ...items.map((s) => (Number.isInteger(s.cells) ? Math.ceil(s.cells / 10) : 0)));
const statNeed = (s, w, R) => 0.3 + 0.78 + (Number.isInteger(s.cells) ? cellH(R) + 0.16 : 0) + (s.label ? textH(s.label, w - 0.5, 15, 1.15) : 0) + (s.note ? 0.06 + textH(s.note, w - 0.5, 13, 1.2) : 0) + 0.3;

// 큰 숫자 글자 폭(em, 글꼴 파일의 글자 폭 기준). Terminal은 Silkscreen(숫자 0.75em), Mosaic은 Pretendard Black(숫자 약 0.7em).
// 한글은 Pretendard로 그려져 1em로 넉넉히 잡는다
function numEm(t) {
  const m = STYLE === 'mosaic';
  let em = 0;
  for (const ch of String(t)) em += WIDE.test(ch) ? 1 : ch === ' ' ? (m ? 0.22 : 0.5) : /[,.:;'`]/.test(ch) ? (m ? 0.31 : 0.5) : ch === '%' ? (m ? 1.03 : 0.88) : m ? 0.72 : 0.75;
  return em;
}

// ---------- 배치 계획: 섹션마다 블록을 위에서 아래로 쌓고, 넘치면 다음 슬라이드 ----------
function plan() {
  const slides = [];
  for (const sec of D.sections || []) {
    let cur;
    const start = () => { cur = { sec, pieces: [], y: TOP }; slides.push(cur); };
    const room = () => BOTTOM - cur.y;
    const put = (p, h) => { p.y = cur.y; p.h = h; cur.pieces.push(p); cur.y += h + GAP; };
    const fit = (h) => { if (h > room() + 0.01 && cur.pieces.length) start(); };
    start();
    for (const b of sec.blocks || []) {
      switch (b.type) {
        case 'text':
          for (const t of paras(b.text)) { const h = textH(t, 11.2, 17, 1.25) + 0.05; fit(h); put({ k: 'text', t }, h); }
          break;
        case 'list': {
          let chunk = [], hh = 0;
          const flush = () => { if (chunk.length) { put({ k: 'list', items: chunk, ordered: b.ordered, from: chunk.from }, hh); chunk = []; hh = 0; } };
          (b.items || []).forEach((t, i) => {
            const h = textH(t, CW - 0.6, 17, 1.2) + 0.1;
            if (hh + h > room() + 0.01 && (chunk.length || cur.pieces.length)) { flush(); start(); }
            if (!chunk.length) chunk.from = i;
            chunk.push(t); hh += h;
          });
          flush();
          break;
        }
        case 'callout': {
          const h = 0.6 + (b.title ? textH(b.title, CW - 1.2, 19, 1.1) + 0.1 : 0) + (b.text ? textH(b.text, CW - 1.2, 15, 1.25) : 0) + (STYLE === 'terminal' ? 0.3 : 0);
          fit(h); put({ k: 'callout', b }, h);
          break;
        }
        case 'quote': {
          const h = textH(b.text, CW - 1.0, 24, 1.15) + (b.cite ? 0.42 : 0) + 0.1;
          fit(h); put({ k: 'quote', b }, h);
          break;
        }
        case 'stats': {
          const R = cellRows(b.items || []), unit = b.unit ? String(b.unit) : '';
          for (const [a, z] of split((b.items || []).length, 4)) {
            const items = b.items.slice(a, z), w = (CW - 0.3 * (items.length - 1)) / items.length;
            const h = Math.max(...items.map((s) => statNeed(s, w, R))) + (unit ? UNIT_H : 0);
            fit(h); put({ k: 'stats', items, R, unit }, h);
          }
          break;
        }
        case 'steps': {
          const n = (b.items || []).length;
          for (const [a, z] of split(n, 4)) {
            const per = z - a, cw = (CW - 0.25 * (per - 1)) / per;
            const need = Math.max(...b.items.slice(a, z).map((s) => stepNeed(s, cw - 0.44)));
            if (room() < need && cur.pieces.length) start();
            put({ k: 'steps', items: b.items.slice(a, z), from: a, n }, room() - need < 1.3 ? room() : need);
          }
          break;
        }
        case 'points': {
          const n = (b.items || []).length;
          for (const [a, z] of split(n, 3)) {
            const per = z - a, tw = (CW - 0.4 * (per - 1)) / per;
            const need = Math.max(...b.items.slice(a, z).map((t) => pointNeed(t, tw)));
            if (room() < need && cur.pieces.length) start();
            put({ k: 'points', items: b.items.slice(a, z), from: a }, room() - need < 1.3 ? room() : need);
          }
          break;
        }
        case 'table': {
          const head = b.head || [], rows = b.rows || [], cols = Math.max(head.length, ...rows.map((r) => r.length));
          const len = Array.from({ length: cols }, (_, c) => Math.max(4, ...[head[c] || '', ...rows.map((r) => r[c] || '')].map((v) => Math.min(40, String(v).length))));
          const tot = len.reduce((a, x) => a + x, 0), colW = len.map((x) => Math.max(1.1, (CW * x) / tot));
          const sc = CW / colW.reduce((a, x) => a + x, 0); colW.forEach((x, i) => (colW[i] = x * sc));
          const rowH = (r, pt) => Math.max(...r.map((v, c) => textH(v, colW[c] - 0.2, pt, 1.15))) + 0.2;
          const hh = head.length ? rowH(head, 12) : 0;
          let chunk = [], used = hh, first = true;
          const flush = () => { if (chunk.length) { put({ k: 'table', head, rows: chunk.map((r) => r.r), rowHs: chunk.map((r) => r.h), hh, colW, cont: !first }, used); first = false; chunk = []; used = hh; } };
          for (const r of rows) {
            const h = rowH(r, 13);
            if (used + h > room() + 0.01 && (chunk.length || cur.pieces.length)) { flush(); start(); }
            chunk.push({ r, h }); used += h;
          }
          flush();
          break;
        }
        case 'code': {
          const lines = String(b.body || '').split('\n');
          const notes = b.notes || [];
          const boxW = notes.length ? 8.25 : CW, w = boxW - 0.5;
          const total = lines.reduce((a, l) => a + codeLineH(l, w), 0) + CODE_PAD + BAR;
          if (total > room() && room() < FULL * 0.55 && cur.pieces.length) start();
          const room0 = room();
          const budget = (i) => (i === 0 ? room0 : FULL) - CODE_PAD - BAR;
          let chunks = chunkCode(lines, w, budget);
          if (chunks.length > 1) {
            for (let s = 0.5; s < 1; s += 0.05) { const c = chunkCode(lines, w, (i) => budget(i) * s); if (c.length === chunks.length) { chunks = c; break; } }
          }
          chunks.forEach((ls, ci) => {
            const ns = notes.filter((n) => marksIn(ls).includes(n.mark));
            const h = Math.min(FULL, Math.max(ls.reduce((a, l) => a + codeLineH(l, w), 0) + CODE_PAD + BAR, noteNeed(ns), 1.1));
            if (ci > 0) start();
            put({ k: 'code', b, lines: ls, notes: ns, boxW, part: ci, parts: chunks.length }, h);
          });
          break;
        }
        default: throw new Error('알 수 없는 블록: ' + b.type);
      }
    }
  }
  // 섹션 안 슬라이드 번호(2장 이상이면 제목에 (1/2) 등)
  const by = new Map();
  slides.forEach((s) => by.set(s.sec, (by.get(s.sec) || 0) + 1));
  const seen = new Map();
  slides.forEach((s) => { const i = (seen.get(s.sec) || 0) + 1; seen.set(s.sec, i); s.i = i; s.k = by.get(s.sec); });
  return slides;
}

// ---------- 코드 본문 → 글자 조각 ----------
function lineRuns(line, st) {
  if (!line.trim()) return [{ text: ' ', options: { fontSize: 7, fontFace: st.code } }];
  if (/^··· /.test(line)) return [{ text: line, options: { fontFace: st.body, fontSize: 12, color: st.omit } }];
  const marks = [];
  line = line.replace(/\s*([①-⑨])/g, (m, g) => (marks.push(MARKS[g]), ''));
  const head = /^## /.test(line);
  const runs = [], re = /`([^`]+)`|\[([^\]]+)\]/g;
  const base = { fontFace: st.code, fontSize: 15, color: head ? st.head : st.text, bold: head };
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index), options: { ...base } });
    runs.push(m[1] != null ? { text: m[1], options: { ...base, highlight: st.inlineBg, color: st.inlineFg } } : { text: `[${m[2]}]`, options: { ...base, highlight: st.blankBg, color: st.blankFg } });
    last = re.lastIndex;
  }
  if (last < line.length) runs.push({ text: line.slice(last), options: { ...base } });
  // 번호 앞은 줄 바꿈 없는 공백(번호만 다음 줄로 떨어지지 않게)
  marks.forEach((n) => { runs.push({ text: '\u00A0', options: { ...base } }); runs.push({ text: `\u00A0${n}\u00A0`, options: { fontFace: st.mono, fontSize: 12, bold: true, highlight: st.markBg, color: st.markFg } }); });
  return runs;
}
const codeRuns = (lines, st) => lines.flatMap((l, i) => { const r = lineRuns(l, st); if (i < lines.length - 1) r[r.length - 1].options.breakLine = true; return r; });

// ---------- 후처리: 테마 색, 한글 줄바꿈·글꼴, 대체 텍스트, ZIP 폴더 항목 ----------
function altFor(n) {
  let m;
  if (['b-dots', 'c-band', 'b-quote', 'b-bolt'].includes(n)) return '';
  if (/^b-(cover|closing)-art$/.test(n)) return `픽셀이 모여 네이비 면이 되는 디더 그래픽과 ${B.name} 픽셀 로고`;
  if (n === 'b-logo-tile') return `${B.name} 로고`;
  if (n === 'b-issue') return `${M.kicker || ''} ${M.issue || ''}`.trim();
  if ((m = n.match(/^b-meter-(\d+)-(\d+)$/))) return `진행 미터 ${m[1]}/${m[2]}`;
  if ((m = n.match(/^c-prog-(\d+)-(\d+)$/))) return `진행 ${m[1]}/${m[2]}`;
  if ((m = n.match(/^[bc]-ratio-(\d+)$/))) return `비율 ${m[1] * 10}%`;
  if ((m = n.match(/^[bc]-cells-(\d+)-(\d+)$/))) return `칸 막대 ${m[1]}칸`;
  if ((m = n.match(/^b-num-(\d+)$/))) return `번호 ${pad2(m[1])}`;
  if (n === 'c-cover-logo') return `줄 단위로 조립되는 ${B.name} 픽셀 로고`;
  if (n === 'c-logo-done') return `${B.name} 픽셀 로고`;
  return '';
}
async function finish(file, theme) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    let xml;
    if (/^ppt\/theme\/theme\d+\.xml$/.test(name)) {
      // 테마 색을 직접 써 넣는다(pptxgenjs는 테마 색을 쓰지 않는다)
      xml = await zip.file(name).async('string');
      for (const [k, v] of Object.entries(theme.colors)) xml = xml.replace(new RegExp(`<a:${k}>[\\s\\S]*?</a:${k}>`), `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`);
      xml = xml.replace(/<a:clrScheme name="[^"]*"/, `<a:clrScheme name="${theme.name}"`);
      zip.file(name, xml);
    } else if (/^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(name)) {
      xml = await zip.file(name).async('string');
      // 고정폭·픽셀 영문 글꼴에 없는 한글은 Pretendard로(그대로 두면 PowerPoint가 맑은 고딕·바탕으로 바꾼다)
      for (const f of ['JetBrains Mono', 'DejaVu Sans Mono', 'Silkscreen']) xml = xml.split(`<a:ea typeface="${f}"`).join('<a:ea typeface="Pretendard"');
      // 그림 대체 텍스트: pptxgenjs는 로컬 전체 경로를 넣는다(계정·폴더명이 공유 파일에 노출) → 설명으로
      xml = xml.replace(/descr="[^"]*\/([a-z0-9-]+)\.png"/g, (m, n) => `descr="${altFor(n)}"`);
      // 글자 언어를 한국어로(en-US면 PowerPoint가 한글을 단어 중간에서 끊는다)
      xml = xml.split('lang="en-US"').join('lang="ko-KR"');
      xml = xml.replace(/<a:pPr(?![^>]*eaLnBrk)/g, '<a:pPr eaLnBrk="0"').replace(/<a:p>(?!<a:pPr)/g, '<a:p><a:pPr eaLnBrk="0"/>');
      // 코드 본문: 문단마다 내어쓰기(marL·indent). 글자는 그대로라 복사·검색 결과는 같다
      if (/^ppt\/slides\//.test(name)) xml = xml.split('</p:sp>').map((sp) => (!sp.includes('name="코드 본문"') ? sp
        : sp.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (para, inner) => {
          const text = [...inner.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('');
          const emu = text.trim() ? Math.round(hangChars(text) * CODE_CH * 914400) : 0;
          return emu ? para.replace('indent="0" marL="0"', `indent="-${emu}" marL="${emu}"`) : para;
        }))).join('</p:sp>');
      zip.file(name, xml);
    }
  }
  // 폴더 항목 없이 다시 묶는다(클라우드 저장소에서 열기·공동 편집 실패 방지). zip.remove(폴더)는 안의 파일까지 지운다
  const out = new JSZip();
  for (const n of Object.keys(zip.files)) if (!zip.files[n].dir) out.file(n, await zip.file(n).async('uint8array'), { createFolders: false });
  fs.writeFileSync(file, await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// ---------- 스타일 ----------
const STYLES = {
  // Mosaic: 밝은 슬레이트 점 격자 지면, 디더링이 네이비 면으로 합쳐짐
  mosaic: {
    THEME: { name: `${B.name} Mosaic`, headFontFace: 'Pretendard ExtraBold', bodyFontFace: 'Pretendard',
      colors: { dk1: '162033', lt1: 'FFFFFF', dk2: '475569', lt2: 'EEF2F6', accent1: 'FFB52E', accent2: '2B3A56', accent3: '64748B', accent4: '94600A', accent5: 'E2E8F0', accent6: 'F6F1E7', hlink: '2B3A56', folHlink: '64748B' } },
    F: { head: 'Pretendard ExtraBold', black: 'Pretendard Black', body: 'Pretendard', semi: 'Pretendard SemiBold', mono: 'JetBrains Mono', code: 'DejaVu Sans Mono', title: 'Pretendard ExtraBold', num: 'Pretendard Black' },
    K: { ink: '162033', ink2: '3B4760', muted: '475569', label: '5B6A80', gold: 'FFB52E', goldInk: '94600A', card: 'FFFFFF', cardLine: 'E2E8F0', rule: 'CBD5E1', calloutBg: '162033', calloutFg: 'F6F1E7', calloutSub: 'CBD5E1', numFg: '162033' },
    code: { text: '162033', head: '162033', omit: '5B6A80', inlineBg: 'E2E8F0', inlineFg: '162033', blankBg: 'FFB52E', blankFg: '162033', markBg: '162033', markFg: 'FFB52E', box: 'FFFFFF', boxLine: 'E2E8F0' },
  },
  // Terminal: 전 페이지 다크 네이비, 픽셀 제목(Galmuri11), 줄 단위로 조립되는 로고.
  // '텍스트 1'(dk1)을 밝은 아이보리로 둔다(새로 넣는 글자가 어두운 배경에서 보이게).
  // 웹(PDF)은 Neo둥근모 Pro를 쓰지만 PowerPoint에서는 글자가 보이지 않아(UPM 16 글꼴) Galmuri11을 쓴다.
  terminal: {
    THEME: { name: `${B.name} Terminal`, headFontFace: 'Galmuri11', bodyFontFace: 'Pretendard',
      colors: { dk1: 'F6F1E7', lt1: '0F1828', dk2: 'CBD5E1', lt2: '162033', accent1: 'FFB52E', accent2: '1F2B42', accent3: '2B3A56', accent4: '94A3B8', accent5: '0B1220', accent6: 'D3DAE5', hlink: 'FFB52E', folHlink: '94A3B8' } },
    F: { head: 'Galmuri11', body: 'Pretendard', semi: 'Pretendard SemiBold', mono: 'JetBrains Mono', code: 'DejaVu Sans Mono', pixel: 'Silkscreen', title: 'Galmuri11', num: 'Silkscreen' },
    K: { ink: 'F6F1E7', ink2: 'CBD5E1', muted: 'CBD5E1', label: '94A3B8', gold: 'FFB52E', goldInk: 'FFB52E', card: '1F2B42', cardLine: '2B3A56', rule: '2B3A56', calloutBg: '0F1828', calloutFg: 'F6F1E7', calloutSub: 'CBD5E1', numFg: 'FFB52E' },
    code: { text: 'D3DAE5', head: 'FFB52E', omit: '94A3B8', inlineBg: '1F2B42', inlineFg: 'F6F1E7', blankBg: '2B3A56', blankFg: 'FFB52E', markBg: 'FFB52E', markFg: '0F1828', box: '0B1220', boxLine: '2B3A56' },
  },
};

async function build() {
  const S = STYLES[STYLE], F = S.F, K = S.K, mosaic = STYLE === 'mosaic';
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = B.name;
  pres.title = [M.kicker, M.issue, (M.title || []).join(' ')].filter(Boolean).join(' · ');
  pres.theme = { headFontFace: S.THEME.headFontFace, bodyFontFace: S.THEME.bodyFontFace };
  const C = pres.SchemeColor;
  const tb = (s, text, o) => s.addText(text, { margin: 0, isTextBox: true, valign: 'top', ...o });
  const rect = (s, x, y, w, h, fill, line, name) => s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: line ? { color: line, width: 0.75 } : { type: 'none' }, objectName: name });
  const titles = M.title || [];
  const facts = (M.facts || []).slice(0, 3);

  // ----- 레이아웃(마스터) -----
  if (mosaic) {
    const label = [M.kicker, M.issue].filter(Boolean).join(' ');
    const header = [
      { image: { x: MX, y: 0.42, w: 0.26, h: 0.26, path: IMG('b-logo-tile') } },
      { text: { text: B.name, options: { x: MX + 0.36, y: 0.39, w: 3, h: 0.32, fontFace: F.semi, fontSize: 13, color: C.text1, margin: 0, valign: 'middle' } } },
      { text: { text: label, options: { x: W - MX - 3, y: 0.39, w: 3, h: 0.32, fontFace: F.mono, fontSize: 11, color: C.text2, align: 'right', margin: 0, valign: 'middle' } } },
    ];
    const brandBand = [
      { text: { text: B.name, options: { x: MX, y: 6.2, w: 5, h: 0.4, fontFace: F.head, fontSize: 18, color: C.background1, margin: 0 } } },
      { text: { text: B.tagline || '', options: { x: MX, y: 6.6, w: 6, h: 0.35, fontFace: F.body, fontSize: 13, color: 'CBD5E1', margin: 0 } } },
    ];
    pres.defineSlideMaster({ title: 'B 표지', background: { color: C.background2 }, objects: [
      { image: { x: 0, y: 0, w: W, h: H, path: IMG('b-dots') } }, { image: { x: 0, y: 0, w: W, h: H, path: IMG('b-cover-art') } }, ...header.slice(0, 2), ...brandBand,
      { placeholder: { options: { name: 'title', type: 'title', align: 'left', x: MX, y: 1.27, w: 8.6, h: 1.45, fontFace: F.black, fontSize: titles.length > 2 ? 28 : 40, color: C.text1, valign: 'top', margin: 0, lineSpacingMultiple: 1.05 }, text: '' } },
      { placeholder: { options: { name: 'subtitle', type: 'body', align: 'left', x: MX, y: 2.82, w: 8.6, h: 0.7, fontFace: F.body, fontSize: 18, color: C.text2, valign: 'top', margin: 0 }, text: '' } },
    ] });
    pres.defineSlideMaster({ title: 'B 본문', background: { color: C.background2 }, objects: [
      { image: { x: 0, y: 0, w: W, h: H, path: IMG('b-dots') } }, ...header,
      { text: { text: B.handle || '', options: { x: MX, y: 7.0, w: 4, h: 0.3, fontFace: F.mono, fontSize: 11, color: C.text2, margin: 0 } } },
      { line: { x: MX, y: 1.68, w: CW, h: 0, line: { color: C.text1, width: 2 } } },
      { placeholder: { options: { name: 'title', type: 'title', align: 'left', x: MX, y: 0.88, w: 9.2, h: 0.75, fontFace: F.head, fontSize: 32, color: C.text1, valign: 'bottom', margin: 0 }, text: '' } },
    ], slideNumber: { x: W - MX - 1, y: 7.0, w: 1, h: 0.3, fontFace: F.mono, fontSize: 11, color: '475569', align: 'right' } });
    pres.defineSlideMaster({ title: 'B 마무리', background: { color: C.background2 }, objects: [
      { image: { x: 0, y: 0, w: W, h: H, path: IMG('b-dots') } }, { image: { x: 0, y: 0, w: W, h: H, path: IMG('b-closing-art') } }, ...header, ...brandBand,
      { placeholder: { options: { name: 'title', type: 'title', align: 'left', x: MX, y: 1.55, w: 10, h: 1.4, fontFace: F.black, fontSize: 36, color: C.text1, valign: 'top', margin: 0 }, text: '' } },
    ] });
  } else {
    const sl = B.slug || slug(B.name);
    const slW = Math.max(1.2, sl.length * 0.1 + 0.15);
    const status = [
      { text: { text: sl, options: { x: MX, y: 0.38, w: slW + 0.3, h: 0.3, fontFace: F.mono, fontSize: 12, bold: true, color: C.accent1, margin: 0, valign: 'middle', wrap: false } } },
      { text: { text: `~/${slug(M.kicker) || 'notes'}${M.issue ? '/' + M.issue : ''}`, options: { x: MX + slW, y: 0.38, w: 4, h: 0.3, fontFace: F.mono, fontSize: 12, color: C.accent4, margin: 0, valign: 'middle', wrap: false } } },
    ];
    const band = { image: { x: 0, y: H - 0.625, w: W, h: 0.625, path: IMG('c-band') } };
    pres.defineSlideMaster({ title: 'C 표지', background: { color: C.background2 }, objects: [
      band, ...status,
      { text: { text: M.date || '', options: { x: W - MX - 2, y: 0.38, w: 2, h: 0.3, fontFace: F.mono, fontSize: 12, color: C.accent4, align: 'right', margin: 0, valign: 'middle' } } },
      { image: { x: W - MX - 7.0, y: 0.95, w: 7.0, h: 2.8, path: IMG('c-cover-logo') } },
      { placeholder: { options: { name: 'title', type: 'title', align: 'left', x: MX, y: 4.25, w: 9, h: 1.35, fontFace: F.head, fontSize: titles.length > 2 ? 28 : 40, color: C.text1, valign: 'top', margin: 0, lineSpacingMultiple: 1.05 }, text: '' } },
      { placeholder: { options: { name: 'subtitle', type: 'body', align: 'left', x: MX, y: 5.68, w: 9, h: 0.5, fontFace: F.body, fontSize: 17, color: C.text2, valign: 'top', margin: 0 }, text: '' } },
    ] });
    pres.defineSlideMaster({ title: 'C 본문', background: { color: C.background2 }, objects: [
      band, ...status,
      { text: { text: B.handle || '', options: { x: MX, y: 7.0, w: 4, h: 0.3, fontFace: F.mono, fontSize: 11, color: C.accent4, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', align: 'left', x: MX, y: 0.9, w: 9.6, h: 0.8, fontFace: F.head, fontSize: 32, color: C.text1, valign: 'middle', margin: 0 }, text: '' } },
    ], slideNumber: { x: W - MX - 1, y: 7.0, w: 1, h: 0.3, fontFace: F.mono, fontSize: 11, color: '94A3B8', align: 'right' } });
    pres.defineSlideMaster({ title: 'C 마무리', background: { color: C.background2 }, objects: [
      band, ...status,
      { image: { x: W - MX - 3.3, y: 2.2, w: 3.3, h: 3.0, path: IMG('c-logo-done') } },
      { placeholder: { options: { name: 'title', type: 'title', align: 'left', x: MX, y: 2.75, w: 7.6, h: 1.5, fontFace: F.head, fontSize: 34, color: C.text1, valign: 'top', margin: 0, lineSpacingMultiple: 1.1 }, text: '' } },
    ] });
  }

  // ----- 표지 -----
  pres.addSection({ title: '표지' });
  let s = pres.addSlide({ masterName: mosaic ? 'B 표지' : 'C 표지', sectionTitle: '표지' });
  if (mosaic) {
    s.addText(titles.join('\n'), { placeholder: 'title' });
    if (M.subtitle) s.addText(M.subtitle, { placeholder: 'subtitle' });
    if (M.kicker || M.issue) tb(s, [...(M.kicker ? [{ text: ` ${M.kicker} `, options: { highlight: '162033', color: 'EEF2F6', bold: true } }] : []), ...(M.issue ? [{ text: `  No.${M.issue}`, options: { color: '162033', bold: true } }] : [])],
      { x: MX, y: 0.85, w: 5, h: 0.32, fontFace: F.mono, fontSize: 12, valign: 'middle', objectName: '시리즈' });
    if (fs.existsSync(IMG('b-issue'))) s.addImage({ path: IMG('b-issue'), x: W - MX - 1.15, y: 0.95, w: 1.15, h: 0.73, objectName: '호수 픽셀 숫자' });
    // 값 길이에 맞춰 칸 폭을 정한다(한 줄 유지)
    let mx = MX;
    facts.forEach(([k, v]) => {
      let em = 0; for (const ch of String(v)) em += WIDE.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.58;
      const w = Math.max(1.0, (em * 15) / 72 + 0.15);
      tb(s, String(k).toUpperCase(), { x: mx, y: 3.62, w, h: 0.25, fontFace: F.mono, fontSize: 10, color: C.text2, charSpacing: 1, objectName: `메타 ${k}` });
      tb(s, String(v), { x: mx, y: 3.87, w, h: 0.35, fontFace: F.semi, fontSize: 15, color: C.text1, wrap: false, objectName: `메타 값 ${k}` });
      mx += w + 0.45;
    });
  } else {
    s.addText(titles.map((t, i) => ({ text: t, options: { breakLine: i < titles.length - 1, color: i === titles.length - 1 && titles.length > 1 ? C.accent1 : C.text1 } })), { placeholder: 'title' });
    if (M.subtitle) s.addText(M.subtitle, { placeholder: 'subtitle' });
    const cmd = M.command || `open ${slug(M.kicker) || 'notes'}${M.issue ? '-' + M.issue : ''}`;
    tb(s, [{ text: '$ ', options: { color: C.accent1, bold: true } }, { text: cmd, options: { color: C.accent4 } }, { text: ' █', options: { color: C.accent1 } }], { x: MX, y: 3.8, w: 7, h: 0.32, fontFace: F.mono, fontSize: 13, valign: 'middle', objectName: '명령 줄' });
    if (facts.length) tb(s, facts.flatMap(([k, v], i, a) => [{ text: `${String(k).toLowerCase()}  `, options: { color: C.accent4 } }, { text: String(v) + (i < a.length - 1 ? '      ' : ''), options: { color: C.text1 } }]), { x: MX, y: 6.25, w: 9, h: 0.32, fontFace: F.mono, fontSize: 13, valign: 'middle', objectName: '메타' });
    if (B.handle) tb(s, B.handle, { x: W - MX - 3, y: 6.25, w: 3, h: 0.32, fontFace: F.mono, fontSize: 13, color: C.text2, align: 'right', valign: 'middle', objectName: '핸들' });
  }

  // ----- 본문 조각 그리기 -----
  const DRAW = {
    text: (s, p) => tb(s, p.t, { x: MX, y: p.y, w: 11.2, h: p.h, fontFace: F.body, fontSize: 17, color: K.ink2, lineSpacingMultiple: 1.25, objectName: '문단' }),
    list: (s, p) => tb(s, p.items.map((t, i) => ({ text: t, options: { bullet: p.ordered ? { type: 'number', startAt: (p.from || 0) + 1, indent: 22 } : { characterCode: mosaic ? '25A0' : '003E', indent: 22 }, breakLine: i < p.items.length - 1, paraSpaceAfter: 6 } })),
      { x: MX, y: p.y, w: CW, h: p.h, fontFace: F.body, fontSize: 17, color: K.ink, lineSpacingMultiple: 1.2, objectName: '목록' }),
    callout: (s, p) => {
      const b = p.b;
      rect(s, MX, p.y, CW, p.h, K.calloutBg, mosaic ? null : K.gold, '강조 상자');
      let y = p.y + 0.3;
      if (mosaic) s.addImage({ path: IMG('b-bolt'), x: MX + 0.35, y: y + 0.05, w: 0.24, h: 0.24, objectName: '강조 표시' });
      else { tb(s, `// ${b.label || 'NOTE'}`, { x: MX + 0.45, y, w: 4, h: 0.26, fontFace: F.mono, fontSize: 11, color: K.gold, objectName: '강조 라벨' }); y += 0.3; }
      const x = MX + (mosaic ? 0.85 : 0.45), w = CW - (mosaic ? 1.2 : 0.9);
      if (b.title) { const h = textH(b.title, w, 19, 1.1); tb(s, b.title, { x, y, w, h, fontFace: F.head, fontSize: 19, color: K.calloutFg, objectName: '강조 제목' }); y += h + 0.1; }
      if (b.text) tb(s, paras(b.text).join('\n'), { x, y, w, h: p.y + p.h - y - 0.2, fontFace: F.body, fontSize: 15, color: K.calloutSub, lineSpacingMultiple: 1.25, objectName: '강조 내용' });
    },
    quote: (s, p) => {
      const b = p.b;
      if (mosaic) s.addImage({ path: IMG('b-quote'), x: MX, y: p.y + 0.08, w: 0.44, h: 0.32, objectName: '인용 표시' });
      else rect(s, MX, p.y, 0.05, p.h, K.gold, null, '인용 막대');
      const th = textH(b.text, CW - 1.0, 24, 1.15);
      tb(s, b.text, { x: MX + 0.75, y: p.y, w: CW - 0.75, h: th, fontFace: F.head, fontSize: 24, color: K.ink, lineSpacingMultiple: 1.15, objectName: '인용문' });
      if (b.cite) tb(s, (mosaic ? '' : '— ') + b.cite, { x: MX + 0.75, y: p.y + th + 0.1, w: CW - 0.75, h: 0.3, fontFace: F.mono, fontSize: 12, color: K.label, objectName: '인용 출처' });
    },
    stats: (s, p) => {
      const n = p.items.length, w = (CW - 0.3 * (n - 1)) / n, ch = p.h - (p.unit ? UNIT_H : 0);
      // 값은 한 줄(wrap: false). 카드 폭을 넘으면 한 줄의 값을 같은 크기로 함께 줄인다
      const room = (it) => w - 0.5 - (mosaic && typeof it.ratio === 'number' ? 0.6 : 0);
      const numPt = Math.max(16, Math.min(mosaic ? 40 : 34, ...p.items.map((it) => Math.floor((room(it) * 72) / (numEm(it.value) * 1.08)))));
      if (p.unit) {
        rect(s, MX, p.y + ch + 0.15, 0.1, 0.1, mosaic ? K.ink : K.gold, null, '칸 막대 단위 표시');
        tb(s, p.unit, { x: MX + 0.18, y: p.y + ch + 0.06, w: CW - 0.18, h: 0.28, fontFace: F.mono, fontSize: 12, color: K.label, valign: 'middle', objectName: '칸 막대 단위' });
      }
      p.items.forEach((it, i) => {
        const x = MX + i * (w + 0.3);
        rect(s, x, p.y, w, ch, K.card, K.cardLine, `숫자 카드 ${i + 1}`);
        tb(s, String(it.value), { x: x + 0.25, y: p.y + 0.25, w: room(it), h: 0.78, fontFace: F.num, fontSize: numPt, color: K.numFg, valign: 'middle', wrap: false, objectName: `숫자 ${i + 1}` });
        let y = p.y + 1.08;
        if (typeof it.ratio === 'number') {
          const k = Math.round(Math.max(0, Math.min(1, it.ratio)) * 10);
          if (mosaic) s.addImage({ path: IMG(`b-ratio-${k}`), x: x + w - 0.75, y: p.y + 0.3, w: 0.5, h: 0.5, objectName: `비율 ${i + 1}` });
          else { s.addImage({ path: IMG(`c-ratio-${k}`), x: x + 0.25, y: y - 0.04, w: 1.7, h: 0.12, objectName: `비율 ${i + 1}` }); y += 0.14; }
        }
        if (Number.isInteger(it.cells)) {
          s.addImage({ path: IMG(`${mosaic ? 'b' : 'c'}-cells-${it.cells}-${p.R}`), x: x + 0.25, y: y + 0.02, w: CELL_W, h: cellH(p.R), objectName: `칸 막대 ${i + 1}` });
          y += cellH(p.R) + 0.16;
        }
        if (it.label) { const h = textH(it.label, w - 0.5, 15, 1.15); tb(s, it.label, { x: x + 0.25, y, w: w - 0.5, h, fontFace: F.semi, fontSize: 15, color: K.ink, objectName: `숫자 이름 ${i + 1}` }); y += h + 0.06; }
        if (it.note) tb(s, it.note, { x: x + 0.25, y, w: w - 0.5, h: Math.max(0.3, p.y + ch - y - 0.2), fontFace: F.body, fontSize: 13, color: K.muted, lineSpacingMultiple: 1.2, objectName: `숫자 설명 ${i + 1}` });
      });
    },
    steps: (s, p) => {
      const per = p.items.length, cw = (CW - 0.25 * (per - 1)) / per, pad = 0.22;
      p.items.forEach((st, j) => {
        const i = p.from + j, x = MX + j * (cw + 0.25), ix = x + pad, iw = cw - pad * 2, no = st.no || pad2(i + 1);
        rect(s, x, p.y, cw, p.h, K.card, K.cardLine, `단계 카드 ${no}`);
        tb(s, `STEP ${no}`, { x: ix, y: p.y + 0.22, w: 1.6, h: 0.3, fontFace: mosaic ? F.mono : F.pixel, fontSize: mosaic ? 11 : 12, bold: mosaic, color: mosaic ? K.label : K.gold, valign: 'middle', objectName: `단계 번호 ${no}` });
        if (mosaic) s.addImage({ path: IMG(`b-meter-${i + 1}-${p.n}`), x: x + cw - pad - 0.42, y: p.y + 0.18, w: 0.42, h: 0.42, objectName: `단계 미터 ${no}` });
        else { const pw = Math.min(0.9, 0.155 * p.n); s.addImage({ path: IMG(`c-prog-${i + 1}-${p.n}`), x: x + cw - pad - pw, y: p.y + 0.31, w: pw, h: (pw * 9) / (p.n * 13 - 4), objectName: `진행 표시 ${no}` }); }
        let y = p.y + 0.67;
        const th = textH(st.title, iw, 20, 1.05);
        tb(s, st.title, { x: ix, y, w: iw, h: th, fontFace: F.head, fontSize: 20, color: K.ink, objectName: `단계 제목 ${no}` }); y += th + 0.04;
        if (st.sub) { tb(s, st.sub, { x: ix, y, w: iw, h: 0.3, fontFace: F.semi, fontSize: 12, color: K.goldInk, objectName: `단계 부제 ${no}` }); y += 0.32; }
        if (st.text) { y += 0.08; const h = textH(st.text, iw, 14, 1.15); tb(s, st.text, { x: ix, y, w: iw, h, fontFace: F.body, fontSize: 14, color: K.ink2, lineSpacingMultiple: 1.15, objectName: `단계 설명 ${no}` }); y += h; }
        // 라벨 줄(stop, out 등)은 카드 아래쪽에 모은다
        const rows = st.rows || [];
        const rowsH = rows.reduce((a, [, v]) => a + 0.18 + 0.26 + textH(v, iw, 14, 1.1), 0);
        let ry = Math.max(y + 0.1, p.y + p.h - 0.25 - rowsH);
        rows.forEach(([k, v], r) => {
          if (mosaic) s.addShape(pres.shapes.LINE, { x: ix, y: ry + 0.06, w: iw, h: 0, line: { color: K.rule, width: 0.75, dashType: 'dash' }, objectName: `구분선 ${no}-${r + 1}` });
          ry += 0.18;
          tb(s, mosaic ? String(k).toUpperCase() : String(k).toLowerCase(), { x: ix, y: ry, w: iw, h: 0.24, fontFace: F.mono, fontSize: mosaic ? 10 : 11, bold: true, color: mosaic ? K.label : K.gold, objectName: `라벨 ${no}-${r + 1}` });
          ry += 0.26;
          const h = textH(v, iw, 14, 1.1);
          tb(s, v, { x: ix, y: ry, w: iw, h, fontFace: mosaic ? F.semi : F.body, fontSize: 14, color: K.ink, lineSpacingMultiple: 1.1, objectName: `라벨 내용 ${no}-${r + 1}` });
          ry += h;
        });
      });
    },
    points: (s, p) => {
      const per = p.items.length, tw = (CW - 0.4 * (per - 1)) / per;
      p.items.forEach((t, j) => {
        const i = p.from + j, x = MX + j * (tw + 0.4);
        let y = p.y, ix = x, iw = tw;
        if (mosaic) { s.addImage({ path: IMG(`b-num-${i + 1}`), x, y: y + 0.05, w: 0.8, h: 0.51, objectName: `요점 번호 ${i + 1}` }); y += 0.8; }
        else { rect(s, x, y, tw, p.h, K.card, K.cardLine, `요점 카드 ${i + 1}`); ix = x + 0.3; iw = tw - 0.6; y += 0.3; tb(s, `[${i + 1}]`, { x: ix, y, w: 1, h: 0.35, fontFace: F.pixel, fontSize: 16, color: K.gold, objectName: `요점 번호 ${i + 1}` }); y += 0.5; }
        const th = textH(t.title, iw, 21, 1.1);
        tb(s, t.title, { x: ix, y, w: iw, h: th, fontFace: F.head, fontSize: 21, color: K.ink, lineSpacingMultiple: 1.1, objectName: `요점 제목 ${i + 1}` });
        y += th + 0.15;
        if (t.text) tb(s, t.text, { x: ix, y, w: iw, h: Math.max(0.4, p.y + p.h - y - 0.2), fontFace: F.body, fontSize: 15, color: K.ink2, lineSpacingMultiple: 1.25, objectName: `요점 내용 ${i + 1}` });
      });
    },
    table: (s, p) => {
      const border = (c) => ({ type: 'solid', pt: 0.75, color: c });
      const none = { type: 'none' };
      const hdr = p.head.map((h) => ({ text: String(h), options: { fontFace: F.mono, fontSize: 11, bold: true, color: mosaic ? K.label : K.gold, fill: { color: mosaic ? 'EEF2F6' : '0B1220' }, border: [none, none, { type: 'solid', pt: mosaic ? 2 : 0.75, color: mosaic ? '162033' : '2B3A56' }, none] } }));
      const body = p.rows.map((r, ri) => r.map((v, c) => ({ text: String(v), options: { fontFace: c === 0 ? F.semi : F.body, fontSize: 13, color: c === 0 ? K.ink : K.ink2,
        fill: { color: mosaic ? (ri % 2 ? 'EEF2F6' : 'FFFFFF') : (ri % 2 ? '1F2B42' : '162033') }, border: [none, none, border(mosaic ? 'E2E8F0' : '2B3A56'), none] } })));
      s.addTable(p.head.length ? [hdr, ...body] : body, { x: MX, y: p.y, w: CW, colW: p.colW, rowH: [...(p.head.length ? [p.hh] : []), ...p.rowHs], margin: [0.06, 0.1, 0.06, 0.1], valign: 'middle', objectName: '표' });
    },
    code: (s, p) => {
      const st = { ...S.code, code: F.code, body: F.body, mono: F.mono };
      const x = MX, y = p.y, w = p.boxW, h = p.h;
      const lab = `${p.b.file ? p.b.file + ' · ' : ''}${p.b.excerpt === false ? '원문 전체' : '원문 발췌'}${p.part > 0 ? ' (이어서)' : ''}`;
      rect(s, x, y, w, h, S.code.box, S.code.boxLine, mosaic ? '코드 카드' : '터미널 창');
      let ty = y + 0.22;
      if (mosaic) {
        rect(s, x, y, 0.07, h, '162033', null, '코드 막대');
        tb(s, lab, { x: x + w - 4.2, y: y + 0.1, w: 4.0, h: 0.26, fontFace: F.mono, fontSize: 10, color: K.label, align: 'right', objectName: '코드 제목' });
        ty = y + 0.3;
      } else {
        [0, 1, 2].forEach((i) => rect(s, x + 0.22 + i * 0.17, y + 0.17, 0.1, 0.1, i ? '2B3A56' : 'FFB52E', null, `창 점 ${i + 1}`));
        tb(s, lab, { x: x + w - 4.6, y: y + 0.08, w: 4.4, h: 0.28, fontFace: F.mono, fontSize: 11, color: K.label, align: 'right', objectName: '창 제목' });
        s.addShape(pres.shapes.LINE, { x, y: y + 0.45, w, h: 0, line: { color: '2B3A56', width: 0.75 }, objectName: '창 구분선' });
        ty = y + 0.62;
      }
      tb(s, codeRuns(p.lines, st), { x: x + 0.3, y: ty, w: w - 0.5, h: y + h - ty - 0.12, lineSpacingMultiple: 1.2, objectName: '코드 본문' });
      let ny = y;
      p.notes.forEach((n) => {
        const k = MARKS[n.mark], nh = textH(n.text, 2.85, 13, 1.2);
        tb(s, k, { x: 9.3, y: ny + 0.04, w: 0.32, h: 0.32, fontFace: F.mono, fontSize: 13, bold: true, color: mosaic ? 'FFB52E' : '0F1828', fill: { color: mosaic ? '162033' : 'FFB52E' }, align: 'center', valign: 'middle', objectName: `해설 번호 ${k}` });
        tb(s, n.title, { x: 9.75, y: ny, w: 2.85, h: 0.4, fontFace: F.head, fontSize: 16, color: K.ink, valign: 'middle', objectName: `해설 제목 ${k}` });
        tb(s, n.text, { x: 9.75, y: ny + 0.44, w: 2.85, h: nh, fontFace: F.body, fontSize: 13, color: K.muted, lineSpacingMultiple: 1.2, objectName: `해설 내용 ${k}` });
        ny += 0.44 + nh + 0.18;
      });
    },
  };

  // ----- 본문 슬라이드 -----
  let lastSec = null;
  for (const sl of plan()) {
    if (sl.sec !== lastSec) { pres.addSection({ title: String(sl.sec.title).slice(0, 40) }); lastSec = sl.sec; }
    s = pres.addSlide({ masterName: mosaic ? 'B 본문' : 'C 본문', sectionTitle: String(sl.sec.title).slice(0, 40) });
    const t = sl.k > 1 ? `${sl.sec.title} (${sl.i}/${sl.k})` : sl.sec.title;
    if (mosaic) s.addText(t, { placeholder: 'title' });
    else s.addText([{ text: '$ ', options: { color: C.accent1 } }, { text: t }], { placeholder: 'title' });
    if (sl.sec.tag) tb(s, mosaic ? sl.sec.tag : `// ${sl.sec.tag}`, { x: W - MX - 3.5, y: mosaic ? 1.18 : 1.1, w: 3.5, h: 0.42, fontFace: F.mono, fontSize: 11, bold: mosaic, color: mosaic ? C.text2 : C.accent4, align: 'right', valign: mosaic ? 'bottom' : 'middle', objectName: '섹션 태그' });
    for (const p of sl.pieces) DRAW[p.k](s, p);
    // 발표자 노트(선택): 섹션의 speaker를 그 섹션 첫 장에
    if (sl.i === 1 && sl.sec.speaker) s.addNotes(String(sl.sec.speaker));
  }

  // ----- 마무리 -----
  if (M.closing !== false) {
    pres.addSection({ title: '마무리' });
    s = pres.addSlide({ masterName: mosaic ? 'B 마무리' : 'C 마무리', sectionTitle: '마무리' });
    if (M.cta) s.addText(balance(M.cta, mosaic ? 10 : 7.6, mosaic ? 36 : 34), { placeholder: 'title' });
    if (mosaic) {
      tb(s, M.ctaLabel || 'SAVE THIS ▸', { x: MX, y: 1.1, w: 3, h: 0.3, fontFace: F.mono, fontSize: 12, bold: true, color: C.accent4, objectName: '마무리 라벨' });
      if (B.handle) tb(s, B.handle, { x: MX, y: 3.05, w: 5, h: 0.4, fontFace: F.mono, fontSize: 16, color: C.text2, objectName: '핸들' });
    } else {
      tb(s, `// ${M.ctaLabel || 'SAVE THIS'}`, { x: MX, y: 2.25, w: 4, h: 0.32, fontFace: F.mono, fontSize: 13, color: C.accent4, objectName: '마무리 라벨' });
      if (B.handle) tb(s, B.handle, { x: MX, y: 4.45, w: 5, h: 0.4, fontFace: F.mono, fontSize: 18, color: C.accent1, objectName: '핸들' });
      tb(s, [{ text: B.name.toUpperCase(), options: { fontFace: F.pixel, fontSize: 13, color: C.text1, breakLine: true } }, { text: B.tagline || '', options: { fontFace: F.body, fontSize: 13, color: C.text2 } }], { x: MX, y: 5.6, w: 6, h: 0.65, objectName: '브랜드' });
    }
  }
  await pres.writeFile({ fileName: OUT });
  return S.THEME;
}

(async () => {
  const theme = await build();
  await finish(OUT, theme);
  console.log('PPT:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
