"""Extract leading text of PDF/DOCX/DOC/PPTX/XLSX under src-* into per-source manifests.
Same skip rules as manifest.py (private paths, secret names, dependency dirs).
Files whose text looks like it holds a resident ID or a password are listed in sensitive.txt
and their excerpt is NOT written.
Output holds excerpts of personal documents: keep <out_dir> outside the vault and delete it after use.
Tools: PDF needs `pdftotext` (poppler, any OS). DOCX/ODT/PPTX/XLSX are read with zipfile (any OS).
DOC/RTF need macOS `textutil`; elsewhere they go to failed.txt.
Usage: python3 -I doc_manifest.py <vault> <out_dir>
       python3 -I doc_manifest.py --selftest
"""
import os, re, sys, shutil, subprocess, tempfile, unicodedata, zipfile, html

nfc = lambda s: unicodedata.normalize("NFC", s)
SECRET = re.compile(r"(^\.env|\.pem$|\.ppk$|^id_(rsa|ed25519|ecdsa)|token|secret|credential|password|비밀번호|api[ _-]?keys?\b|\.netrc$)", re.I)
SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "site-packages", "__pycache__", ".conda", "staticfiles", ".next", "dist", "build", ".changelog-backups"}
EXTS = (".pdf", ".docx", ".doc", ".rtf", ".odt", ".pptx", ".xlsx")
SENSITIVE = re.compile(r"(\d{6}\s?-\s?[1-4]\d{6}|(비밀번호|비번|password|passwd|pw)\s*[:=：]\s*\S|주민등록번호)", re.I)
EXCERPT, TIMEOUT = 400, 90


def xml_text(path, members_re, tag_re):
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.match(members_re, n))
        return " ".join(html.unescape(t) for n in names for t in re.findall(tag_re, z.read(n).decode("utf-8", "replace")))


def run_tool(cmd, path):
    if not shutil.which(cmd[0]):
        raise FileNotFoundError(f"{cmd[0]} 없음")
    return subprocess.run(cmd + [path] + (["-"] if cmd[0] == "pdftotext" else []),
                          capture_output=True, timeout=TIMEOUT).stdout.decode("utf-8", "replace")


def extract(path):
    low = path.lower()
    if low.endswith(".pdf"):
        return run_tool(["pdftotext", "-l", "3", "-q"], path)
    if low.endswith(".docx"):
        return xml_text(path, r"word/document\.xml$", r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>")
    if low.endswith(".odt"):
        return re.sub(r"<[^>]+>", " ", xml_text(path, r"content\.xml$", r"(<text:[ph]\b.*?</text:[ph]>)"))
    if low.endswith(".pptx"):
        return xml_text(path, r"ppt/slides/slide\d+\.xml$", r"<a:t>([^<]*)</a:t>")
    if low.endswith(".xlsx"):
        return xml_text(path, r"xl/sharedStrings\.xml$", r"<t[^>]*>([^<]*)</t>")
    return run_tool(["textutil", "-convert", "txt", "-stdout"], path)   # .doc / .rtf


def main(vault, out_dir):
    router = open(os.path.join(vault, "CLAUDE.md"), encoding="utf-8").read()
    private = {nfc(n).rstrip("/") for line in router.splitlines() if "비공개" in line for n in re.findall(r"`([^`]+)`", line)}
    is_private = lambda rel: any(rel == n or rel.startswith(n + "/") for n in private)
    os.makedirs(out_dir, exist_ok=True)
    sensitive, failed = [], []
    for src in sorted(n for n in os.listdir(vault) if n.startswith("src-")):
        rows = []
        for dp, dn, fn in os.walk(os.path.join(vault, src), followlinks=True):
            rel_dp = nfc(os.path.relpath(dp, vault)).replace(os.sep, "/")
            dn[:] = sorted(d for d in dn if d not in SKIP_DIRS and not d.startswith(".") and not d.startswith("eclipse")
                           and not is_private(f"{rel_dp}/{nfc(d)}"))
            for f in sorted(fn):
                rel = f"{rel_dp}/{nfc(f)}"
                if not f.lower().endswith(EXTS) or f.startswith(("~$", ".")) or SECRET.search(f) or is_private(rel):
                    continue
                try:
                    text = re.sub(r"\s+", " ", extract(os.path.join(dp, f))).strip()
                except Exception as e:   # timeout, broken zip, missing tool or download …
                    failed.append(f"{rel} | {e.__class__.__name__}: {e}"[:300]); continue
                if SENSITIVE.search(text):
                    sensitive.append(rel); continue
                rows.append(f"{rel} | {text[:EXCERPT] or '(텍스트 없음: 스캔 이미지일 수 있음)'}")
        with open(os.path.join(out_dir, f"{src}.docs.txt"), "w", encoding="utf-8") as out:
            out.write("\n".join(rows) + "\n")
        print(src, len(rows), "docs", flush=True)
    open(os.path.join(out_dir, "sensitive.txt"), "w", encoding="utf-8").write("\n".join(sensitive) + "\n")
    open(os.path.join(out_dir, "failed.txt"), "w", encoding="utf-8").write("\n".join(failed) + "\n")
    print("sensitive", len(sensitive), "failed", len(failed))


def selftest():
    assert SENSITIVE.search("주민등록번호 900101-1234567") and SENSITIVE.search("PW: abc") and not SENSITIVE.search("password_change_form")
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "src-a", "비밀"))
        with zipfile.ZipFile(os.path.join(t, "src-a", "plan.docx"), "w") as z:
            z.writestr("word/document.xml", '<w:p><w:r><w:t>배포 계획</w:t></w:r><w:r><w:t xml:space="preserve"> 1차 &amp; 2차</w:t></w:r></w:p>')
        with zipfile.ZipFile(os.path.join(t, "src-a", "note.odt"), "w") as z:
            z.writestr("content.xml", "<office:text><text:p>운영 <text:span>메모</text:span></text:p></office:text>")
        with zipfile.ZipFile(os.path.join(t, "src-a", "id.docx"), "w") as z:
            z.writestr("word/document.xml", "<w:t>주민등록번호</w:t>")
        with zipfile.ZipFile(os.path.join(t, "src-a", "비밀", "x.docx"), "w") as z:
            z.writestr("word/document.xml", "<w:t>hidden</w:t>")
        open(os.path.join(t, "CLAUDE.md"), "w", encoding="utf-8").write("- 비공개: `src-a/비밀`\n")
        main(t, os.path.join(t, "out"))
        docs = open(os.path.join(t, "out", "src-a.docs.txt"), encoding="utf-8").read()
        assert "src-a/plan.docx | 배포 계획 1차 & 2차" in docs and "src-a/note.odt | 운영 메모" in docs, docs
        assert "hidden" not in docs and "id.docx" not in docs, docs
        assert open(os.path.join(t, "out", "sensitive.txt"), encoding="utf-8").read() == "src-a/id.docx\n"
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest(); sys.exit(0)
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
