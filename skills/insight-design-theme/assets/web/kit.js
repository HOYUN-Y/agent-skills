// 템플릿 공통: 내용 불러오기, 형식(A4·카드), 글꼴 대기, 블록 흐름 배치, 페이지 번호, 넘침 경고.
// 템플릿은 ?content=<file:// URL>&fmt=a4|card 로 연다. 내용 스크립트(window.DOC, window.BRAND)는 build.sh가 만든다.
(function () {
  const KIT = {};
  window.addEventListener('error', (e) => { document.body.dataset.error = String(e.message || e.error); });
  window.addEventListener('unhandledrejection', (e) => { document.body.dataset.error = String(e.reason); });

  KIT.esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  KIT.slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  KIT.el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  KIT.fromHTML = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  KIT.append = (target, html) => target.appendChild(KIT.fromHTML(html));
  KIT.overflows = (box) => box.scrollHeight > box.clientHeight + 1;

  // 형식: a4(210×297mm, 내려받는 자료) · card(120×150mm = 4:5, 인스타 캐러셀. PNG는 1080×1350으로 뽑는다)
  const FORMATS = { a4: { w: 210, h: 297, sectionPerPage: false }, card: { w: 120, h: 150, sectionPerPage: true } };
  KIT.format = () => {
    const name = new URLSearchParams(location.search).get('fmt') || 'a4';
    const f = FORMATS[name];
    if (!f) throw new Error('알 수 없는 형식: ' + name);
    document.body.classList.add('fmt-' + name);
    document.head.appendChild(KIT.el('style', null, `@page { size: ${f.w}mm ${f.h}mm; margin: 0; }`));
    const px = (mm) => (mm * 96) / 25.4;
    return { name, ...f, W: px(f.w), H: px(f.h), px };
  };

  KIT.loadContent = () => new Promise((resolve, reject) => {
    if (window.DOC) return resolve();
    const src = new URLSearchParams(location.search).get('content');
    if (!src) return reject(new Error('content 파라미터가 없습니다'));
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('내용 스크립트를 읽지 못했습니다: ' + src));
    document.head.appendChild(s);
  });

  // 측정 전에 쓰는 글꼴을 모두 불러 둔다(글꼴이 바뀌면 줄바꿈과 높이가 달라진다)
  KIT.fonts = (specs) => Promise.all(specs.map((s) => document.fonts.load(s, '가A'))).then(() => document.fonts.ready);

  // ---------------------------------------------------------------------------
  // 블록 흐름 배치. 템플릿(T)이 주는 것:
  //   T.page(kind) → 새 페이지 요소(.inner 포함, 문서에 붙인 상태)
  //   T.heading(section, isContinuation) → 섹션 제목 HTML
  //   T.parts(block) → 조각 목록. { atom: html } 또는
  //     { wrap: (cont) => 컨테이너 HTML, target?: 항목을 넣을 선택자, items: [...], item: (it, i) => HTML,
  //       sticky?: (node) => 페이지가 넘어갈 때 다음 페이지로 데려갈 마지막 항목인가(예: 코드의 ## 소제목) }
  //   T.closing(page | null) → 마지막 장 마무리(page가 null이면 새 장을 만든다)
  // 원칙: 넣어 보고 넘치면 빼서 다음 페이지로 옮긴다(측정 기반). 제목만 남는 페이지를 만들지 않는다.
  // 빈 페이지에서도 넘치는 항목(한 항목이 한 페이지보다 큼)은 그대로 두고 경고에 남긴다.
  // ---------------------------------------------------------------------------
  KIT.layout = (D, T, F) => {
    const warns = [];
    let box = null, sec = null, head = null, onPage = 0, afterHead = 0;
    const newPage = () => { box = T.page('').querySelector('.inner'); onPage = 0; };
    const outerH = (n) => { const cs = getComputedStyle(n); return n.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); };
    // 다음 페이지로 넘긴다. 섹션 제목 뒤에 한 항목 이하만 남는 경우(앞에 다른 내용이 있을 때)는 제목과 그 항목을 함께 옮긴다.
    const breakPage = () => {
      if (head && head.parentNode === box && head !== box.firstElementChild && afterHead <= 1) {
        const nodes = [];
        for (let n = head; n; n = n.nextElementSibling) nodes.push(n);
        nodes.forEach((n) => n.remove());
        newPage();
        nodes.forEach((n) => box.appendChild(n));
        onPage = afterHead;
        return;
      }
      newPage();
      if (sec) KIT.append(box, T.heading(sec, true));
    };
    const placed = () => { onPage++; afterHead++; };
    const tooBig = (what) => warns.push(`${sec ? `'${sec.title}' 섹션의 ` : ''}${what}이(가) 한 페이지보다 큽니다`);

    const atom = (p) => {
      const n = KIT.append(box, p.atom);
      if (KIT.overflows(box)) {
        if (onPage === 0) tooBig('블록');
        else { n.remove(); breakPage(); KIT.append(box, p.atom); if (KIT.overflows(box)) tooBig('블록'); }
      }
      placed();
    };
    const group = (p) => {
      const N = p.items.length;
      let wrap = null, target = null, done = 0, here = 0; // done: 앞 페이지들에 놓인 수, here: 이 페이지에 놓인 수
      const open = () => { wrap = KIT.append(box, p.wrap(done > 0)); target = p.target ? wrap.querySelector(p.target) : wrap; here = 0; };
      const fillAll = () => { for (let i = 0; i < N; i++) KIT.append(target, p.item(p.items[i], i)); };
      if (!N) return;
      // keep: 짧은 묶음(짧은 코드, 작은 표 등)은 나누지 않는다. 이 페이지에 안 들어가면 새 페이지에 통째로(들어갈 때만)
      if (p.keep && N > 1) {
        open(); fillAll();
        if (!KIT.overflows(box)) { for (let i = 0; i < N; i++) placed(); return; }
        const need = outerH(wrap) + (head && head.parentNode === box ? outerH(head) : 0);
        wrap.remove();
        if (onPage > 0 && need <= box.clientHeight) {
          breakPage(); open(); fillAll();
          if (!KIT.overflows(box)) { for (let i = 0; i < N; i++) placed(); return; }
          wrap.remove();
        }
        wrap = null;
      }
      for (let i = 0; i < N; i++) {
        if (!wrap || wrap.parentNode !== box) open();
        const n = KIT.append(target, p.item(p.items[i], i));
        if (!KIT.overflows(box)) { placed(); here++; continue; }
        if (onPage === 0) { tooBig('항목'); placed(); here++; continue; }
        const hn = outerH(n);
        n.remove();
        // 데려갈 항목: 다른 내용 아래에서 시작한 묶음의 첫 항목이 페이지 끝에 혼자 남는 경우, 또는 마지막 항목이 소제목(sticky)인 경우.
        // 데려간 항목과 지금 항목이 새 페이지에 함께 들어갈 때만 데려간다.
        const carry = [], last = target.lastElementChild;
        const roomy = last && outerH(last) + hn < box.clientHeight * 0.8;
        if (roomy && ((done === 0 && here === 1 && N > 1 && onPage > here) || (here > 1 && p.sticky && p.sticky(last)))) {
          carry.push(target.lastElementChild);
          target.lastElementChild.remove();
          here--; onPage--; afterHead--;
        }
        if (!target.children.length) wrap.remove();
        done += here;
        breakPage();
        open();
        for (const c of carry) { target.appendChild(c); placed(); here++; }
        KIT.append(target, p.item(p.items[i], i));
        if (KIT.overflows(box)) tooBig('항목');
        placed(); here++;
      }
    };

    // 지금 페이지에서 내용이 차지한 높이 비율
    const usedFrac = () => {
      const last = box && box.lastElementChild;
      return last ? (last.getBoundingClientRect().bottom - box.getBoundingClientRect().top) / box.clientHeight : 0;
    };
    for (const s of D.sections || []) {
      sec = s;
      // 카드 형식은 섹션마다 새 장이 기본이지만, 앞 장이 절반 넘게 비어 있으면 이어 쓴다(거의 빈 카드 방지)
      const fresh = s.newPage ?? (F.sectionPerPage && usedFrac() > 0.5);
      if (!box || (fresh && onPage > 0)) newPage();
      head = KIT.append(box, T.heading(s, false));
      afterHead = 0;
      if (KIT.overflows(box) && onPage > 0) { head.remove(); newPage(); box.appendChild(head); }
      for (const b of s.blocks || []) for (const p of T.parts(b)) (p.atom != null ? atom : group)(p);
    }

    if (D.meta?.closing !== false) {
      const last = box && box.closest('.page');
      if (last) {
        last.classList.add('closing');
        if (KIT.overflows(box)) { last.classList.remove('closing'); T.closing(null); } else T.closing(last);
      } else T.closing(null);
    }
    return warns;
  };

  KIT.number = (sel) => {
    const pages = document.querySelectorAll('.page');
    pages.forEach((p, i) => p.querySelectorAll(sel).forEach((n) => (n.textContent = `${String(i + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`)));
  };

  // 코드 블록이 화면에서 실제로 나뉜 줄(시각 줄) 목록. check_pdf_text.py가 PDF 복사 텍스트와 대조해
  // 화면의 한 줄이 복사 텍스트에서 둘로 갈라졌는지 찾는다(줄바꿈을 무시하는 비교로는 못 잡는 문제).
  KIT.codeRows = () => {
    const rows = [], r = document.createRange();
    document.querySelectorAll('.code .ln').forEach((ln) => {
      const w = document.createTreeWalker(ln, NodeFilter.SHOW_TEXT);
      let top = null, cur = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        for (let i = 0; i < n.data.length; i++) {
          r.setStart(n, i); r.setEnd(n, i + 1);
          const b = r.getClientRects()[0];
          if (!b || !b.height) continue;
          if (top !== null && b.top > top + b.height * 0.5) { rows.push(cur); cur = ''; }
          if (!cur.trim()) top = b.top;
          cur += n.data[i];
        }
      }
      rows.push(cur);
    });
    const el = document.createElement('script');
    el.type = 'application/json'; el.id = 'code-rows';
    el.textContent = JSON.stringify(rows.map((x) => x.trim()).filter(Boolean)).replace(/</g, '\\u003c');
    document.body.appendChild(el);
  };

  // 렌더 후 검사: 넘친 페이지(잘린 글자)를 경고로 남긴다. build.sh가 출력한다.
  KIT.check = (warns) => {
    document.querySelectorAll('.page').forEach((p, i) => p.querySelectorAll('.inner').forEach((b) => { if (KIT.overflows(b)) warns.push(`${i + 1}쪽 내용이 넘쳐 잘립니다`); }));
    document.body.dataset.warn = [...new Set(warns)].join(' | ');
    KIT.codeRows();
  };

  KIT.run = (fontSpecs, render) => {
    KIT.loadContent()
      .then(() => KIT.fonts(fontSpecs))
      .then(() => render(window.DOC, window.BRAND || {}, KIT.format()))
      .then(() => { document.body.dataset.ready = '1'; })
      .catch((e) => { document.body.dataset.error = String(e && e.message || e); });
  };

  window.KIT = KIT;
})();
