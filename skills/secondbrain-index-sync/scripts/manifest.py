"""Build per-source manifests of .md/.txt files: path | title | first lines.
Skips private paths (router 비공개 lines and the ledger, including aliases), secret-looking names,
names that look like personal data, dependency/cache dirs, and links inside sources (shared rules: sources.py).
Text that looks like a resident ID or a password is never excerpted: the path goes to sensitive-text.txt.
Output holds excerpts of personal documents: keep <out_dir> outside the vault and delete it after use.
Usage: python3 -I manifest.py <vault> <out_dir>
       python3 -I manifest.py <vault> <out_dir> --paths <list>   # only these vault paths (inventory.py --review-out)
       python3 -I manifest.py --selftest
"""
import os, sys, tempfile
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources import Policy, SENSITIVE_RE, out_file, read_paths

EXTS = (".md", ".txt")
EXCERPT = 240


def excerpt(path):
    """(title, body, sensitive). Only the first 4000 characters are read and checked."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(4000)
    except OSError as e:
        return None, f"(읽기 실패: {e.__class__.__name__})", False
    if SENSITIVE_RE.search(text):
        return None, None, True
    lines = [l.strip() for l in text.splitlines() if l.strip() and not l.strip().startswith(("---", "```"))]
    title = next((l.lstrip("# ").strip() for l in lines if l.startswith("#")), lines[0] if lines else "(빈 파일)")
    body = " ".join(l for l in lines if l.lstrip("# ").strip() != title)[:EXCERPT]
    return title[:120], body, False


def targets(policy, exts, paths=None, src_only=True):
    """{top: [(rel, abs)]} from a full walk, or from an explicit path list checked with the same rules."""
    by_top, skipped = defaultdict(list), Counter()
    if paths is None:
        tops, skipped = policy.tops(src_only=src_only)
        for top in tops:
            w = policy.walk(top)
            skipped.update(w["skipped"])
            if w["status"] != "complete":
                skipped[f"source_{w['status']}"] += 1
            by_top[top]   # an empty source still gets its (empty) manifest
            for rel in sorted(w["files"]):
                if rel.lower().endswith(exts):
                    by_top[top].append((rel, os.path.join(policy.vault, *rel.split("/"))))
    else:
        for row in paths:
            p, reason = policy.check_rel(row[0])
            if reason:
                skipped[reason] += 1
            elif not row[0].lower().endswith(exts):
                skipped["other_format"] += 1
            else:
                by_top[row[0].split("/")[0]].append((row[0], p))
    return by_top, skipped


def main(vault, out_dir, paths_file=None):
    router = open(os.path.join(vault, "CLAUDE.md"), encoding="utf-8").read()
    policy = Policy(vault, router)   # missing/invalid ledger aborts before any traversal
    policy.check_out(out_dir)        # excerpts never land inside the vault or a source
    by_top, skipped = targets(policy, EXTS, read_paths(paths_file) if paths_file else None)
    os.makedirs(out_dir, exist_ok=True)
    sensitive = []
    for top, files in sorted(by_top.items()):
        rows = []
        for rel, p in files:
            title, body, hit = excerpt(p)
            if hit:
                sensitive.append(rel); continue
            rows.append(f"{rel} | {title} | {body}")
        with open(out_file(out_dir, f"{top}.txt"), "w", encoding="utf-8") as out:
            out.write("\n".join(rows) + "\n")
        print(top, len(rows), "files")
    with open(out_file(out_dir, "sensitive-text.txt"), "w", encoding="utf-8") as out:
        out.write("\n".join(sensitive) + "\n")
    print("sensitive", len(sensitive), "| 제외:", ", ".join(f"{k} {v}" for k, v in sorted(skipped.items())) or "없음")


def selftest():
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as o:
        os.makedirs(os.path.join(t, "src-a", "hidden"))
        os.makedirs(os.path.join(t, ".secondbrain"))
        open(os.path.join(t, "CLAUDE.md"), "w", encoding="utf-8").write("- 비공개 장부: .secondbrain/private-paths.txt\n")
        open(os.path.join(t, ".secondbrain", "private-paths.txt"), "w", encoding="utf-8").write("src-a/hidden\n")
        open(os.path.join(t, "src-a", "hidden", "note.md"), "w", encoding="utf-8").write("never excerpt this")
        open(os.path.join(t, "src-a", "note.md"), "w", encoding="utf-8").write("# Safe note")
        open(os.path.join(t, "src-a", "acct.md"), "w", encoding="utf-8").write("# 계정\npassword: hunter2\n")
        open(os.path.join(t, "src-a", "홍길동 010-1234-5678.txt"), "w", encoding="utf-8").write("연락처")
        main(t, os.path.join(o, "out"))
        result = open(os.path.join(o, "out", "src-a.txt"), encoding="utf-8").read()
        assert "Safe note" in result and "hidden" not in result and "never excerpt" not in result, result
        assert "hunter2" not in result and "acct.md" not in result, result               # sensitive text withheld
        assert "010-1234" not in result, result                                          # PII-looking name withheld
        assert open(os.path.join(o, "out", "sensitive-text.txt"), encoding="utf-8").read() == "src-a/acct.md\n"
        # an explicit list is checked with the same rules, and only listed files are read
        lst = os.path.join(o, "list.tsv")
        open(lst, "w", encoding="utf-8").write("src-a/note.md\t1\t2\nsrc-a/hidden/note.md\t1\t2\nsrc-a/../x.md\nsrc-a/a.pdf\n")
        main(t, os.path.join(o, "out2"), lst)
        result = open(os.path.join(o, "out2", "src-a.txt"), encoding="utf-8").read()
        assert result.startswith("src-a/note.md | Safe note") and "acct" not in result and "hidden" not in result, result
        # output inside the vault or a source, or through a planted link, is refused before writing
        for bad in (os.path.join(t, "out"), os.path.join(t, "src-a")):
            try:
                main(t, bad)
            except ValueError:
                pass
            else:
                raise AssertionError("excerpt output inside the vault accepted")
        assert sorted(os.listdir(os.path.join(t, "src-a"))) == ["acct.md", "hidden", "note.md", "홍길동 010-1234-5678.txt"]
        if os.name != "nt":
            os.remove(os.path.join(o, "out", "src-a.txt"))
            os.symlink(os.path.join(t, "src-a", "note.md"), os.path.join(o, "out", "src-a.txt"))
            try:
                main(t, os.path.join(o, "out"))
            except ValueError:
                pass
            else:
                raise AssertionError("output written through a link")
            assert open(os.path.join(t, "src-a", "note.md"), encoding="utf-8").read() == "# Safe note"
            original = os.path.join(o, "Original")
            os.mkdir(original)
            open(os.path.join(original, "note.md"), "w", encoding="utf-8").write("original fixture")
            os.symlink(original, os.path.join(t, "src-external"), target_is_directory=True)
            try:
                main(t, os.path.join(o, "original"))
            except ValueError:
                pass
            else:
                raise AssertionError("case-variant output path inside an original source accepted")
            assert os.listdir(original) == ["note.md"]
        os.remove(os.path.join(t, ".secondbrain", "private-paths.txt"))
        try:
            main(t, os.path.join(o, "missing-out"))
        except FileNotFoundError:
            pass
        else:
            raise AssertionError("missing ledger must abort")
        assert not os.path.exists(os.path.join(o, "missing-out"))
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest(); sys.exit(0)
    args = sys.argv[1:]
    if len(args) == 4 and args[2] == "--paths":
        main(args[0], args[1], args[3])
    elif len(args) == 2:
        main(*args)
    else:
        sys.exit(__doc__)
