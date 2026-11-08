#!/usr/bin/env python3
"""Deep file inventory of vault sources: change report, review targets with referencing guides,
generated file catalog, review-state. Reads names and metadata only, never file contents.

The default run is read-only. Only --write (inventory + catalog pages) and --mark (review-state) write,
and only to .secondbrain/inventory.json, .secondbrain/review-state.json and top-level catalog*.md pages
this script generated. Semantic indexes and sources are never modified.
Listing a file is not reviewing it: review-state changes only through --mark, and only for files whose
current size/mtime equal the snapshot that was read.

Usage:
  python3 -I inventory.py <vault>                              # report (read-only)
  python3 -I inventory.py <vault> --review-out <file.tsv>      # + save review targets outside the vault
  python3 -I inventory.py <vault> --all --review-out <f>       # + include never-reviewed baseline files
  python3 -I inventory.py <vault> --write                      # save inventory and catalog pages
  python3 -I inventory.py <vault> --write --accept-source src-x  # accept a retargeted or removed source
  python3 -I inventory.py <vault> --mark full --from <file.tsv>  # record reviewed files (head|relevant|full|held)
  python3 -I inventory.py --selftest
"""
import argparse, hashlib, json, os, re, shutil, sys, tempfile, time
from collections import Counter, defaultdict
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_index as ci
from check_index import ROUTER, encode, links, read, relp
from sources import INVENTORY, REVIEW, Policy, is_link, load_json, nfc, read_paths

MARKER = "<!-- secondbrain-index-sync:catalog 자동 생성 파일. 직접 고치지 말고 inventory.py --write로 다시 만든다 -->"
PAGE_LINES, LIST_CAP = 80, 50
LEVELS = ("head", "relevant", "full", "held")
STATUS_KO = {"complete": "완전 조사", "partial": "부분 조사(일부 경로 오류, 사라진 파일은 판단 보류)",
             "offline": "연결 실패(이전 목록 유지)", "private_alias": "비공개 경로의 별칭(목록 제외)",
             "retarget_held": "연결 대상 변경 보류(이전 목록 유지)", "absent": "자료원 없음·미등록(이전 목록 유지)"}
SKIP_KO = {"hidden": "숨김", "dependency": "의존성·캐시", "secret_name": "비밀정보 이름", "pii_name": "개인정보 후보 이름",
           "private": "비공개", "link": "내부 링크(따라가지 않음)", "cycle": "순환"}


class Fatal(Exception):
    pass


def open_vault(vault):
    router = read(os.path.join(vault, ROUTER))
    if router is None:
        raise Fatal(f"{ROUTER} 없음 또는 읽기 실패: {vault}")
    try:
        return router, Policy(vault, router)
    except (OSError, UnicodeError, ValueError) as e:
        raise Fatal(f"비공개 목록/장부 확인 실패 ({type(e).__name__})")


def state(vault, rel):
    try:
        return load_json(vault, rel)
    except ValueError as e:
        raise Fatal(f"{e}: 덮어쓰지 않고 중단")


def write_atomic(vault, rel, data):
    """Write via a temp file in .secondbrain and replace, so a failure never leaves a half-written file."""
    sb = os.path.join(vault, ".secondbrain")
    if os.path.lexists(sb) and (is_link(sb) or not os.path.isdir(sb)):
        raise Fatal(".secondbrain이 링크이거나 폴더가 아님: 쓰지 않음")
    os.makedirs(sb, exist_ok=True)
    dest = os.path.join(vault, rel)
    if os.path.lexists(dest) and (is_link(dest) or not os.path.isfile(dest)):
        raise Fatal(f"{rel}이 링크이거나 파일이 아님: 쓰지 않음")
    fd, tmp = tempfile.mkstemp(dir=sb, prefix=".tmp-")   # exclusive create: a planted link cannot redirect it
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, dest)
    except BaseException:
        if os.path.lexists(tmp):
            os.remove(tmp)
        raise


def dump(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True) + "\n").encode("utf-8")


def registered(router):
    """Top-level names linked from the router (the 외부 자료 폴더 table registers src-* links)."""
    return {nfc(unquote(h).split("#")[0].split("/")[0]) for _, h in links(router)}


def scan(vault, router, policy):
    reg, scanned, unregistered = registered(router), {}, []
    tops, top_skipped = policy.tops()
    for name in tops:
        if name.startswith("src-") and nfc(name) not in reg:
            unregistered.append(name); continue
        scanned[name] = policy.walk(name)
    return scanned, unregistered, top_skipped


def plan(old, scanned, policy, accept, now):
    """New inventory from the saved one and this scan. Missing files become deletion candidates only for
    sources listed completely; offline, partial, retargeted and removed sources keep their previous entries."""
    old_files = old["files"] if old else {}
    old_src = old.get("sources", {}) if old else {}
    rep = defaultdict(list)
    by_src = defaultdict(dict)
    for p, m in old_files.items():
        if policy.allowed_rel(p):
            by_src[p.split("/")[0]][p] = m
        else:
            rep["dropped"].append(1)   # newly private/blocked: counted, never printed
    files, srcs = {}, {}
    for name in sorted(set(scanned) | set(old_src) | set(by_src)):
        old_e, prev, cur = by_src.get(name, {}), old_src.get(name), scanned.get(name)

        def keep(status, note=None):
            files.update(old_e)
            base = prev or {"target": cur and cur["target"], "complete_at": None, "skipped": {}, "errors": 0}
            srcs[name] = {**base, "status": status}
            if note:
                rep["held"].append((name, note))

        if cur is None and not policy.allowed_rel(name):
            rep["dropped"].append(1); continue   # the whole source became private: forget it silently
        if cur is None:
            if name in accept:
                rep["accepted"].append(name); continue
            keep("absent", f"자료원이 없거나 라우터에 등록되지 않음: 이전 목록 {len(old_e)}개 유지 (정리하려면 --accept-source {name})")
            continue
        retarget = bool(prev and prev.get("target") and cur["target"] and cur["target"] != prev["target"])
        if retarget and name not in accept:
            keep("retarget_held", f"연결 대상 변경: 현재 {len(cur['files'])}개 / 이전 {len(old_e)}개. 삭제·추가로 처리하지 않음 (확인 후 --accept-source {name})")
            continue
        if retarget:
            rep["accepted"].append(name); old_e, prev = {}, None
        if cur["status"] in ("offline", "private_alias"):
            keep(cur["status"]); continue
        baseline, complete = bool(prev and prev.get("complete_at")), cur["status"] == "complete"
        old_n, cur_n = defaultdict(list), defaultdict(list)
        for p in old_e:
            old_n[nfc(p)].append(p)
        for p in cur["files"]:
            cur_n[nfc(p)].append(p)
        entries = {} if complete else dict(old_e)
        for key, ps in sorted(cur_n.items()):
            if len(ps) > 1:
                rep["collisions"].append(" ↔ ".join(sorted(ps)))   # never merged automatically
            olds = old_n.get(key, [])
            for p in ps:
                size, mt = cur["files"][p]
                o = old_e.get(p) or (old_e[olds[0]] if len(olds) == 1 and len(ps) == 1 else None)
                if o is None:
                    flag = baseline
                    if baseline:
                        rep["added"].append(p)
                elif (o["size"], o["mtime_ns"]) != (size, mt):
                    flag = baseline or o.get("since_baseline", False)
                    rep["changed"].append(p)
                else:
                    flag = o.get("since_baseline", False)
                for q in olds:
                    if q not in cur["files"]:
                        entries.pop(q, None)   # an NFC/NFD respelling replaces the old disk spelling
                entries[p] = {"size": size, "mtime_ns": mt, **({"since_baseline": True} if flag else {})}
        if complete:
            rep["missing"] += [ps[0] for k, ps in old_n.items() if k not in cur_n]
        else:
            rep["errors"] += cur["errors"]
        if not baseline:
            rep["baseline"].append((name, len(entries)))
        ca = prev.get("complete_at") if prev else None
        if complete and (ca is None or entries != old_e or prev.get("status") != "complete"):
            ca = now
        srcs[name] = {"status": cur["status"], "target": cur["target"], "complete_at": ca,
                      "skipped": dict(sorted(cur["skipped"].items())), "errors": len(cur["errors"])}
        files.update(entries)
    added = defaultdict(list)
    for p in rep["added"]:
        added[(nfc(p.rsplit("/", 1)[-1]), files[p]["size"])].append(p)
    for m in rep["missing"]:
        hits = added.get((nfc(m.rsplit("/", 1)[-1]), old_files[m]["size"]))
        if hits:
            rep["moves"].append((m, ", ".join(hits)))   # same name and size: a candidate, never applied
    new = {"version": 1, "policy": policy.fingerprint(), "private_ids": dict(sorted(policy.ids.items())),
           "sources": srcs, "files": dict(sorted(files.items())),
           "pages": dict((old or {}).get("pages", {}))}
    return new, rep


def review_targets(saved, scanned, review, include_backlog, held, policy):
    """Files to (re)read. Recomputed every run from the current scan, the saved inventory and review-state,
    so a review that failed after --write comes back even when nothing changed."""
    rs = {nfc(k): v for k, v in (review or {}).get("files", {}).items() if policy.allowed_rel(k)}
    sv = {nfc(p): m for p, m in (saved or {}).get("files", {}).items()}
    srcs = (saved or {}).get("sources", {})
    out, counts = [], Counter()
    for name, cur in sorted(scanned.items()):
        if cur["status"] not in ("complete", "partial") or name in held:
            continue
        baseline = bool(srcs.get(name, {}).get("complete_at"))
        for p, (size, mt) in sorted(cur["files"].items()):
            k = nfc(p); r, s = rs.get(k), sv.get(k)
            # a review counts only for the same file metadata *and* the same source target (retarget = new files)
            if r and (r["size"], r["mtime_ns"], r.get("source")) == (size, mt, cur["target"]):
                if r["level"] != "held":
                    counts[r["level"]] += 1; continue
                reason = "보류 (검토 미완)"
            elif r:
                reason = "검토 후 변경"
            elif s is None:
                reason = "추가 (목록 미반영)" if baseline else None
            elif (s["size"], s["mtime_ns"]) != (size, mt):
                reason = "변경 (목록 미반영)" if baseline else None
            elif s.get("since_baseline"):
                reason = "목록 반영 후 미검토"
            else:
                reason = None
            if reason is None:
                counts["backlog"] += 1
                if not include_backlog:
                    continue
                reason = "기준선 미검토"
            out.append((p, size, mt, cur["target"], reason))
    counts["orphan"] = len(set(rs) - {nfc(p) for c in scanned.values() for p in c["files"]})
    return out, counts


def guide_refs(vault, policy):
    """vault path -> guides that link it. Generated catalog pages are not guides."""
    ci._LS.clear()
    is_private = lambda p: policy.private_rel(relp(p, vault)) or policy.private_real_path(os.path.realpath(p))
    docs, _, _ = ci.index_docs(vault, os.path.join(vault, ROUTER), is_private)
    refs = defaultdict(set)
    for d in docs:
        text = read(d)
        if text is None or text.startswith(MARKER[:40]):
            continue
        for _, href in links(text):
            if re.match(r"^[a-z]+:", href) or href.startswith("#"):
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(d), unquote(re.split(r"[#?]", href)[0])))
            rel = nfc(relp(target, vault))
            if not rel.startswith(".."):
                refs[rel].add(relp(d, vault))
    return refs


def refs_of(refs, p):
    parts = nfc(p).split("/")
    direct = ", ".join(sorted(refs.get("/".join(parts), ()))) or "참조 안내 없음"
    # Ancestors below the source root only: the router's source table links every src-* root.
    up = [f"{d}({'/'.join(parts[:i])}/)" for i in range(len(parts) - 1, 1, -1) for d in sorted(refs.get("/".join(parts[:i]), ()))]
    return direct, ", ".join(up) or "-"


def fmt_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n}B" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024


label = lambda s: s.replace("[", "(").replace("]", ")").replace("`", "'")
href = lambda rel: "/".join(encode(s).replace("`", "%60") for s in rel.split("/"))
page = lambda stem: href(stem + ".md")   # every link to a generated page goes through the same encoding


def entry(rel, m):
    date = time.strftime("%Y-%m-%d", time.localtime(m["mtime_ns"] / 1e9))
    return f"- [{label(rel.rsplit('/', 1)[-1])}]({href(rel)}) · {fmt_size(m['size'])} · {date}"


def catalog(inv):
    """{page name: text}. Pages stay under PAGE_LINES lines; names follow <parent>--<part>.md so check_index
    can reach and validate them. The source root folder itself is not linked (keeps 'new top item' signals)."""
    pages, used = {}, {"catalog.md"}

    def alloc(stem):
        name, i = stem, 2
        while (name + ".md").casefold() in used:
            name, i = f"{stem}-{i}", i + 1
        used.add((name + ".md").casefold())
        return name

    def emit(stem, title, back, head, body):
        cap = PAGE_LINES - len(head) - 8
        chunks, cur, grp = [], [], None
        for g, line in body:
            need = 2 if g and (g != grp or not cur) else 1
            if cur and len(cur) + need > cap:
                chunks.append(cur); cur = []
            if g and (g != grp or not cur):
                cur.append(f"### {label(g)}")
            cur.append(line); grp = g
        chunks.append(cur)
        names = [stem] + [alloc(f"{stem}--p{i}") for i in range(2, len(chunks) + 1)]
        for i, (name, lines) in enumerate(zip(names, chunks)):
            nav = " · ".join(([f"[← 이전 쪽]({page(names[i - 1])})"] if i else []) + ([f"[다음 쪽 →]({page(names[i + 1])})"] if i + 1 < len(names) else []))
            top = [MARKER, f"# {title}" + (f" ({i + 1}/{len(names)}쪽)" if len(names) > 1 else ""), "", back, ""]
            pages[name + ".md"] = "\n".join(top + head + [""] + ([nav, ""] if nav else []) + lines) + "\n"

    by_src = defaultdict(list)
    for p, m in inv["files"].items():
        by_src[p.split("/")[0]].append((nfc(p), p, m))
    rows, skipped = [], Counter()
    for src in sorted(set(by_src) | set(inv["sources"])):
        meta = inv["sources"].get(src, {})
        skipped.update(meta.get("skipped", {}))
        items = sorted(by_src.get(src, []))
        status = STATUS_KO.get(meta.get("status"), "상태 미상")
        if not items:
            rows.append(f"| {label(src)} | {status} | 0 | 목록 없음 |"); continue
        stem = alloc(f"catalog--{nfc(src).replace('--', '-')}")
        exts = Counter(os.path.splitext(p)[1].lower().lstrip(".") or "(확장자 없음)" for _, p, _ in items)
        top_exts = exts.most_common(10)
        rest = len(items) - sum(n for _, n in top_exts)
        head = [f"상태: {status} · 파일 {len(items)}개", "형식: " + ", ".join(f"{e} {n}" for e, n in top_exts) + (f", 기타 {rest}" if rest else "")]
        folder = lambda p: p.rsplit("/", 1)[0] + "/"
        lines = [(folder(p), entry(p, m)) for _, p, m in items]
        title, back = f"파일 목록 -- {label(src)}", "[← 파일 목록](catalog.md)"
        if len(lines) + len({g for g, _ in lines}) <= PAGE_LINES - len(head) - 8:
            emit(stem, title, back, head, lines)
        else:   # one page set per first-level folder; files right under the source stay on the source page
            groups = defaultdict(list)
            for _, p, m in items:
                parts = p.split("/")
                groups[parts[1] if len(parts) > 2 else None].append((p, m))
            body = []
            for child in sorted((c for c in groups if c), key=nfc):
                cstem = alloc(f"{stem}--{nfc(child).replace('--', '-')}")
                emit(cstem, f"{title}/{label(child)}", f"[← {label(src)} 목록]({page(stem)})", [f"파일 {len(groups[child])}개"],
                     [(folder(p), entry(p, m)) for p, m in groups[child]])
                body.append((None, f"- [{label(child)}/]({page(cstem)}) · 파일 {len(groups[child])}개"))
            body += [(folder(p), entry(p, m)) for p, m in groups.get(None, [])]
            emit(stem, title, back, head, body)
        rows.append(f"| {label(src)} | {status} | {len(items)} | [{label(stem)}.md]({page(stem)}) |")
    excluded = " · ".join(f"{SKIP_KO.get(k, k)} {v}" for k, v in sorted(skipped.items())) or "없음"
    # shortcut: catalog.md itself is not paged; a vault with more than ~60 sources would need paging here.
    pages["catalog.md"] = "\n".join([
        MARKER, "# 파일 목록 (자동 생성)", "", "[← 라우터](CLAUDE.md)", "",
        "파일의 존재와 크기·수정일만 보여준다. 용도·질문·정본 연결은 영역 색인·MOC·프로젝트 안내에서 한다. "
        "이 목록에 있다는 것은 본문을 검토했다는 뜻이 아니다.",
        f"제외(경로 미표시): {excluded}", "",
        "| 자료원 | 상태 | 파일 | 목록 |", "|---|---|---|---|"] + rows) + "\n"
    return pages


def sha(data):
    return hashlib.sha256(data).hexdigest()


def link_rels(vault, text):
    """Vault-relative NFC targets of a top-level page's links (outside-vault and external links dropped)."""
    for _, h in links(text):
        if not re.match(r"^[a-z]+:", h) and not h.startswith("#"):
            rel = nfc(relp(os.path.normpath(os.path.join(vault, unquote(re.split(r"[#?]", h)[0]))), vault))
            if not rel.startswith(".."):
                yield rel


def removable(vault, name, recorded, linked):
    p = os.path.join(vault, name)
    return (re.fullmatch(r"catalog(--.+)?\.md", name) is not None and name not in linked
            and sha(open(p, "rb").read()) == recorded[name])   # owned, unedited, unreferenced


def page_conflicts(vault, pages, old, policy):
    recorded, out = (old or {}).get("pages", {}), []
    linked = hand_links(vault)
    for name in sorted(set(recorded) - set(pages)):   # pages no longer generated
        p = os.path.join(vault, name)
        if not os.path.isfile(p) or is_link(p) or removable(vault, name, recorded, linked):
            continue
        if any(not policy.allowed_rel(r) for r in link_rels(vault, open(p, encoding="utf-8", errors="replace").read())):
            # it must be kept (edited or referenced) but still links paths that are now private: block, never keep silently
            out.append((name, "남길 이전 생성 페이지가 지금은 비공개·제외인 경로를 가리킴 (참조를 정리하고 파일을 지운 뒤 다시 실행)"))
    for name, text in sorted(pages.items()):
        p = os.path.join(vault, name)
        if not os.path.lexists(p):
            continue
        if is_link(p) or not os.path.isfile(p):
            out.append((name, "링크이거나 파일이 아님")); continue
        cur = open(p, "rb").read()
        if cur == text.encode("utf-8"):
            continue
        if not cur.startswith(MARKER.encode("utf-8")):
            out.append((name, "같은 이름의 수작업 문서 (덮어쓰지 않음)"))
        elif sha(cur) != recorded.get(name):
            out.append((name, "생성 뒤 직접 수정됨 (수정 내용을 수작업 색인으로 옮기고 파일을 지운 뒤 다시 실행)"))
    return out


def hand_links(vault):
    """Top-level page names linked from hand-written top-level documents."""
    names = set()
    for n in os.listdir(vault):
        p = os.path.join(vault, n)
        if n.endswith(".md") and os.path.isfile(p) and ci.in_vault(p, vault):   # never read through a link
            text = read(p) or ""
            if not text.startswith(MARKER):
                names |= set(link_rels(vault, text))
    return names


def write_all(vault, new, old, pages):
    recorded, changed, removed, kept = (old or {}).get("pages", {}), 0, [], []
    for name, text in sorted(pages.items()):
        data, p = text.encode("utf-8"), os.path.join(vault, name)
        if not (os.path.isfile(p) and open(p, "rb").read() == data):
            write_atomic(vault, name, data); changed += 1
    new["pages"] = {n: sha(t.encode("utf-8")) for n, t in pages.items()}
    linked = hand_links(vault)
    for name in sorted(set(recorded) - set(pages)):   # pages no longer generated
        p = os.path.join(vault, name)
        if not os.path.isfile(p) or is_link(p):
            continue
        if not removable(vault, name, recorded, linked):
            kept.append(name); new["pages"][name] = recorded[name]; continue
        os.remove(p); removed.append(name); changed += 1
    data = dump(new)
    inv_path = os.path.join(vault, INVENTORY)
    if not (os.path.isfile(inv_path) and open(inv_path, "rb").read() == data):
        write_atomic(vault, INVENTORY, data); changed += 1
    return changed, removed, kept


def show(out, title, rows):
    out(f"\n## {title} ({len(rows)})")
    for r in rows[:LIST_CAP]:
        out("- " + (r if isinstance(r, str) else " | ".join(map(str, r))))
    if len(rows) > LIST_CAP:
        out(f"- … 외 {len(rows) - LIST_CAP}개")


def run(vault, write=False, accept=(), review_out=None, include_backlog=False, out=print):
    t0, vault = time.monotonic(), os.path.abspath(vault)
    router, policy = open_vault(vault)
    old, review = state(vault, INVENTORY), state(vault, REVIEW)
    scanned, unregistered, top_skipped = scan(vault, router, policy)
    new, rep = plan(old, scanned, policy, set(accept), time.strftime("%Y-%m-%dT%H:%M:%S%z"))
    pages = catalog(new)
    conflicts = page_conflicts(vault, pages, old, policy)
    if review_out:
        try:
            policy.check_out(review_out)
            if os.path.lexists(review_out) and is_link(review_out):
                raise ValueError("--review-out이 링크임")
        except ValueError as e:
            raise Fatal(e)
    wrote = "읽기 전용: 아무것도 쓰지 않음 (--write로 목록·생성 페이지 반영)"
    if write:
        if conflicts:
            for name, why in conflicts:
                out(f"ERROR: 생성 목록 충돌 {name}: {why}")
            out("아무것도 쓰지 않았다."); return 2
        changed, removed, kept = write_all(vault, new, old, pages)
        if review and any(not policy.allowed_rel(k) for k in review["files"]):
            # only removes records the current policy blocks; --write never adds a completed review
            review["files"] = {k: v for k, v in review["files"].items() if policy.allowed_rel(k)}
            write_atomic(vault, REVIEW, dump(review)); changed += 1
        wrote = f"쓰기: 파일 {changed}개 갱신" if changed else "쓰기: 변경 없음 (파일을 다시 쓰지 않음)"
        # removed page names can carry a newly private source name: count only
        wrote += (f", 오래된 생성 페이지 삭제 {len(removed)}개" if removed else "") + (f", 참조·수정이 있어 남긴 생성 페이지 {', '.join(kept)}" if kept else "")
    held = {n for n, s in new["sources"].items() if s["status"] in ("retarget_held", "absent")}
    targets, counts = review_targets(new if write else old, scanned, review, include_backlog, held, policy)
    refs = guide_refs(vault, policy)
    out(f"# 파일 목록 조사\nvault: {vault}\n비공개: {len(policy.private)}개 · 정책 지문 {policy.fingerprint()}"
        + (" (이전 목록과 다름: 새 정책 기준으로 다시 걸렀음)" if old and old.get("policy") != policy.fingerprint() else ""))
    if not old:
        out("저장된 목록 없음: 이번 결과가 기준선이 된다. 기준선 파일은 검토한 것으로 소급하지 않는다.")
    show(out, "자료원 상태 — 자료원 | 상태 | 파일 | 오류 | 제외", [
        (n, STATUS_KO.get(s["status"], s["status"]), len(scanned[n]["files"]) if n in scanned else "-", s.get("errors", 0),
         ", ".join(f"{SKIP_KO.get(k, k)} {v}" for k, v in sorted(s.get("skipped", {}).items())) or "-")
        for n, s in sorted(new["sources"].items())])
    show(out, "라우터에 등록되지 않은 src- 링크 (목록 제외, 등록은 사용자 확인 후)", unregistered)
    show(out, "보류 — 자료원 | 이유", rep["held"])
    show(out, "조사 오류 경로 (부분 조사: 이 아래의 사라진 파일은 삭제로 보지 않음)", rep["errors"])
    show(out, "기준 목록 생성 — 자료원 | 파일 (추가·삭제 후보로 보고하지 않음)", rep["baseline"])
    show(out, "추가 후보", rep["added"])
    show(out, "변경 후보 (크기·수정 시각 기준. 메타데이터가 같은 내용 변경은 잡지 못함)", rep["changed"])
    show(out, "삭제 후보 (완전 조사된 자료원만, 확정 아님) — 경로 | 참조 안내", [(m, refs_of(refs, m)[0]) for m in rep["missing"]])
    show(out, "이동 후보 (같은 이름·크기, 자동 확정 안 함) — 이전 | 현재", rep["moves"])
    show(out, "NFC/NFD 정규화 충돌 (자동으로 합치지 않음)", rep["collisions"])
    show(out, "재검토 대상 — 경로 | 사유 | 참조 안내 | 상위 폴더 참조", [(t[0], t[-1], *refs_of(refs, t[0])) for t in targets])
    show(out, "생성 목록 충돌 (--write 불가) — 파일 | 이유", conflicts)
    done = " / ".join(f"{lv} {counts[lv]}" for lv in LEVELS[:3])
    out(f"\n## 요약\n목록 파일 {len(new['files'])}개 · 자료원 {len(new['sources'])}개 · 이번 순회 파일 {sum(len(s['files']) for s in scanned.values())}개, "
        f"폴더 {sum(len(s['dirs']) for s in scanned.values())}개 · 경과 {time.monotonic() - t0:.2f}초 (본문은 읽지 않음)")
    out(f"변경 후보: 추가 {len(rep['added'])}, 변경 {len(rep['changed'])}, 삭제 후보 {len(rep['missing'])}, 이동 후보 {len(rep['moves'])}, 충돌 {len(rep['collisions'])}")
    out(f"검토 상태: 현재 원본과 일치하는 검토 {done}, 보류 {sum(1 for t in targets if t[-1].startswith('보류'))}, "
        f"재검토 대상 {len(targets)}, 기준선 미검토 {counts['backlog']}" + ("" if include_backlog else " (--all로 포함)")
        + f", 원본에서 사라진 검토 기록 {counts['orphan']}")
    if rep["dropped"]:
        out(f"새 비공개·제외 정책으로 목록에서 뺀 항목 {len(rep['dropped'])}개 (경로 미표시)")
    out("목록 조사는 내용 검토·의미 색인 반영·질문 검증이 아니다. 검토 완료는 --mark로만 기록한다.")
    out(wrote)
    if review_out:
        with open(review_out, "w", encoding="utf-8") as f:
            f.write("# path\tsize\tmtime_ns\tsource_id\treason\n" + "".join("\t".join(map(str, t)) + "\n" for t in targets))
        out(f"재검토 대상 {len(targets)}개 저장: {review_out}")
    unsettled = any(s["status"] != "complete" for s in new["sources"].values()) or conflicts or unregistered
    return 1 if unsettled else 0


def mark(vault, level, from_file, out=print):
    vault = os.path.abspath(vault)
    _, policy = open_vault(vault)
    review = state(vault, REVIEW) or {"version": 1, "files": {}}
    ok, rejected, changed = 0, Counter(), []
    for row in read_paths(from_file):
        p, reason = policy.check_rel(row[0])
        if reason:
            rejected[reason] += 1; continue
        try:
            snap, src = (int(row[1]), int(row[2])), row[3]
        except (IndexError, ValueError):
            rejected["no_snapshot"] += 1; continue
        st = os.stat(p)
        # file or source target changed after it was read: not current
        if (st.st_size, st.st_mtime_ns) != snap or src != policy.source_id(row[0].split("/")[0]):
            changed.append(row[0]); continue
        review["files"][nfc(row[0])] = {"size": snap[0], "mtime_ns": snap[1], "source": src, "level": level,
                                        "at": time.strftime("%Y-%m-%d")}
        ok += 1
    for k in [k for k in review["files"] if not policy.allowed_rel(k)]:
        del review["files"][k]   # newly private: forget the record without printing it
    write_atomic(vault, REVIEW, dump(review))
    out(f"검토 기록 {level}: {ok}개" + (f" · 거부 {dict(rejected)}" if rejected else ""))
    for c in changed:
        out(f"- 읽은 뒤 바뀜 (기록 안 함, 재검토 대상): {c}")
    return 1 if rejected or changed else 0


def selftest():
    def put(path, text="", mtime=None):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w", encoding="utf-8").write(text)
        if mtime:
            os.utime(path, ns=(mtime, mtime))

    def report(*a, **k):
        lines = []
        rc = run(*a, out=lines.append, **k)
        return rc, "\n".join(lines)

    def section(rep, title):
        return rep.split(f"## {title}")[1].split("\n## ")[0]

    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as work:
        put(os.path.join(t, ROUTER), "[업무](work.md) [projects](projects/)\n- 비공개: `projects/개인`\n")
        put(os.path.join(t, "work.md"), "[README](projects/app/README.md) [app](projects/app/)\n[deep](projects/app/docs/spec/v1/api.md)\n")
        deep = os.path.join(t, "projects", "app", "docs", "spec", "v1", "api.md")
        put(deep, "# API", 10**18)
        put(os.path.join(t, "projects", "app", "README.md"), "# app")
        put(os.path.join(t, "projects", "app", "src", "main.py"), "print()")
        put(os.path.join(t, "projects", "app", "node_modules", "x", "i.js"))
        put(os.path.join(t, "projects", "개인", "diary.md"), "private")
        put(os.path.join(t, "projects", "api_token.txt"), "k")
        put(os.path.join(t, "projects", "scan 900101-1234567.pdf"))
        # read-only first run: nothing written, everything is baseline
        rc, rep = report(t)
        assert not os.path.exists(os.path.join(t, ".secondbrain")) and not os.path.exists(os.path.join(t, "catalog.md")), rep
        assert "저장된 목록 없음" in rep and "재검토 대상 — 경로 | 사유 | 참조 안내 | 상위 폴더 참조 (0)" in rep, rep
        for leak in ("개인", "diary", "token", "900101", "node_modules"):
            assert leak not in rep.split("## 자료원 상태")[1].split("제외")[0], (leak, rep)
        # --write creates inventory + catalog; a second --write is a no-op (byte-identical)
        assert report(t, write=True)[0] == 0
        snap = {n: open(os.path.join(t, n), "rb").read() for n in ("catalog.md", "catalog--projects.md", INVENTORY)}
        cat = snap["catalog--projects.md"].decode()
        assert "[api.md](projects/app/docs/spec/v1/api.md)" in cat and "diary" not in cat and "900101" not in cat and "token" not in cat, cat
        rc, rep = report(t, write=True)
        assert "쓰기: 변경 없음" in rep, rep
        assert all(open(os.path.join(t, n), "rb").read() == b for n, b in snap.items())
        # the generated pages pass the link checker once the router links catalog.md
        with open(os.path.join(t, ROUTER), "a", encoding="utf-8") as f:
            f.write("[파일 목록](catalog.md)\n")
        lines = []; assert ci.run(t, out=lines.append) == 0, lines
        # deep change: candidate with the guide that links it; inventory not yet written
        put(deep, "# API v2", 10**18 + 5)
        rc, rep = report(t)
        assert "projects/app/docs/spec/v1/api.md" in section(rep, "변경 후보"), rep
        assert "- projects/app/docs/spec/v1/api.md | 변경 (목록 미반영) | work.md | work.md(projects/app/)" in rep, rep
        # inventory saved, review never done: zero changes, still a review target
        report(t, write=True)
        rc, rep = report(t)
        assert "변경 후보 (크기·수정 시각 기준. 메타데이터가 같은 내용 변경은 잡지 못함) (0)" in rep, rep
        assert "- projects/app/docs/spec/v1/api.md | 목록 반영 후 미검토 | work.md | work.md(projects/app/)" in rep, rep
        # review list must stay outside the vault; mark only what still matches the snapshot
        try:
            report(t, review_out=os.path.join(t, "targets.tsv"))
        except Fatal:
            pass
        else:
            raise AssertionError("review list inside the vault accepted")
        lst = os.path.join(work, "targets.tsv")
        report(t, review_out=lst, include_backlog=True)
        rows = [r for r in read_paths(lst)]
        assert {r[0] for r in rows} == {"projects/app/README.md", "projects/app/docs/spec/v1/api.md", "projects/app/src/main.py"}, rows
        put(os.path.join(t, "projects", "app", "README.md"), "# app changed after reading")
        lines = []; assert mark(t, "full", lst, out=lines.append) == 1
        assert "읽은 뒤 바뀜 (기록 안 함, 재검토 대상): projects/app/README.md" in "\n".join(lines), lines
        rc, rep = report(t)
        assert "api.md | 목록 반영 후 미검토" not in rep and "full 2" in rep, rep
        assert "projects/app/README.md | 변경 (목록 미반영) | work.md | work.md(projects/app/)" in rep, rep
        put(deep, "# API v3", 10**18 + 9)
        rc, rep = report(t)
        assert "api.md | 검토 후 변경 | work.md" in rep, rep
        # a manual catalog page or an edited generated page blocks --write entirely
        with open(os.path.join(t, "catalog--projects.md"), "a", encoding="utf-8") as f:
            f.write("손으로 붙인 설명\n")
        inv_before = open(os.path.join(t, INVENTORY), "rb").read()
        rc, rep = report(t, write=True)
        assert rc == 2 and "생성 뒤 직접 수정됨" in rep and open(os.path.join(t, INVENTORY), "rb").read() == inv_before, rep
        os.remove(os.path.join(t, "catalog--projects.md"))
        # a newly private folder disappears from inventory, catalog and review-state without being printed
        open(os.path.join(t, ROUTER), "a", encoding="utf-8").write("- 비공개: `projects/app/docs`\n")
        rc, rep = report(t, write=True)
        assert "api.md" not in rep and "목록에서 뺀 항목 1개" in rep, rep
        assert "api.md" not in open(os.path.join(t, INVENTORY), encoding="utf-8").read()
        mark(t, "head", lst, out=lambda _: None)
        assert "api.md" not in open(os.path.join(t, REVIEW), encoding="utf-8").read()
        put(os.path.join(t, "work.md"), "[README](projects/app/README.md) [app](projects/app/)\n")   # the user drops the old link
        # large folders are paged under PAGE_LINES (names with spaces encoded); vanished pages are removed
        # only when owned, unedited and unreferenced; a page that must stay may not keep links to new private paths
        for i in range(150):
            put(os.path.join(t, "projects", "Bulk Notes", f"f{i:03}.md"))
        report(t, write=True)
        assert os.path.exists(os.path.join(t, "catalog--projects--Bulk Notes--p2.md"))
        lines = []; assert ci.run(t, out=lines.append) == 0, lines
        rep_ci = "\n".join(lines)
        assert "100줄을 넘는 색인 (하위 색인으로 분할 필요) — 문서 | 줄 수 (0)" in rep_ci and "이름 규칙 위반 — 문서 | 이유 (0)" in rep_ci, rep_ci
        assert "중복 링크 — 문서 | 자료명 | 링크 (0)" in rep_ci and "catalog--projects--Bulk Notes--p3.md" in rep_ci.split("문서:")[1].split("\n")[0], rep_ci
        with open(os.path.join(t, "work.md"), "a", encoding="utf-8") as f:
            f.write("[bulk](catalog--projects--Bulk%20Notes.md)\n")
        open(os.path.join(t, ROUTER), "a", encoding="utf-8").write("- 비공개: `projects/Bulk Notes`\n")
        rc, rep = report(t, write=True)
        assert rc == 2 and "충돌 catalog--projects--Bulk Notes.md: 남길 이전 생성 페이지가" in rep and "f000" not in rep, rep
        put(os.path.join(t, "work.md"), "[README](projects/app/README.md) [app](projects/app/)\n")
        rc, rep = report(t, write=True)
        assert "오래된 생성 페이지 삭제" in rep and not os.path.exists(os.path.join(t, "catalog--projects--Bulk Notes.md")), rep
        assert not [n for n in os.listdir(os.path.join(t, ".secondbrain")) if n.startswith(".tmp-")]
    with tempfile.TemporaryDirectory() as t:
        # a hand-written catalog.md is never overwritten; nothing else is written either
        put(os.path.join(t, ROUTER), "[f](catalog.md)\n")
        put(os.path.join(t, "catalog.md"), "# 내가 쓴 목록\n")
        put(os.path.join(t, "notes", "a.md"))
        rc, rep = report(t, write=True)
        assert rc == 2 and "수작업 문서" in rep and not os.path.exists(os.path.join(t, ".secondbrain")), rep
    # NFC/NFD: two disk spellings of one name are reported, kept apart, and linked with their disk bytes
    policy = Policy.__new__(Policy)
    policy.private, policy.private_real, policy.vault, policy.unresolved, policy.ids = set(), [], tempfile.gettempdir(), set(), {}
    policy.private_cf = set()
    nfd, nfc_ = "s/가.md", "s/가.md"
    scanned = {"s": {"status": "complete", "target": "t", "files": {nfd: (1, 1), nfc_: (2, 2)}, "dirs": [], "skipped": Counter(), "errors": []}}
    new, rep = plan(None, scanned, policy, set(), "now")
    assert rep["collisions"] and set(new["files"]) == {nfd, nfc_}, rep
    assert "s/%E1%84%80%E1%85%A1.md" not in catalog(new)["catalog--s.md"] and f"]({nfd})" in catalog(new)["catalog--s.md"]
    new2, rep2 = plan({**new, "sources": {"s": {**new["sources"]["s"], "complete_at": "x"}}}, scanned, policy, set(), "now")
    assert set(new2["files"]) == {nfd, nfc_} and rep2["collisions"] and not rep2["missing"], rep2   # stable on rerun
    # a respelled (NFC<->NFD) path is the same file, not delete + add
    old = {"version": 1, "policy": "p", "pages": {}, "sources": {"s": {"status": "complete", "target": "t", "complete_at": "x"}},
           "files": {nfd: {"size": 1, "mtime_ns": 1}}}
    scanned["s"]["files"] = {nfc_: (1, 1)}
    new, rep = plan(old, scanned, policy, set(), "now")
    assert not rep["added"] and not rep["missing"] and list(new["files"]) == [nfc_], rep
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as ext, tempfile.TemporaryDirectory() as ext2:
        for f in ("proj/a/b/deep.md", "proj/README.md", "개인/id.md"):
            put(os.path.join(ext, f), "x")
        put(os.path.join(ext2, "other.md"), "y")
        try:
            os.symlink(ext, os.path.join(ext, "proj", "loop"), target_is_directory=True)
        except OSError:   # Windows without Developer Mode cannot create symlinks
            print("selftest ok (symlink cases skipped: no permission)"); return
        os.symlink(os.path.join(ext, "개인"), os.path.join(ext, "proj", "alias"), target_is_directory=True)
        link = os.path.join(t, "src-x")
        os.symlink(ext, link, target_is_directory=True)
        os.symlink(os.path.join(ext, "개인"), os.path.join(t, "src-y"), target_is_directory=True)
        os.symlink(ext2, os.path.join(t, "src-unreg"), target_is_directory=True)
        put(os.path.join(t, ROUTER), "| [src-x](src-x/) | Drive | 업무 |\n| [src-y](src-y/) | Drive | 개인 |\n- 비공개: `src-x/개인`\n[g](g.md)\n")
        put(os.path.join(t, "g.md"), "[deep](src-x/proj/a/b/deep.md)\n")
        rc, rep = report(t, write=True)
        inv = open(os.path.join(t, INVENTORY), encoding="utf-8").read()
        assert set(json.loads(inv)["files"]) == {"src-x/proj/a/b/deep.md", "src-x/proj/README.md"}, inv   # no loop, no alias
        assert "id.md" not in rep and "id.md" not in open(os.path.join(t, "catalog.md"), encoding="utf-8").read(), rep
        assert "src-y | 비공개 경로의 별칭(목록 제외)" in rep and "- src-unreg" in section(rep, "라우터에 등록되지 않은"), rep
        # offline source: previous entries kept, no deletion candidates
        os.remove(link); os.symlink(os.path.join(ext, "gone"), link, target_is_directory=True)
        rc, rep = report(t, write=True)
        assert rc == 1 and "src-x | 연결 실패(이전 목록 유지)" in rep and "삭제 후보 (완전 조사된 자료원만, 확정 아님) — 경로 | 참조 안내 (0)" in rep, rep
        assert json.loads(open(os.path.join(t, INVENTORY), encoding="utf-8").read())["files"].keys() == json.loads(inv)["files"].keys()
        # retarget: held until accepted, never a mass delete
        os.remove(link); os.symlink(ext2, link, target_is_directory=True)
        rc, rep = report(t, write=True)
        assert "연결 대상 변경" in rep and "deep.md" in open(os.path.join(t, INVENTORY), encoding="utf-8").read(), rep
        assert "삭제 후보 (완전 조사된 자료원만, 확정 아님) — 경로 | 참조 안내 (0)" in rep, rep
        rc, rep = report(t, write=True, accept=["src-x"])
        assert list(json.loads(open(os.path.join(t, INVENTORY), encoding="utf-8").read())["files"]) == ["src-x/other.md"], rep
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as s:
        # a new private source also hides cached entries of another link to the same real folder
        put(os.path.join(s, "note.md"), "# n")
        for n in ("src-a", "src-b"):
            os.symlink(s, os.path.join(t, n), target_is_directory=True)
        put(os.path.join(t, ROUTER), "[a](src-a/) [b](src-b/)\n")
        snap = os.path.join(s + "-read.tsv")
        report(t, write=True, include_backlog=True, review_out=snap)
        assert mark(t, "full", snap, out=lambda _: None) == 0
        os.remove(snap)
        open(os.path.join(t, ROUTER), "a", encoding="utf-8").write("- 비공개: `src-a`\n")
        rc, rep = report(t, write=True)
        saved = open(os.path.join(t, INVENTORY), encoding="utf-8").read()
        pages = "".join(open(os.path.join(t, n), encoding="utf-8").read() for n in os.listdir(t) if n.startswith("catalog"))
        assert "note.md" not in saved and "note.md" not in pages and "note.md" not in rep and "src-a" not in rep, rep
        assert "src-a" not in saved, saved   # private rule paths are stored as hashes only
        assert "note.md" not in open(os.path.join(t, REVIEW), encoding="utf-8").read() and "full 0" in rep, rep
        # the alias stays blocked while the private link is offline (identity saved as a hash)
        os.remove(os.path.join(t, "src-a")); os.symlink(s + "-gone", os.path.join(t, "src-a"), target_is_directory=True)
        rc, rep = report(t, write=True)
        assert "note.md" not in open(os.path.join(t, INVENTORY), encoding="utf-8").read() and "src-b | 비공개 경로의 별칭" in rep, rep
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as s:
        # private comparison ignores case (case-insensitive file systems); the offline hash keeps the alias blocked
        put(os.path.join(s, "Private", "note.md"), "# n"); put(os.path.join(s, "open.md"), "# o")
        for n in ("src-a", "src-b"):
            os.symlink(s, os.path.join(t, n), target_is_directory=True)
        put(os.path.join(t, ROUTER), "[a](src-a/) [b](src-b/)\n- 비공개: `src-a/private`\n")
        report(t, write=True)
        saved = json.loads(open(os.path.join(t, INVENTORY), encoding="utf-8").read())
        assert set(saved["files"]) == {"src-a/open.md", "src-b/open.md"}, saved["files"]
        os.remove(os.path.join(t, "src-a")); os.symlink(s + "-gone", os.path.join(t, "src-a"), target_is_directory=True)
        report(t, write=True)
        assert "note.md" not in open(os.path.join(t, INVENTORY), encoding="utf-8").read()
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b, \
            tempfile.TemporaryDirectory() as work:
        # a retargeted source invalidates reviews even when the new files have equal size/mtime;
        # a snapshot read before the retarget is refused by --mark
        put(os.path.join(a, "note.md"), "# old", 10**18); put(os.path.join(b, "note.md"), "# new", 10**18)
        link = os.path.join(t, "src-a")
        os.symlink(a, link, target_is_directory=True)
        put(os.path.join(t, ROUTER), "[a](src-a/)\n")
        snap = os.path.join(work, "read.tsv")
        report(t, write=True, include_backlog=True, review_out=snap)
        assert mark(t, "full", snap, out=lambda _: None) == 0
        os.remove(link); os.symlink(b, link, target_is_directory=True)
        report(t, write=True, accept=["src-a"])
        nxt = os.path.join(work, "next.tsv")
        report(t, include_backlog=True, review_out=nxt)
        assert "src-a/note.md\t" in open(nxt, encoding="utf-8").read() and "검토 후 변경" in open(nxt, encoding="utf-8").read()
        lines = []; assert mark(t, "full", snap, out=lines.append) == 1 and "읽은 뒤 바뀜" in "\n".join(lines), lines
    print("selftest ok")


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("vault", nargs="?")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--accept-source", action="append", default=[])
    ap.add_argument("--review-out")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--mark", choices=LEVELS)
    ap.add_argument("--from", dest="from_file")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        selftest(); return 0
    if not a.vault or bool(a.mark) != bool(a.from_file) or (a.mark and (a.write or a.review_out)):
        print(__doc__); return 2
    try:
        if a.mark:
            return mark(a.vault, a.mark, a.from_file)
        return run(a.vault, a.write, a.accept_source, a.review_out, a.all)
    except Fatal as e:
        print(f"ERROR: {e}"); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
