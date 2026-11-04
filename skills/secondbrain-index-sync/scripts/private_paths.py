"""Load legacy router exclusions and an explicitly enabled private-path ledger."""
import ntpath
import os
import re
import unicodedata

LEDGER = ".secondbrain/private-paths.txt"
# Name filters are conservative; .key remains a Keynote document.
SECRET_RE = re.compile(r"(^\.env|^env[._-]|(^|[._-])env(\.txt)?$|\.env$|keys?\.txt$|\.pem$|\.p12$|\.pfx$|\.keystore$|^id_(rsa|ed25519|ecdsa)|token|secret|credential|password|api[ _-]?keys?\b|\.ppk$|비밀번호|\.netrc$)", re.I)


def load_private_paths(root, router):
    nfc = lambda value: unicodedata.normalize("NFC", value)
    private = {nfc(p).rstrip("/") for line in router.splitlines() if "비공개" in line
               for p in re.findall(r"`([^`]+)`", line)}
    markers = re.findall(r"^\s*-?\s*비공개 장부:\s*(.*?)\s*$", router, re.M)
    ledger = os.path.join(root, LEDGER)
    if not markers:
        if os.path.lexists(ledger) or "비공개 장부" in router:
            raise ValueError("비공개 장부 표식이 없거나 해석할 수 없습니다")
        return private
    if markers != [LEDGER]:
        raise ValueError("비공개 장부는 .secondbrain/private-paths.txt를 한 번만 지정해야 합니다")
    # Missing/unreadable ledgers must abort before any source traversal.
    if os.path.commonpath([os.path.realpath(root), os.path.realpath(ledger)]) != os.path.realpath(root):
        raise ValueError("비공개 장부는 볼트 내부 파일이어야 합니다")
    with open(ledger, encoding="utf-8-sig") as source:
        for line in source:
            path = nfc(line.strip())
            if not path or path.startswith("#"):
                continue
            path = path.rstrip("/")
            if (not path or path.startswith("/") or ntpath.splitdrive(path)[0] or "\\" in path
                    or any(c in path for c in "*?`\x00")
                    or any(part in ("", ".", "..") for part in path.split("/"))):
                raise ValueError("비공개 장부에 볼트 상대경로가 아닌 항목이 있습니다")
            private.add(path)
    return private
