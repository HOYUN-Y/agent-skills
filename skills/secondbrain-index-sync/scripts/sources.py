"""Shared source traversal for the vault scripts: private/secret/PII-name blocking and link boundaries.

Reads names and metadata only. Every script that lists, excerpts or searches source files uses this,
so the same exclusions apply to inventory, move search and excerpts.
"""
import hashlib, json, ntpath, os, re, unicodedata
from collections import Counter

from private_paths import load_private_paths, SECRET_RE

nfc = lambda s: unicodedata.normalize("NFC", s)
fold = lambda s: nfc(nfc(s).casefold())   # private-path comparison only
INVENTORY = ".secondbrain/inventory.json"
REVIEW = ".secondbrain/review-state.json"
SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "site-packages", "__pycache__", ".conda", "staticfiles", ".next", "dist", "build", ".changelog-backups"}
# Values that would leak personal data if a *name* were listed. Regex cannot catch personal names.
NAME_PII_RE = re.compile(r"(\d{6}\s?[-_]?\s?[1-4]\d{6}|01[016789][-_. ]?\d{3,4}[-_. ]?\d{4}|[^@\s/]+@[^@\s/]+\.[a-z]{2,}|주민등록|주민번호)", re.I)
# Text that looks like a resident ID or a password: such files are never excerpted.
SENSITIVE_RE = re.compile(r"(\d{6}\s?-\s?[1-4]\d{6}|(비밀번호|비번|password|passwd|pw)\s*[:=：]\s*\S|주민등록번호)", re.I)
POLICY_VERSION = 1


def path_id(real):
    """Short hash of a real path: stored instead of absolute paths (Drive paths can hold an account email)."""
    return hashlib.sha256(nfc(real).encode()).hexdigest()[:16]


def is_link(path):
    # Windows junctions (mklink /J) are not symlinks to islink(); isjunction needs Python 3.12+.
    return os.path.islink(path) or getattr(os.path, "isjunction", lambda _: False)(path)


def load_json(vault, rel):
    """Parsed state file, None when absent. Raises ValueError when it is not ours or unreadable."""
    sb = os.path.join(vault, ".secondbrain")
    if os.path.lexists(sb) and (is_link(sb) or not os.path.isdir(sb)):
        raise ValueError(".secondbrain이 링크이거나 폴더가 아님")
    path = os.path.join(vault, rel)
    if not os.path.lexists(path):
        return None
    if is_link(path):
        raise ValueError(f"{rel}이 링크임")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        raise ValueError(f"{rel} 읽기 실패 ({type(e).__name__})")
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("files"), dict):
        raise ValueError(f"{rel} 형식이 이 스킬의 상태 파일이 아님")
    return data


class Policy:
    def __init__(self, vault, router):
        self.vault = os.path.abspath(vault)
        self.private = load_private_paths(self.vault, router)   # raises: callers abort before any traversal
        # Real targets of private paths, so an alias (another link to the same folder) cannot bypass them.
        here = {p for p in self.private if os.path.exists(os.path.join(self.vault, p))}   # a dangling link is not resolvable
        # Private comparisons only are casefolded (case-insensitive file systems: src-a/private == src-a/Private).
        # Conservative on case-sensitive systems; listed paths and source ids keep their exact spelling.
        self.private_cf = {p.casefold() for p in self.private}
        self.private_real = sorted({fold(os.path.realpath(os.path.join(self.vault, p))) for p in here})
        # A private path behind an offline link cannot be resolved now: use the identity saved by the last
        # inventory --write (a hash, not the path), so a still-online alias stays blocked.
        # Keys are hashes of the rule paths too: private names are not copied into the inventory.
        try:
            saved = (load_json(self.vault, INVENTORY) or {}).get("private_ids", {})
        except ValueError:   # inventory.py refuses a broken inventory itself
            saved = {}
        # An early development format keyed by the raw rule path is read as its hash; the next --write stores hashes.
        saved = {(k if re.fullmatch(r"[0-9a-f]{16}", k) else path_id(k)): v for k, v in saved.items()}
        rule = {p: path_id(p) for p in self.private}
        self.unresolved = {saved[rule[p]] for p in self.private - here if rule[p] in saved}
        self.ids = {**{rule[p]: saved[rule[p]] for p in self.private - here if rule[p] in saved},
                    **{rule[p]: path_id(fold(os.path.realpath(os.path.join(self.vault, p)))) for p in here}}

    def fingerprint(self):
        blob = json.dumps([POLICY_VERSION, sorted(self.private), sorted(SKIP_DIRS)], ensure_ascii=False)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    def private_rel(self, rel):
        rel = fold(rel)
        return any(rel == n or rel.startswith(n + "/") for n in self.private_cf)

    def private_real_path(self, real):
        real = fold(real)
        if any(real == r or real.startswith(r + os.sep) for r in self.private_real):
            return True
        parts = real.split(os.sep)
        return bool(self.unresolved) and any(path_id(os.sep.join(parts[:i])) in self.unresolved for i in range(2, len(parts) + 1))

    @staticmethod
    def name_reason(name, is_dir):
        if name.startswith((".", "~$")) or name == "Icon\r":
            return "hidden"
        if is_dir and (name in SKIP_DIRS or name.startswith("eclipse")):
            return "dependency"
        if SECRET_RE.search(name):
            return "secret_name"
        if NAME_PII_RE.search(nfc(name)):
            return "pii_name"
        return None

    def allowed_rel(self, rel):
        """Saved state (inventory, review-state, move lookup) against the current policy: logical path, names,
        and the real target, so a new private folder also hides cached entries reached through another link."""
        parts = rel.split("/")
        if self.private_rel(rel) or any(self.name_reason(p, i < len(parts) - 1) for i, p in enumerate(parts)):
            return False
        # Links inside a source are never followed, so <real root of the top folder>/<rest> is the real path.
        return not self.private_real_path(os.path.join(self.root_real(parts[0]), *parts[1:]))

    def root_real(self, top):
        cache = self.__dict__.setdefault("_roots", {})
        if top not in cache:
            cache[top] = os.path.realpath(os.path.join(self.vault, top))
        return cache[top]

    def source_id(self, top):
        """Identity of what a top folder points at; a changed id means the link was retargeted."""
        return path_id(self.root_real(top))

    def check_out(self, path):
        """Refuse an output location inside the vault or inside any source's real folder."""
        real = fold(os.path.realpath(path))   # conservative write boundary; source identities keep their exact spelling
        roots = [fold(os.path.realpath(self.vault))] + [fold(self.root_real(n)) for n in os.listdir(self.vault)]
        if any(real == r or real.startswith(r.rstrip(os.sep) + os.sep) for r in roots):
            raise ValueError("출력 경로는 볼트와 원본 자료원 밖이어야 함")

    def tops(self, src_only=False):
        """Top-level folders that hold material: in-vault folders and src-* links (dangling ones included)."""
        out, skipped = [], Counter()
        for name in sorted(os.listdir(self.vault)):
            p = os.path.join(self.vault, name)
            link = is_link(p)
            if (src_only and not name.startswith("src-")) or not (os.path.isdir(p) or (link and name.startswith("src-"))):
                continue
            if link and not name.startswith("src-"):
                skipped["link"] += 1; continue
            reason = self.name_reason(name, True)
            if reason:
                skipped[reason] += 1; continue
            if self.private_rel(name):
                skipped["private"] += 1; continue
            out.append(name)
        return out, skipped

    def walk(self, top):
        """List one top-level source. Links inside a source are never followed (no cycles, no aliases,
        no widening past the source). Returns status complete|partial|offline|private_alias."""
        base = os.path.join(self.vault, top)
        out = {"status": "complete", "files": {}, "dirs": [], "skipped": Counter(), "errors": [], "target": None}
        if not os.path.isdir(base):
            out["status"] = "offline"; return out
        root_real, out["target"] = self.root_real(top), self.source_id(top)
        if self.private_real_path(root_real):
            out["status"] = "private_alias"; return out
        stack, seen = [(base, top, root_real)], set()
        while stack:
            d, rel, real = stack.pop()
            try:
                st = os.stat(d)
                key = (st.st_dev, st.st_ino)
                if key != (0, 0) and key in seen:   # junction cycle on Pythons without isjunction
                    out["skipped"]["cycle"] += 1; continue
                seen.add(key)
                with os.scandir(d) as it:
                    entries = sorted(it, key=lambda e: e.name)
            except OSError:
                out["errors"].append(rel); out["status"] = "offline" if rel == top else "partial"; continue
            for e in entries:
                r, er = f"{rel}/{e.name}", os.path.join(real, e.name)
                try:
                    link = e.is_symlink() or getattr(e, "is_junction", lambda: False)()
                    is_dir = not link and e.is_dir(follow_symlinks=False)
                    if is_dir and os.name == "nt" and os.path.normcase(os.path.realpath(e.path)) != os.path.normcase(er):
                        is_dir, link = False, True   # junction on Python < 3.12: not followed past the source
                    reason = self.name_reason(e.name, is_dir)
                    if reason:
                        out["skipped"][reason] += 1; continue
                    if self.private_rel(r) or self.private_real_path(er):
                        out["skipped"]["private"] += 1; continue
                    if link:
                        out["skipped"]["link"] += 1; continue
                    if is_dir:
                        out["dirs"].append(r); stack.append((e.path, r, er)); continue
                    st = e.stat(follow_symlinks=False)
                    out["files"][r] = (st.st_size, st.st_mtime_ns)
                except OSError:
                    out["errors"].append(r); out["status"] = "partial"
        return out

    def check_rel(self, rel):
        """(abs_path, None) when rel is a listable file inside a top-level source, else (None, reason)."""
        if (not rel or rel.startswith("/") or "\\" in rel or ntpath.splitdrive(rel)[0]
                or any(p in ("", ".", "..") for p in rel.split("/")) or "\x00" in rel):
            return None, "invalid"
        parts = rel.split("/")
        if len(parts) < 2:
            return None, "not_in_source"
        for i, part in enumerate(parts):
            reason = self.name_reason(part, i < len(parts) - 1)
            if reason:
                return None, reason
        if self.private_rel(rel):
            return None, "private"
        if is_link(os.path.join(self.vault, parts[0])) and not parts[0].startswith("src-"):
            return None, "link"
        cur = os.path.join(self.vault, *parts)
        if not os.path.isfile(cur):
            return None, "missing"
        # Any link or junction below the top folder (any Python version) makes the real path differ.
        real, expected = os.path.realpath(cur), os.path.join(self.root_real(parts[0]), *parts[1:])
        if os.path.normcase(nfc(real)) != os.path.normcase(nfc(expected)):
            return None, "link"
        if self.private_real_path(real):
            return None, "private"
        d = os.path.dirname(cur)
        if sum(nfc(n) == nfc(parts[-1]) for n in os.listdir(d)) > 1:
            return None, "nfc_collision"   # two disk spellings of one name: ambiguous, never recorded
        return cur, None


def out_file(out_dir, name):
    """Path for an excerpt file; refuses a pre-planted link that would redirect the write."""
    p = os.path.join(out_dir, name)
    if os.path.lexists(p) and (is_link(p) or not os.path.isfile(p)):
        raise ValueError(f"출력 파일이 링크이거나 파일이 아님: {name}")
    return p


def read_paths(path):
    """First TSV column of each non-comment line: vault-relative paths written by inventory.py --review-out."""
    with open(path, encoding="utf-8-sig") as f:
        return [line.rstrip("\r\n").split("\t") for line in f if line.strip() and not line.startswith("#")]
