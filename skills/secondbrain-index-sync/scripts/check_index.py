#!/usr/bin/env python3
"""Second-brain index checker: finds index drift between the router/guides and the folder.

Reads index documents only (router, top-level indexes/MOCs, INDEX.md); other files by name and metadata (size, mtime).
Usage:
  python3 -I check_index.py <root>               # report
  python3 -I check_index.py <root> --normalize   # also rewrite link hrefs to exact on-disk names
  python3 -I check_index.py --selftest
"""
import os, re, sys, time, tempfile, unicodedata
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from private_paths import load_private_paths, SECRET_RE

ROUTER = "CLAUDE.md"
SKIP_NAMES = {".DS_Store", "AGENTS.md", ROUTER, "Icon\r"}
# Names that look like credentials. ".key" is deliberately absent: here it means Keynote.
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
CODE_RE = re.compile(r"`[^`]*`")
MAX_LINES = 100                     # an index longer than this should be split into sub-indexes

nfc = lambda s: unicodedata.normalize("NFC", s)
# Vault-relative path with "/" separators on every OS (links and the private list use "/").
relp = lambda p, root: os.path.relpath(p, root).replace(os.sep, "/")
# Windows junctions (mklink /J) are not symlinks to islink(); treat both as links. isjunction needs Python 3.12+.
is_link = lambda p: os.path.islink(p) or getattr(os.path, "isjunction", lambda _: False)(p)


def links(text):
    """Markdown links outside inline code spans: [(label, href)]."""
    return LINK_RE.findall(CODE_RE.sub("", text))


def encode(seg):
    return seg.replace("%", "%25").replace(" ", "%20").replace(":", "%3A").replace("(", "%28").replace(")", "%29").replace("#", "%23").replace("?", "%3F")


def resolve(base_dir, href):
    """Return (exact_href, abs_path) matching on-disk bytes, or (None, None) if missing."""
    m = re.match(r"([^#?]*)(.*)", href, re.S)      # keep "#section" / "?query" out of the path
    path, tail = m.group(1), m.group(2)
    cur, out = base_dir, []
    for seg in path.split("/"):
        if seg in ("", "."):
            out.append(seg); continue
        if seg == "..":
            out.append(seg); cur = os.path.dirname(cur); continue
        want = nfc(unquote(seg))
        try:
            hit = next((e for e in os.listdir(cur) if nfc(e) == want), None)
        except (NotADirectoryError, FileNotFoundError, PermissionError):
            hit = None
        if hit is None:
            return None, None
        out.append(encode(hit)); cur = os.path.join(cur, hit)
    return "/".join(out) + tail, cur


def read(p):
    """File text, or None when it cannot be read (permission, not UTF-8, missing)."""
    try:
        with open(p, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None


def private_names(router_text):
    """Backticked names on router lines that mention 비공개 (private)."""
    names = set()
    for line in router_text.splitlines():
        if "비공개" in nfc(line):
            names |= {nfc(n).rstrip("/") for n in re.findall(r"`([^`]+)`", line)}
    return names


def run(root, normalize=False, out=print):
    root = os.path.abspath(root)
    rpath = os.path.join(root, ROUTER)
    if not os.path.exists(rpath):
        out(f"ERROR: {ROUTER} 없음: {root}"); return 2
    router = read(rpath)
    if router is None:
        out(f"ERROR: {ROUTER} 읽기 실패: {rpath}"); return 2
    try:
        private = load_private_paths(root, router)
    except (OSError, UnicodeError, ValueError) as error:
        out(f"ERROR: 비공개 목록/장부 확인 실패 ({type(error).__name__})")
        return 2

    def is_private(p):
        rel = nfc(relp(p, root)).replace(os.sep, "/")
        return any(rel == n or rel.startswith(n + "/") for n in private)

    # Index documents only: top-level .md (field indexes, sub-indexes, MOCs) and INDEX.md files.
    # Notes linked from an index are source material: never read or rewritten.
    guides, queue, parent, unreadable = [], [rpath], {}, []
    while queue:
        cur = queue.pop(0)
        text = read(cur)
        if text is None:
            unreadable.append(relp(cur, root)); continue
        for _, href in links(text):
            h, p = resolve(os.path.dirname(cur), href)
            if (p and p.endswith(".md") and os.path.basename(p) not in SKIP_NAMES and p != rpath and p not in guides
                    and os.path.commonpath([p, root]) == root
                    and (os.path.dirname(p) == root or (os.path.basename(p) == "INDEX.md"
                         and os.path.realpath(p).startswith(os.path.realpath(root) + os.sep)))
                    and not SECRET_RE.search(os.path.basename(p)) and not is_private(p)):
                guides.append(p); queue.append(p); parent[p] = cur
    docs = [rpath] + [g for g in guides if relp(g, root) not in unreadable]
    out(f"# 점검 대상\nroot: {root}\n문서: {', '.join(relp(d, root) for d in docs)}\n비공개(읽지 않음): {len(private)}개 (라우터와 지정 장부의 합집합)")

    linked = {}          # abs path -> [doc]
    broken, mismatch, dups, private_links = [], [], [], []
    for d in docs:
        text = read(d)
        if text is None:
            continue
        seen, new_text = set(), text
        for label, href in links(text):
            if re.match(r"^[a-z]+:", href) or href.startswith("#"):
                continue
            exact, p = resolve(os.path.dirname(d), href)
            rel = relp(d, root)
            if p is None:
                broken.append((rel, label, href)); continue
            if is_private(p):
                private_links.append((rel, href))
            if exact != href:
                mismatch.append((rel, href, exact))
                if normalize:
                    new_text = new_text.replace(f"]({href})", f"]({exact})")
            key = os.path.normpath(p)
            if key in seen:
                dups.append((rel, label, href))
            seen.add(key)
            linked.setdefault(key, []).append(rel)
        if normalize and new_text != text:
            open(d, "w", encoding="utf-8").write(new_text)

    # Walk top folders and their direct children (depth 2). Never descend into private folders.
    index_mtime = min(os.path.getmtime(d) for d in docs)
    new_top, unlinked_children, recent, secrets, empty = [], {}, [], [], []
    for top in sorted(os.listdir(root)):
        tp = os.path.join(root, top)
        if top in SKIP_NAMES or top.startswith(".") or os.path.normpath(tp) in map(os.path.normpath, docs):
            continue
        if is_private(tp):
            continue
        if SECRET_RE.search(top):
            secrets.append(top); continue
        if os.path.normpath(tp) not in linked:
            new_top.append(top)
        if not os.path.isdir(tp):
            continue
        for child in sorted(os.listdir(tp)):
            if child.startswith(".") or child in SKIP_NAMES:
                continue
            cp = os.path.join(tp, child)
            rel = f"{top}/{child}"
            if is_private(cp):
                continue
            if SECRET_RE.search(child):
                secrets.append(rel); continue
            if os.path.isdir(cp) and not any(not n.startswith(".") for _, _, fs in os.walk(cp) for n in fs):
                empty.append(rel)
            if os.path.normpath(cp) not in linked:
                unlinked_children.setdefault(top, []).append(child)
            if os.path.getmtime(cp) > index_mtime:
                recent.append(rel)

    # A broken link whose basename now exists elsewhere is a move candidate.
    moves = []
    for rel, label, href in broken:
        base = nfc(unquote(re.split(r"[#?]", href)[0].rstrip("/").split("/")[-1]))
        hits, seen = [], {os.path.realpath(root)}
        # followlinks: src-* symlinks hold the originals. Each linked dir is entered once (realpath), so link cycles end.
        for dp, dn, fn in os.walk(root, followlinks=True):
            dn[:] = [n for n in dn if not is_private(os.path.join(dp, n))]   # never descend into private paths
            hits += [relp(os.path.join(dp, n), root) for n in dn + fn
                     if nfc(n) == base and not is_private(os.path.join(dp, n))]
            keep = []
            for n in dn:
                q = os.path.join(dp, n)
                if is_link(q):
                    rp = os.path.realpath(q)
                    if rp in seen:
                        continue
                    seen.add(rp)
                keep.append(n)
            dn[:] = keep
        moves.append((rel, href, hits))

    def section(title, rows):
        out(f"\n## {title} ({len(rows)})")
        for r in rows:
            out("- " + (r if isinstance(r, str) else " | ".join(map(str, r))))

    too_long, bad_names = [], []
    for d in docs:
        n = len((read(d) or "").splitlines())
        if n > MAX_LINES and d != rpath:
            too_long.append((relp(d, root), f"{n}줄"))
        name = os.path.splitext(os.path.basename(d))[0]
        if "--" in name:
            expected = nfc(name.rsplit("--", 1)[0] + ".md")
            if not any(nfc(os.path.basename(g)) == expected for g in docs):
                bad_names.append((relp(d, root), f"상위 색인 {expected}에 라우터에서 도달할 수 없음"))
        else:
            par = parent.get(d)
            if par and par != rpath:
                stem = nfc(os.path.splitext(os.path.basename(par))[0])
                bad_names.append((relp(d, root), f"{stem}--<주제>.md 형식이 아님"))
    # Index documents on disk that the router -> field index chain cannot reach
    orphans_sub, orphans_doc = [], []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if name.endswith(".md") and name not in SKIP_NAMES and os.path.isfile(p) and p not in docs:
            (orphans_sub if "--" in name else orphans_doc).append(name)
    # Paths written only as `code`: backticked text that is an existing path but is not linked in the same document
    code_only = []
    for d in docs:
        text = read(d) or ""
        targets = {os.path.normpath(resolve(os.path.dirname(d), h)[1] or "") for _, h in links(text)}
        for tok in re.findall(r"`([^`\n]+)`", text):
            cand = tok.strip().rstrip("/")
            if not cand or any(nfc(cand) == n or nfc(cand).startswith(n + "/") for n in private) or any(c in cand for c in "*<>|"):
                continue
            _, p = resolve(os.path.dirname(d), cand.replace(" ", "%20").replace(":", "%3A"))
            if p and os.path.normpath(p) not in targets and os.path.normpath(p) != os.path.normpath(d):
                code_only.append((relp(d, root), tok))
    section(f"{MAX_LINES}줄을 넘는 색인 (하위 색인으로 분할 필요) — 문서 | 줄 수", too_long)
    section("8000자를 넘는 라우터 (핵심 안내와 별도 장부 분리 권장)",
            [(ROUTER, f"{len(router)}자")] if len(router) > 8000 else [])
    section("연결되지 않은 하위 색인 (재사용 대상: 상위 색인에 다시 연결)", orphans_sub)
    section("라우터에서 닿지 않는 안내 문서 (분야 표에 연결하거나 보류)", orphans_doc)
    section("코드 표기로만 적힌 경로 (링크로 바꿔야 함) — 문서 | 표기", code_only)
    section("하위 색인 이름 규칙 위반 — 문서 | 이유", bad_names)
    section("새 최상위 항목 (라우터·안내에 링크 없음)", new_top)
    section("깨진 링크 (삭제 또는 이동) — 문서 | 링크 | 같은 이름 후보", [(r, h, ", ".join(c) or "후보 없음") for r, h, c in moves])
    section(f"색인 문서보다 최근에 바뀐 하위 항목 (기준 {time.strftime('%Y-%m-%d %H:%M', time.localtime(index_mtime))})", recent)
    section("빈 폴더", empty)
    section("비밀정보로 보이는 이름 (읽지 않음, 색인 금지)", secrets)
    section("비공개 경로를 가리키는 링크 (제거 필요)", private_links)
    section("같은 문서 안 중복 링크 — 문서 | 자료명 | 링크", dups)
    section("읽지 못한 색인 문서 (보류)", unreadable)
    section("유니코드/인코딩 불일치 링크 — 문서 | 현재 | 디스크 기준" + (" (자동 수정함)" if normalize else ""), mismatch)
    out(f"\n## 링크 없는 하위 항목 (폴더별 개수, 의도적으로 생략된 것일 수 있음)")
    for top, kids in unlinked_children.items():
        out(f"- {top}: {len(kids)}개")
    total = sum(len(v) for v in linked.values())
    out(f"\n## 요약\n유효 링크 {total}, 깨진 링크 {len(broken)}, 새 최상위 {len(new_top)}, 최근 변경 {len(recent)}, 중복 {len(dups)}, 비공개 링크 {len(private_links)}")
    out("점검 범위: 최상위와 그 바로 아래 항목의 이름·메타데이터. 더 깊은 하위 항목과 파일 내용은 점검하지 않음.")
    out(f"색인 문서 {len(docs) - 1}개 (하위 색인 포함), {MAX_LINES}줄 초과 {len(too_long)}개, 연결 안 된 문서 {len(orphans_sub) + len(orphans_doc)}개, 코드 표기 경로 {len(code_only)}개")
    return 1 if broken or private_links or unreadable else 0


def selftest():
    assert all(SECRET_RE.search(name) for name in ["env", "env.txt", "hermes_env.txt", "mykey.txt", "keys.txt", "local.env", "cert.p12"])
    assert not SECRET_RE.search("nearby-keyword.ts") and not SECRET_RE.search("slides.key")
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".secondbrain"))
        ledger = os.path.join(t, ".secondbrain", "private-paths.txt")
        router = "- 비공개: `legacy`\n- 비공개 장부: .secondbrain/private-paths.txt\n"
        assert load_private_paths(t, "- 비공개: `legacy`\n") == {"legacy"}
        try:
            load_private_paths(t, router)
        except FileNotFoundError:
            pass
        else:
            raise AssertionError("missing ledger must abort")
        open(ledger, "w", encoding="utf-8").write("\ufeff# comment\r\nsrc-x/비밀/\r\nnot-created-yet\nsrc-x/[token]\n")
        assert load_private_paths(t, router) == {"legacy", "src-x/비밀", "not-created-yet", "src-x/[token]"}
        for malformed in ["# Router\n", "- **비공개 장부:** .secondbrain/private-paths.txt\n"]:
            try:
                load_private_paths(t, malformed)
            except ValueError:
                pass
            else:
                raise AssertionError("missing or malformed marker must abort")
        os.remove(ledger)
        try:
            load_private_paths(t, "- **비공개 장부:** .secondbrain/private-paths.txt\n")
        except ValueError:
            pass
        else:
            raise AssertionError("malformed marker without ledger must abort")
        for invalid in ["/", "/outside", "../outside", "a/../b", "C:/outside", "a\\b", "a/*", "a//b"]:
            open(ledger, "w", encoding="utf-8").write(invalid)
            try:
                load_private_paths(t, router)
            except ValueError:
                pass
            else:
                raise AssertionError("invalid ledger path accepted")
        open(ledger, "wb").write(b"\xff")
        try:
            load_private_paths(t, router)
        except UnicodeDecodeError:
            pass
        else:
            raise AssertionError("invalid ledger encoding accepted")
        open(ledger, "w", encoding="utf-8").write("src-x/hidden\n")
        os.makedirs(os.path.join(t, "src-x", "hidden"))
        open(os.path.join(t, "src-x", "hidden", "note.md"), "w").write("private source")
        open(os.path.join(t, ROUTER), "w", encoding="utf-8").write(router + "[card](project.md) [guide](g.md)\n")
        open(os.path.join(t, "project.md"), "w", encoding="utf-8").write("[deep](g--topic.md)\n")
        open(os.path.join(t, "g.md"), "w", encoding="utf-8").write("[topic](g--topic.md)\n")
        open(os.path.join(t, "g--topic.md"), "w", encoding="utf-8").write("`src-x/hidden/note.md`\n")
        lines = []; run(t, out=lines.append)
        report = "\n".join(lines)
        assert "하위 색인 이름 규칙 위반 — 문서 | 이유 (0)" in report, report
        assert "코드 표기로만 적힌 경로 (링크로 바꿔야 함) — 문서 | 표기 (0)" in report, report
        assert "src-x/hidden" not in report, report
        with open(os.path.join(t, "project.md"), "a", encoding="utf-8") as f:
            f.write("[blocked](src-x/hidden/note.md)\n")
        lines.clear(); run(t, out=lines.append)
        assert "비공개 경로를 가리키는 링크 (제거 필요) (1)" in "\n".join(lines)
        os.remove(ledger)
        lines.clear(); assert run(t, out=lines.append) == 2
        assert len(lines) == 1 and lines[0].startswith("ERROR: 비공개 목록/장부 확인 실패"), lines
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "A 폴더", "sub"))
        os.makedirs(os.path.join(t, "비밀함"))
        os.makedirs(os.path.join(t, "New"))
        open(os.path.join(t, "A 폴더", "sub", "f.txt"), "w").close()
        open(os.path.join(t, "A 폴더", "api_token.txt"), "w").close()
        open(os.path.join(t, ROUTER), "w", encoding="utf-8").write(
            "| a | [g.md](g.md) | [A](A%20폴더/) |\n- **비공개:** `비밀함` 읽지 않음\n")
        open(os.path.join(t, "g.md"), "w", encoding="utf-8").write(
            "[sub](A%20폴더/sub/) [sub again](A%20폴더/sub/) [gone](A%20폴더/old.txt) `[code](nope)`\n")
        lines = []
        rc = run(t, normalize=True, out=lines.append)
        rep = "\n".join(lines)
        assert rc == 1, rc                                   # broken link present
        assert "- New" in rep, rep                           # new top folder detected
        assert "비밀함" not in rep.split("비공개(읽지 않음)")[1].split("\n", 1)[1], rep  # private never walked
        assert "api_token.txt" in rep                        # secret-looking name flagged, not indexed
        assert "깨진 링크 (삭제 또는 이동) — 문서 | 링크 | 같은 이름 후보 (1)" in rep, rep
        assert "중복 링크 — 문서 | 자료명 | 링크 (1)" in rep, rep
        assert "nope" not in rep                             # code spans ignored
        # sub-index discovery, 100-line rule and naming rule
        open(os.path.join(t, "g--topic.md"), "w", encoding="utf-8").write("\n".join(["[up](g.md)"] + ["x"] * 120))
        open(os.path.join(t, "wrongname.md"), "w", encoding="utf-8").write("[up](g.md)\n")
        with open(os.path.join(t, "g.md"), "a", encoding="utf-8") as f:
            f.write("[sub](g--topic.md) [bad](wrongname.md)\n")
        lines.clear(); run(t, out=lines.append)
        rep2 = "\n".join(lines)
        assert "g--topic.md | 121줄" in rep2, rep2
        assert "wrongname.md | g--<주제>.md 형식이 아님" in rep2, rep2
        assert "문서: CLAUDE.md, g.md, g--topic.md, wrongname.md" in rep2, rep2
        # unlinked sub-index / guide, and a path written only as code
        open(os.path.join(t, "g--old.md"), "w", encoding="utf-8").write("[up](g.md)\n")
        open(os.path.join(t, "stray.md"), "w", encoding="utf-8").write("x\n")
        with open(os.path.join(t, "g.md"), "a", encoding="utf-8") as f:
            f.write("see `New` and `A 폴더/sub` and `비밀함`\n")
        lines.clear(); run(t, out=lines.append)
        rep3 = "\n".join(lines)
        assert "연결되지 않은 하위 색인 (재사용 대상: 상위 색인에 다시 연결) (1)\n- g--old.md" in rep3, rep3
        assert "라우터에서 닿지 않는 안내 문서 (분야 표에 연결하거나 보류) (1)\n- stray.md" in rep3, rep3
        assert "- g.md | New" in rep3 and "A 폴더/sub" not in rep3.split("코드 표기로만")[1].split("##")[0], rep3   # linked path is fine
        assert "비밀함" not in rep3.split("코드 표기로만")[1].split("##")[0]                                        # private names stay as text
        lines.clear(); run(t, normalize=True, out=lines.append)
        assert "불일치 링크" in "\n".join(lines) and "(0)" in [l for l in lines if "불일치" in l][0]  # idempotent
    with tempfile.TemporaryDirectory() as t:
        # MOC links a source note; the note must not be read or rewritten.
        os.makedirs(os.path.join(t, "work", "private", "deep"))
        os.makedirs(os.path.join(t, "work", "proj"))
        note = os.path.join(t, "work", "proj", "deploy.md")
        open(note, "w", encoding="utf-8").write("[x](../%E1%84%8B.md)\n")       # would be "fixed" if treated as an index
        open(os.path.join(t, "work", "private", "deep", "gone.md"), "w").close()
        open(os.path.join(t, "api_token.md"), "w").write("[s](work/)\n")
        open(os.path.join(t, ROUTER), "w", encoding="utf-8").write(
            "[배포](moc-배포.md) [tok](api_token.md)\n- 비공개: `work/private`\n")
        open(os.path.join(t, "moc-배포.md"), "w", encoding="utf-8").write(
            "[d](work/proj/deploy.md#절차) [p](work/private/deep/) [gone](old/gone.md)\n")
        before = open(note, encoding="utf-8").read()
        lines = []
        run(t, normalize=True, out=lines.append)
        rep = "\n".join(lines)
        assert open(note, encoding="utf-8").read() == before, "source note rewritten"
        assert "문서: CLAUDE.md, moc-배포.md\n" in rep, rep                       # note and secret not treated as index
        assert "moc-배포.md | work/private/deep/" in rep, rep                    # nested private path flagged
        assert "deploy.md#절차" not in rep.split("깨진 링크")[1].split("##")[0], rep   # fragment link is valid
        assert "old/gone.md | 후보 없음" in rep, rep                              # private dir not searched for moves
        # one unreadable index does not stop the run
        open(os.path.join(t, "moc-x.md"), "wb").write(b"\xff\xfe\x00bad")
        with open(os.path.join(t, ROUTER), "a", encoding="utf-8") as f:
            f.write("[x](moc-x.md)\n")
        lines.clear(); rc = run(t, out=lines.append)
        assert rc == 1 and "읽지 못한 색인 문서 (보류) (1)\n- moc-x.md" in "\n".join(lines), "\n".join(lines)
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as ext:
        # src-* symlink folder: contents detected, private subpath skipped, move candidates found, cycles end.
        os.makedirs(os.path.join(ext, "proj")); os.makedirs(os.path.join(ext, "개인")); os.makedirs(os.path.join(ext, "deep"))
        for f in ("proj/a.txt", "개인/id.txt", "개인/moved.md", "deep/moved.md"):
            open(os.path.join(ext, f), "w").close()
        try:
            os.symlink(ext, os.path.join(ext, "deep", "loop"), target_is_directory=True)   # cycle back to the link target
        except OSError:   # Windows without Developer Mode cannot create symlinks
            print("selftest ok (symlink cases skipped: no permission)"); return
        os.symlink(ext, os.path.join(t, "src-x"), target_is_directory=True)
        open(os.path.join(t, ROUTER), "w", encoding="utf-8").write(
            "[g](g.md)\n- 비공개: `src-x/개인`\n")
        open(os.path.join(t, "g.md"), "w", encoding="utf-8").write("[m](old/moved.md)\n")
        lines = []
        run(t, out=lines.append)
        rep = "\n".join(lines)
        assert "새 최상위 항목 (라우터·안내에 링크 없음) (1)\n- src-x" in rep, rep       # link seen as a top item
        assert "- src-x: 2개" in rep, rep                                           # proj, deep; private 개인 excluded
        assert "old/moved.md | src-x/deep/moved.md\n" in rep, rep
        # an INDEX.md inside a linked original is source material, never an index document
        open(os.path.join(ext, "proj", "INDEX.md"), "w", encoding="utf-8").write("[x](../%E1%84%8B.md)\n")
        with open(os.path.join(t, "g.md"), "a", encoding="utf-8") as f:
            f.write("[idx](src-x/proj/INDEX.md)\n")
        lines.clear(); run(t, normalize=True, out=lines.append)
        assert "src-x/proj/INDEX.md" not in "\n".join(lines).split("문서:")[1].split("\n")[0], lines
        assert open(os.path.join(ext, "proj", "INDEX.md"), encoding="utf-8").read() == "[x](../%E1%84%8B.md)\n"                   # exactly one candidate, private copy skipped
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest(); sys.exit(0)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__); sys.exit(2)
    sys.exit(run(args[0], normalize="--normalize" in sys.argv))
