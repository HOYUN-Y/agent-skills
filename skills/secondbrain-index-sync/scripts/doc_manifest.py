"""Extract leading text of PDF/DOCX/DOC/PPTX/XLSX under src-* into per-source manifests.
Same skip rules as manifest.py (sources.py: private paths and aliases, secret names, PII-looking names,
dependency dirs, links inside sources). Row: path | extraction scope | excerpt.
Files whose text looks like it holds a resident ID or a password are listed in sensitive.txt
and their excerpt is NOT written.
failed.txt holds `path | status` only (tool_missing, timeout, exit_<code>, bad_archive, read_error, error:<type>);
tool output and error messages are never copied, they can hold document text.
A clean conversion with no text is a row marked (텍스트 없음 ...) and is counted apart from failures.
Output holds excerpts of personal documents: keep <out_dir> outside the vault and delete it after use.
Tools: PDF needs `pdftotext` (poppler, any OS). DOCX/ODT/PPTX/XLSX are read with zipfile (any OS).
DOC/RTF need macOS `textutil`; elsewhere they go to failed.txt as tool_missing.
Usage: python3 -I doc_manifest.py <vault> <out_dir>
       python3 -I doc_manifest.py <vault> <out_dir> --paths <list>   # only these vault paths
       python3 -I doc_manifest.py --selftest
"""
import os, re, sys, shutil, subprocess, tempfile, zipfile, html

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources import Policy, SENSITIVE_RE as SENSITIVE, out_file, read_paths
from manifest import targets

EXTS = (".pdf", ".docx", ".doc", ".rtf", ".odt", ".pptx", ".xlsx")
EXCERPT, TIMEOUT = 400, 90
EMPTY = "(텍스트 없음: 정상 변환, 스캔 이미지일 수 있음)"


class ExtractError(Exception):
    """Carries a fixed status code only, never tool output."""


def xml_text(path, members_re, tag_re):
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.match(members_re, n))
        return " ".join(html.unescape(t) for n in names for t in re.findall(tag_re, z.read(n).decode("utf-8", "replace")))


def run_tool(cmd, path):
    if not shutil.which(cmd[0]):
        raise ExtractError("tool_missing")
    try:
        r = subprocess.run(cmd + [path] + (["-"] if cmd[0] == "pdftotext" else []),
                           capture_output=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        raise ExtractError("timeout")
    except OSError:
        raise ExtractError("tool_error")
    if r.returncode != 0:   # stderr is discarded: it may quote the document
        raise ExtractError(f"exit_{r.returncode}")
    return r.stdout.decode("utf-8", "replace")


# What extract() actually reads, so an excerpt is never reported as covering the whole document.
SCOPES = {".pdf": "PDF 앞 3쪽", ".docx": "DOCX 본문(머리글·바닥글·각주·메모 제외)", ".odt": "ODT 본문 문단·제목",
          ".pptx": "PPTX 슬라이드 텍스트(발표자 노트 제외)", ".xlsx": "XLSX 공유 문자열만(숫자·수식·인라인 문자열 제외)",
          ".doc": "textutil 변환 텍스트", ".rtf": "textutil 변환 텍스트"}


def scope(path):
    return SCOPES[os.path.splitext(path)[1].lower()]


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


def status_of(e):
    if isinstance(e, ExtractError):
        return e.args[0]
    if isinstance(e, zipfile.BadZipFile):
        return "bad_archive"
    if isinstance(e, OSError):
        return "read_error"
    return f"error:{type(e).__name__}"


def main(vault, out_dir, paths_file=None):
    router = open(os.path.join(vault, "CLAUDE.md"), encoding="utf-8").read()
    policy = Policy(vault, router)
    policy.check_out(out_dir)
    by_top, skipped = targets(policy, EXTS, read_paths(paths_file) if paths_file else None)
    os.makedirs(out_dir, exist_ok=True)
    sensitive, failed, empty = [], [], 0
    for top, files in sorted(by_top.items()):
        rows = []
        for rel, p in files:
            try:
                text = re.sub(r"\s+", " ", extract(p)).strip()
            except Exception as e:   # timeout, broken zip, missing tool, download failure ...
                failed.append(f"{rel} | {status_of(e)}"); continue
            if SENSITIVE.search(text):
                sensitive.append(rel); continue
            empty += not text
            rows.append(f"{rel} | {scope(rel)} | {text[:EXCERPT] or EMPTY}")
        with open(out_file(out_dir, f"{top}.docs.txt"), "w", encoding="utf-8") as out:
            out.write("\n".join(rows) + "\n")
        print(top, len(rows), "docs", flush=True)
    open(out_file(out_dir, "sensitive.txt"), "w", encoding="utf-8").write("\n".join(sensitive) + "\n")
    open(out_file(out_dir, "failed.txt"), "w", encoding="utf-8").write("\n".join(failed) + "\n")
    print("sensitive", len(sensitive), "failed", len(failed), "empty", empty,
          "| 제외:", ", ".join(f"{k} {v}" for k, v in sorted(skipped.items())) or "없음")


def selftest():
    assert SENSITIVE.search("주민등록번호 900101-1234567") and SENSITIVE.search("PW: abc") and not SENSITIVE.search("password_change_form")
    with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as o:
        os.makedirs(os.path.join(t, "src-a", "비밀"))
        with zipfile.ZipFile(os.path.join(t, "src-a", "plan.docx"), "w") as z:
            z.writestr("word/document.xml", '<w:p><w:r><w:t>배포 계획</w:t></w:r><w:r><w:t xml:space="preserve"> 1차 &amp; 2차</w:t></w:r></w:p>')
        with zipfile.ZipFile(os.path.join(t, "src-a", "note.odt"), "w") as z:
            z.writestr("content.xml", "<office:text><text:p>운영 <text:span>메모</text:span></text:p></office:text>")
        with zipfile.ZipFile(os.path.join(t, "src-a", "id.docx"), "w") as z:
            z.writestr("word/document.xml", "<w:t>주민등록번호</w:t>")
        with zipfile.ZipFile(os.path.join(t, "src-a", "비밀", "x.docx"), "w") as z:
            z.writestr("word/document.xml", "<w:t>hidden</w:t>")
        open(os.path.join(t, "src-a", "broken.docx"), "w").write("not a zip: secret body text")
        open(os.path.join(t, "CLAUDE.md"), "w", encoding="utf-8").write("- 비공개: `src-a/비밀`\n")
        main(t, os.path.join(o, "out"))
        docs = open(os.path.join(o, "out", "src-a.docs.txt"), encoding="utf-8").read()
        assert f"src-a/plan.docx | {SCOPES['.docx']} | 배포 계획 1차 & 2차" in docs and f"src-a/note.odt | {SCOPES['.odt']} | 운영 메모" in docs, docs
        assert "hidden" not in docs and "id.docx" not in docs, docs
        assert open(os.path.join(o, "out", "sensitive.txt"), encoding="utf-8").read() == "src-a/id.docx\n"
        assert open(os.path.join(o, "out", "failed.txt"), encoding="utf-8").read() == "src-a/broken.docx | bad_archive\n"
        try:
            main(t, os.path.join(t, "src-a"))   # output inside a source
        except ValueError:
            pass
        else:
            raise AssertionError("excerpt output inside a source accepted")
        assert not os.path.exists(os.path.join(t, "src-a", "src-a.docs.txt"))
        if os.name != "nt":
            # conversion status: a tool that fails, one that prints nothing, one that hangs, and no tool at all
            global TIMEOUT
            bindir = os.path.join(o, "bin"); os.makedirs(bindir)
            fake = os.path.join(bindir, "pdftotext")
            for f in ("bad.pdf", "scan.pdf", "slow.pdf"):
                open(os.path.join(t, "src-a", f), "w").write("%PDF")
            open(fake, "w").write('#!/bin/sh\ncase "$4" in *bad.pdf) echo "secret stderr" >&2; exit 3;; '
                                  '*slow.pdf) exec sleep 5;; esac\nexit 0\n')
            os.chmod(fake, 0o755)
            old_path, old_timeout = os.environ.get("PATH", ""), TIMEOUT
            os.environ["PATH"], TIMEOUT = bindir + os.pathsep + old_path, 1
            try:
                main(t, os.path.join(o, "pdf-out"))
                failed = open(os.path.join(o, "pdf-out", "failed.txt"), encoding="utf-8").read()
                docs = open(os.path.join(o, "pdf-out", "src-a.docs.txt"), encoding="utf-8").read()
                assert "src-a/bad.pdf | exit_3" in failed and "src-a/slow.pdf | timeout" in failed and "secret" not in failed, failed
                assert f"src-a/scan.pdf | PDF 앞 3쪽 | {EMPTY}" in docs and "bad.pdf" not in docs, docs
                os.environ["PATH"] = os.path.join(o, "nothing")
                main(t, os.path.join(o, "nopdf-out"))
                failed = open(os.path.join(o, "nopdf-out", "failed.txt"), encoding="utf-8").read()
                assert "src-a/scan.pdf | tool_missing" in failed, failed
            finally:
                os.environ["PATH"], TIMEOUT = old_path, old_timeout
            for f in ("bad.pdf", "scan.pdf", "slow.pdf"):
                os.remove(os.path.join(t, "src-a", f))
        os.makedirs(os.path.join(t, ".secondbrain"))
        open(os.path.join(t, "CLAUDE.md"), "w", encoding="utf-8").write(
            "- 비공개 장부: .secondbrain/private-paths.txt\n")
        ledger = os.path.join(t, ".secondbrain", "private-paths.txt")
        open(ledger, "w", encoding="utf-8").write("src-a/비밀\nsrc-a/plan.docx\n")
        main(t, os.path.join(o, "ledger-out"))
        docs = open(os.path.join(o, "ledger-out", "src-a.docs.txt"), encoding="utf-8").read()
        assert "plan.docx" not in docs and "hidden" not in docs and "note.odt" in docs, docs
        lst = os.path.join(o, "list.tsv")
        open(lst, "w", encoding="utf-8").write("src-a/note.odt\nsrc-a/plan.docx\n")
        main(t, os.path.join(o, "list-out"), lst)
        docs = open(os.path.join(o, "list-out", "src-a.docs.txt"), encoding="utf-8").read()
        assert docs == f"src-a/note.odt | {SCOPES['.odt']} | 운영 메모\n", docs
        os.remove(ledger)
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
