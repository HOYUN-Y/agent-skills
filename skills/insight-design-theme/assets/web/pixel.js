// 픽셀 그래픽 공통 도구: 로고 래스터화, 픽셀 숫자, 디더링, SVG 출력.
(function () {
  // 같은 시드면 항상 같은 배치가 나오도록 고정 난수를 쓴다.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // logos/01-ai-monogram-eye-v2-profile.svg 의 심볼 좌표
  const LOGO_BOX = [315.53, 289, 915, 817];
  const IVORY = 'M599.7 289.3 L315.53 817 L560.63 817 L623.1 701 L512 701 L599.7 538.14 L749.87 817 L804 817 L804 689.65 C804 637.27 776.54 617.69 736.5 543.33Z';
  const GOLD_STEM = 'M765 488 H881 V817 H822 V678.89 C822 619.56 765 582.2 765 524.84Z';
  const GOLD_EYE = 'M726 398 Q820.5 289 915 398 Q820.5 507 726 398Z M748 398 Q820.5 324 893 398 Q820.5 472 748 398Z';

  function logoGrid(cols, opt) {
    opt = opt || {};
    const thr = opt.threshold ?? 0.5;
    const thrGold = opt.goldThreshold ?? 0.32;
    const [x0, y0, x1, y1] = LOGO_BOX;
    const cell = (x1 - x0) / cols;
    const rows = Math.ceil((y1 - y0) / cell);
    const S = 8;
    const cv = document.createElement('canvas');
    cv.width = cols * S;
    cv.height = rows * S;
    const ctx = cv.getContext('2d');
    function coverage(draw) {
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
          for (let yy = 0; yy < S; yy++)
            for (let xx = 0; xx < S; xx++) s += d[((r * S + yy) * cv.width + (c * S + xx)) * 4 + 3];
          out[r * cols + c] = s / (255 * S * S);
        }
      return out;
    }
    const iv = coverage((c) => c.fill(new Path2D(IVORY)));
    // i 기둥은 A와 같은 기준으로 잘라 바닥선이 맞게 한다. 얇은 눈 테두리만 낮은 기준을 쓴다.
    const stem = coverage((c) => c.fill(new Path2D(GOLD_STEM)));
    const eye = coverage((c) => {
      c.fill(new Path2D(GOLD_EYE), 'evenodd');
      c.beginPath();
      c.arc(820.5, 398, 28.75, 0, Math.PI * 2);
      c.fill();
    });
    // 칸이 굵어 눈 테두리와 동공이 뭉치는 크기에서는 손으로 찍은 눈 도트를 쓴다.
    const useMask = opt.eyeMask ?? cell > 20;
    let stemTop = rows;
    for (let i = 0; i < stem.length; i++) if (stem[i] >= thr) { stemTop = Math.floor(i / cols); break; }
    const maskCells = new Set();
    if (useMask) {
      const cc = Math.floor((820.5 - x0) / cell);
      const cr = Math.min(Math.floor((398 - y0) / cell), stemTop - 4); // 눈과 기둥 사이 최소 1칸
      EYE_MASK.forEach((row, y) => [...row].forEach((b, x) => { if (b === '#') maskCells.add((cr - 2 + y) * cols + (cc - 3 + x)); }));
    }
    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const gold = stem[i] >= thr || (useMask ? maskCells.has(i) : eye[i] >= thrGold);
        if (gold && (stem[i] >= iv[i] || useMask || eye[i] >= iv[i])) cells.push({ x: c, y: r, k: 'gold' });
        else if (iv[i] >= thr) cells.push({ x: c, y: r, k: 'ivory' });
      }
    return { cols, rows, cells };
  }

  // 작은 크기용 눈: 아몬드 테두리 + 1칸 동공, 동공과 테두리 사이 1칸 여백
  const EYE_MASK = ['..###..', '.#...#.', '#..#..#', '.#...#.', '..###..'];

  // 원본 벡터 로고를 네이비 타일에 그대로 (로고 3색 유지)
  function logoTile(size, opt) {
    opt = opt || {};
    const pad = opt.pad ?? 0.16;
    const [x0, y0, x1, y1] = LOGO_BOX;
    const w = x1 - x0, h = y1 - y0, inner = size * (1 - pad * 2);
    const k = inner / Math.max(w, h);
    const tx = (size - w * k) / 2 - x0 * k, ty = (size - h * k) / 2 - y0 * k;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" fill="${opt.bg || '#162033'}"/>` +
      `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})">` +
      `<path fill="#F6F1E7" d="${IVORY}"/><g fill="#FFB52E"><path d="${GOLD_STEM}"/>` +
      `<path fill-rule="evenodd" d="${GOLD_EYE}"/><circle cx="820.5" cy="398" r="28.75"/></g></g></svg>`;
  }

  // 5×7 비트맵 숫자
  const DIGITS = {
    0: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  };
  function digitCells(str, gapCols) {
    gapCols = gapCols ?? 1;
    const cells = [];
    let ox = 0;
    for (const ch of String(str)) {
      const g = DIGITS[ch];
      if (!g) { ox += 3; continue; }
      g.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') cells.push({ x: ox + x, y }); }));
      ox += 5 + gapCols;
    }
    return { cells, cols: ox - gapCols, rows: 7 };
  }

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function bayer(x, y) { return (BAYER[y & 3][x & 3] + 0.5) / 16; }

  // cells: [{x,y,s?,fill,op?}] (x,y,s 단위는 px)
  function svg(w, h, rects, extra) {
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`;
    for (const r of rects) {
      out += `<rect x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${(r.w ?? r.s).toFixed(2)}" height="${(r.h ?? r.s).toFixed(2)}" fill="${r.fill}"${r.op != null && r.op < 1 ? ` fill-opacity="${r.op.toFixed(3)}"` : ''}/>`;
    }
    return out + (extra || '') + '</svg>';
  }

  // 칸 막대: 수치를 같은 크기의 칸 개수로 보여 준다(한 줄 10칸). rows는 같은 블록에서 가장 긴 막대에 맞춰
  // 모든 막대가 같은 틀을 쓰게 한다. 채운 칸은 on, 남은 칸은 off 색.
  function cells(k, rows, c, gap, on, off) {
    const COLS = 10, rects = [];
    for (let i = 0; i < COLS * rows; i++)
      rects.push({ x: (i % COLS) * (c + gap), y: Math.floor(i / COLS) * (c + gap), s: c, fill: i < k ? on : off });
    return svg(COLS * (c + gap) - gap, rows * (c + gap) - gap, rects);
  }
  const cellRows = (items) => Math.max(1, ...items.map((s) => Math.ceil((Number.isInteger(s && s.cells) ? s.cells : 0) / 10)));

  function mount(sel, html) {
    document.querySelectorAll(sel).forEach((el) => (el.innerHTML = html));
  }

  // 로고를 작은 픽셀 마크로 (헤더·푸터용)
  function logoMark(px, colors) {
    colors = colors || {};
    const g = logoGrid(14, { threshold: 0.45, goldThreshold: 0.3 });
    const w = g.cols * px, h = g.rows * px;
    const rects = g.cells.map((c) => ({ x: c.x * px, y: c.y * px, s: px, fill: c.k === 'gold' ? colors.gold || '#FFB52E' : colors.ivory || '#F6F1E7' }));
    return svg(w, h, rects);
  }

  function digits(str, px, fill, gap) {
    const d = digitCells(str);
    const g = gap ?? Math.max(0.6, px * 0.12);
    return svg(d.cols * px, d.rows * px, d.cells.map((c) => ({ x: c.x * px + g / 2, y: c.y * px + g / 2, s: px - g, fill })));
  }

  // 해설 번호 배지: 글자가 아닌 픽셀 그림이라 PDF에서 복사해도 본문에 섞이지 않는다.
  const MARKS = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9 };
  function badge(mark, px) {
    const n = MARKS[mark] ?? mark;
    return `<span class="mk">${digits(String(n), px || 1.25, 'currentColor', 0)}</span>`;
  }

  // 프롬프트 본문
  // - [빈칸], ## 제목은 원문 글자를 그대로 두고 span으로만 감싼다(복사 시 원문 유지).
  // - ①~⑨는 배지 그림으로 바꾼다. "··· "로 시작하는 줄은 생략 표시, 빈 줄은 좁은 간격.
  // - PDF 복사 대응(macOS·iOS PDFKit에서 확인):
  //   `코드` 표시는 마크다운처럼 기호를 빼고 인라인 코드 서식으로 보여 준다(기호가 있으면 앞 글자와 줄이 갈라져 추출됨).
  //   밑줄(_)은 고정폭 글꼴 글리프에서 줄이 끊기므로 본문 글꼴 글리프로 그린다.
  //   해설 번호는 줄의 마지막 낱말과 묶어(nowrap) 번호만 다음 줄로 떨어지지 않게 한다.
  function promptHTML(body) { return promptLines(body).join(''); }
  function promptLines(body) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const deco = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<span class="ic">$1</span>')
      .replace(/\[([^\]]+)\]/g, '<span class="blank">[$1]</span>')
      .replace(/_/g, '<span class="us">_</span>');
    // 마지막 공백(대괄호·백틱 묶음 밖) 위치
    const lastSplit = (s) => {
      let depth = 0, tick = false, at = -1;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '`') tick = !tick;
        else if (!tick && c === '[') depth++;
        else if (!tick && c === ']') depth = Math.max(0, depth - 1);
        else if (c === ' ' && !tick && depth === 0) at = i;
      }
      return at;
    };
    return body.split('\n').map((line) => {
      if (!line.trim()) return '<span class="ln gap">&nbsp;</span>';
      if (/^··· /.test(line)) return `<span class="ln omit">${esc(line)}</span>`;
      const marks = [];
      const raw = line.replace(/\s*([①②③④⑤⑥⑦⑧⑨])/g, (m, g) => (marks.push(g), ''));
      let l;
      const cut = marks.length ? lastSplit(raw) : -1;
      if (marks.length && raw.length - cut - 1 <= 24) {
        l = `${deco(raw.slice(0, cut + 1))}<span class="nw">${deco(raw.slice(cut + 1))}${marks.map((m) => badge(m)).join('')}</span>`;
      } else {
        l = deco(raw) + marks.map((m) => badge(m)).join('');
      }
      if (/^## /.test(line)) l = `<span class="ph">${l}</span>`;
      return `<span class="ln">${l}</span>`;
    });
  }

  window.PX = { rng, logoGrid, logoTile, digitCells, digits, bayer, svg, cells, cellRows, mount, logoMark, badge, promptHTML, promptLines };
})();
