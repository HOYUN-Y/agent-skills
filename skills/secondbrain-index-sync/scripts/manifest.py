"""Build per-source manifests of .md/.txt files: path | title | first lines.
Skips private paths (router 비공개 lines), secret-looking names, dependency/cache dirs.
Output holds excerpts of personal documents: keep <out_dir> outside the vault and delete it after use.
Usage: python3 -I manifest.py <vault> <out_dir>
"""
import os, re, sys, unicodedata, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from private_paths import load_private_paths, SECRET_RE as SECRET

nfc = lambda s: unicodedata.normalize("NFC", s)
SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "site-packages", "__pycache__", ".conda", "staticfiles", ".next", "dist", "build", ".changelog-backups"}
EXCERPT = 240


def excerpt(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(4000)
    except OSError as e:
        return None, f"(읽기 실패: {e.__class__.__name__})"
    lines = [l.strip() for l in text.splitlines() if l.strip() and not l.strip().startswith(("---", "```"))]
    title = next((l.lstrip("# ").strip() for l in lines if l.startswith("#")), lines[0] if lines else "(빈 파일)")
    body = " ".join(l for l in lines if l.lstrip("# ").strip() != title)[:EXCERPT]
    return title[:120], body


def main(vault, out_dir):
    router = open(os.path.join(vault, "CLAUDE.md"), encoding="utf-8").read()
    private = load_private_paths(vault, router)
    is_private = lambda rel: any(rel == n or rel.startswith(n + "/") for n in private)
    os.makedirs(out_dir, exist_ok=True)
    for src in sorted(n for n in os.listdir(vault) if n.startswith("src-")):
        rows = []
        for dp, dn, fn in os.walk(os.path.join(vault, src), followlinks=True):
            rel_dp = nfc(os.path.relpath(dp, vault)).replace(os.sep, "/")
            dn[:] = sorted(d for d in dn if d not in SKIP_DIRS and not SECRET.search(d) and not d.startswith(".") and not d.startswith("eclipse")
                           and not is_private(f"{rel_dp}/{nfc(d)}"))
            for f in sorted(fn):
                rel = f"{rel_dp}/{nfc(f)}"
                if not f.lower().endswith((".md", ".txt")) or f.startswith(("~$", ".")) or SECRET.search(f) or is_private(rel):
                    continue
                title, body = excerpt(os.path.join(dp, f))
                rows.append(f"{rel} | {title} | {body}")
        with open(os.path.join(out_dir, f"{src}.txt"), "w", encoding="utf-8") as out:
            out.write("\n".join(rows) + "\n")
        print(src, len(rows), "files")


def selftest():
    assert SECRET.search(".env") and SECRET.search("api keys.txt") and not SECRET.search("notes.md")
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "src-a", "hidden"))
        os.makedirs(os.path.join(t, ".secondbrain"))
        open(os.path.join(t, "CLAUDE.md"), "w", encoding="utf-8").write("- 비공개 장부: .secondbrain/private-paths.txt\n")
        open(os.path.join(t, ".secondbrain", "private-paths.txt"), "w", encoding="utf-8").write("src-a/hidden\n")
        open(os.path.join(t, "src-a", "hidden", "note.md"), "w", encoding="utf-8").write("never excerpt this")
        open(os.path.join(t, "src-a", "note.md"), "w", encoding="utf-8").write("# Safe note")
        main(t, os.path.join(t, "out"))
        result = open(os.path.join(t, "out", "src-a.txt"), encoding="utf-8").read()
        assert "Safe note" in result and "hidden" not in result and "never excerpt" not in result
        os.remove(os.path.join(t, ".secondbrain", "private-paths.txt"))
        try:
            main(t, os.path.join(t, "missing-out"))
        except FileNotFoundError:
            pass
        else:
            raise AssertionError("missing ledger must abort")
        assert not os.path.exists(os.path.join(t, "missing-out"))
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest(); sys.exit(0)
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
