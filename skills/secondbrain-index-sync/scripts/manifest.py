"""Build per-source manifests of .md/.txt files: path | title | first lines.
Skips private paths (router 비공개 lines), secret-looking names, dependency/cache dirs.
Output holds excerpts of personal documents: keep <out_dir> outside the vault and delete it after use.
Usage: python3 -I manifest.py <vault> <out_dir>
"""
import os, re, sys, unicodedata

vault, out_dir = sys.argv[1], sys.argv[2]
nfc = lambda s: unicodedata.normalize("NFC", s)
router = open(os.path.join(vault, "CLAUDE.md"), encoding="utf-8").read()
private = {nfc(n).rstrip("/") for line in router.splitlines() if "비공개" in line for n in re.findall(r"`([^`]+)`", line)}
SECRET = re.compile(r"(^\.env|\.pem$|\.ppk$|^id_(rsa|ed25519|ecdsa)|token|secret|credential|password|비밀번호|api[ _-]?keys?\b|\.netrc$)", re.I)
SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "site-packages", "__pycache__", ".conda", "staticfiles", ".next", "dist", "build", ".changelog-backups"}
EXCERPT = 240


def is_private(rel):
    return any(rel == n or rel.startswith(n + "/") for n in private)


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


os.makedirs(out_dir, exist_ok=True)
for src in sorted(n for n in os.listdir(vault) if n.startswith("src-")):
    rows = []
    for dp, dn, fn in os.walk(os.path.join(vault, src), followlinks=True):
        rel_dp = nfc(os.path.relpath(dp, vault)).replace(os.sep, "/")
        dn[:] = sorted(d for d in dn if d not in SKIP_DIRS and not d.startswith(".") and not d.startswith("eclipse")
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

# self-check: private and secret filters
assert is_private("src-career/개인정보:인증서/x.pdf") if "src-career/개인정보:인증서" in private else True
assert SECRET.search(".env") and SECRET.search("api keys.txt") and not SECRET.search("notes.md")
