"""Merge <work>/topics-*.tsv into DRAFT <index>--<topic>.md files (one line per folder, chronological).
Never writes the vault: drafts go to <out>, then merge them into the vault's <index>--*.md by hand/AI
so links added manually to existing topic indexes are kept.
TSV columns: 폴더<TAB>주제(;구분)<TAB>핵심문서(볼트 기준 경로, ;구분)<TAB>한 줄 설명
The topic map lives in the vault (<vault>/.secondbrain/topics.json, see templates/topics.example.json).
Unknown topics go to <index>--미분류.md and are reported.
Usage: python3 -I build_topics.py <topics.json> <work_dir> <out_dir>
       python3 -I build_topics.py --selftest
"""
import glob, json, os, re, sys, collections, tempfile


def href(path):
    return "/".join(s.replace("%", "%25").replace(" ", "%20").replace("(", "%28").replace(")", "%29")
                    .replace("#", "%23").replace("?", "%3F") for s in path.split("/"))


def date_key(folder):
    m = re.search(r"(\d{6})", folder)
    return m.group(1) if m else "000000"   # non-dated folders first


def build(cfg, work, out):
    src, index, index_title = cfg["source"], cfg["index"], cfg["index_title"]
    topics = {k: (v["title"], v["blurb"]) for k, v in cfg["topics"].items()}
    topics["미분류"] = ("미분류", "주제 매핑(alias)에 없는 주제로 분류된 폴더. 매핑을 추가한 뒤 다시 만든다")
    alias = {**{k: k for k in cfg["topics"]}, **cfg.get("alias", {})}
    os.makedirs(out, exist_ok=True)

    def folder_of(raw):
        raw = raw.strip()
        if raw.startswith("(") or raw in ("", src):
            return src
        return raw if raw.startswith(src + "/") else f"{src}/{raw}"

    seen_docs = collections.defaultdict(set)
    merged = collections.defaultdict(dict)
    unknown = collections.Counter()
    for tsv in sorted(glob.glob(os.path.join(work, "topics-*.tsv"))):
        for i, line in enumerate(open(tsv, encoding="utf-8").read().splitlines()):
            f = line.split("\t")
            if i == 0 or len(f) != 4:
                continue
            folder, desc = folder_of(f[0]), f[3].strip()
            names = [t.strip() for t in f[1].split(";") if t.strip()]
            unknown.update(t for t in names if t not in alias)
            doc_list = [d.strip() for d in f[2].split(";") if d.strip()]
            name = f"{src} 최상위" if folder == src else folder.split("/", 1)[1]
            for s in {alias.get(t, "미분류") for t in names}:
                fresh = [d for d in doc_list if d not in seen_docs[s]]   # a doc is linked once per topic file
                seen_docs[s].update(fresh)
                links = ", ".join(f"[{os.path.splitext(os.path.basename(d))[0]}]({href(d)})" for d in fresh)
                slot = merged[s].setdefault(folder, [date_key(folder), name, [], []])   # one line per folder
                slot[2].append(desc); slot[3] += [links] if links else []

    summary = []
    for slug, (title, blurb) in topics.items():
        rows = sorted({(dk, f"- [{name}]({href(folder)}/): {' / '.join(descs)}" + (f" · 문서: {', '.join(links)}" if links else ""))
                       for folder, (dk, name, descs, links) in merged.get(slug, {}).items()})
        if not rows:
            continue
        body = [f"# {index_title} -- {title}", "", f"[← {index_title}]({index}.md)", "",
                f"{blurb}. {src} 폴더 중 이 주제를 다룬 곳을 날짜순으로 모았다. 한 폴더가 여러 주제에 함께 실릴 수 있다. "
                "설명은 문서 제목·앞부분 기준이며 '(추정)'은 제목만으로 판단한 것이다.", ""]
        month = None
        for dk, text in rows:
            m = "날짜 없는 폴더·최상위" if dk == "000000" else f"20{dk[:2]}-{dk[2:4]}"
            if m != month:
                body += ["", f"## {m}", ""]; month = m
            body.append(text)
        path = os.path.join(out, f"{index}--{slug}.md")
        text = "\n".join(body).replace("\n\n\n", "\n\n") + "\n"
        open(path, "w", encoding="utf-8").write(text)
        summary.append((slug, title, len(rows), text.count("\n")))
    return summary, unknown


def selftest():
    cfg = {"source": "src-log", "index": "work", "index_title": "업무 색인",
           "topics": {"배포": {"title": "배포", "blurb": "배포 작업"}}, "alias": {"배포·인프라": "배포"}}
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "topics-A.tsv"), "w", encoding="utf-8").write(
            "폴더\t주제\t문서\t설명\n240105\t배포·인프라;새주제\tsrc-log/240105/a.md\t첫 배포\n240105\t배포\tsrc-log/240105/a.md\t재배포\n")
        summary, unknown = build(cfg, d, os.path.join(d, "out"))
        body = open(os.path.join(d, "out", "work--배포.md"), encoding="utf-8").read()
        assert body.count("[240105](src-log/240105/)") == 1 and body.count("(src-log/240105/a.md)") == 1, body
        assert "## 2024-01" in body and "첫 배포 / 재배포" in body, body
        assert unknown == {"새주제": 1} and os.path.exists(os.path.join(d, "out", "work--미분류.md"))
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest(); sys.exit(0)
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    summary, unknown = build(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2], sys.argv[3])
    for s in summary:
        print(*s, sep=" | ")
    if unknown:
        print("매핑 없는 주제 (topics.json alias에 추가 필요):", dict(unknown))
    assert all(n <= 100 for *_, n in summary), "a topic index exceeds 100 lines"
