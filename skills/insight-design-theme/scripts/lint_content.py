"""내용 파일(doc.json)을 빌드 전에 검사한다. 표준 라이브러리만 쓴다.

사용:
  python3 -I lint_content.py doc.json [--brand brand.json]
  python3 -I lint_content.py --selftest
종료 코드: 0 통과(경고는 있을 수 있음), 1 오류(빌드하지 말 것), 2 사용법 오류.
형식은 references/content.md 참고.
"""
import json
import re
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
MARKS = "①②③④⑤⑥⑦⑧⑨"
BLOCKS = {"text", "list", "callout", "quote", "stats", "steps", "points", "table", "code"}

# 공유 문서에 들어가면 안 되는 값: 로컬 경로(계정·폴더명 노출), 이메일, 흔한 키 형식
PRIVATE = [
    (re.compile(r"(/Users/|/home/|[A-Za-z]:\\\\Users\\\\)[^\s'\"`]*"), "로컬 경로"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "이메일 주소"),
    (re.compile(r"\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{10,})"), "비밀키 형식"),
]
# 본문 글꼴 문장에서 '.' 바로 뒤에 높이가 다른 기호(~, 백틱)가 오면 PDF 복사 시 줄이 갈라진다(macOS PDFKit 확인)
COPY_HAZARD = re.compile(r"\.\s?[~`]")


def walk(doc):
    """(위치, 값, 코드 본문 여부)를 모두 낸다."""
    meta = doc.get("meta") or {}
    for k in ("kicker", "issue", "date", "subtitle", "cta", "ctaLabel", "command"):
        if isinstance(meta.get(k), str):
            yield f"meta.{k}", meta[k], False
    for i, t in enumerate(meta.get("title") or []):
        yield f"meta.title[{i}]", t, False
    for i, kv in enumerate(meta.get("facts") or []):
        for v in kv:
            yield f"meta.facts[{i}]", v, False
    for si, sec in enumerate(doc.get("sections") or []):
        at = f"sections[{si}]"
        for k in ("title", "tag", "speaker"):
            if sec.get(k):
                yield f"{at}.{k}", sec[k], False
        for bi, b in enumerate(sec.get("blocks") or []):
            here = f"{at}.blocks[{bi}]({b.get('type')})"
            for k in ("text", "title", "label", "cite", "file", "unit"):
                if isinstance(b.get(k), str):
                    yield f"{here}.{k}", b[k], False
            if b.get("type") == "code":
                yield f"{here}.body", b.get("body", ""), True
            for j, it in enumerate(b.get("items") or []):
                if isinstance(it, str):
                    yield f"{here}.items[{j}]", it, False
                elif isinstance(it, dict):
                    for k, v in it.items():
                        if isinstance(v, str):
                            yield f"{here}.items[{j}].{k}", v, False
                    for row in it.get("rows") or []:
                        for v in row:
                            yield f"{here}.items[{j}].rows", v, False
            for j, n in enumerate(b.get("notes") or []):
                for k in ("title", "text"):
                    yield f"{here}.notes[{j}].{k}", n.get(k, ""), False
            for v in b.get("head") or []:
                yield f"{here}.head", v, False
            for j, row in enumerate(b.get("rows") or []):
                for v in row:
                    yield f"{here}.rows[{j}]", v, False


def lint_block(b, here, E, W):
    t = b.get("type")
    if t not in BLOCKS:
        E(f"{here}: 알 수 없는 블록 종류 '{t}' (가능: {', '.join(sorted(BLOCKS))})")
        return
    items = b.get("items")
    if t in ("text", "quote") and not str(b.get("text") or "").strip():
        E(f"{here}: text가 비어 있음")
    if t == "callout" and not (b.get("title") or b.get("text")):
        E(f"{here}: title이나 text가 필요함")
    if t in ("list", "stats", "steps", "points"):
        if not isinstance(items, list) or not items:
            E(f"{here}: items가 비어 있음")
            return
    if t == "text" and len(b.get("text", "")) > 700 and "\n\n" not in b.get("text", ""):
        W(f"{here}: 한 문단이 {len(b['text'])}자. 빈 줄로 문단을 나누면 페이지 나눔이 자연스러움")
    if t == "stats":
        if len(items) > 6:
            W(f"{here}: 큰 숫자 {len(items)}개. 3~4개 이하를 권장")
        for j, s in enumerate(items):
            if not str(s.get("value") or "").strip():
                E(f"{here}.items[{j}].value: 비어 있음")
            if len(str(s.get("value", ""))) > 7:
                W(f"{here}.items[{j}].value: '{s['value']}'는 큰 숫자로 쓰기에 김(7자 이하 권장)")
            if "ratio" in s and not (isinstance(s["ratio"], (int, float)) and 0 <= s["ratio"] <= 1):
                E(f"{here}.items[{j}].ratio: 0~1 사이 숫자여야 함")
            if "cells" in s:
                c = s["cells"]
                if isinstance(c, bool) or not isinstance(c, int) or not 0 <= c <= 50:
                    E(f"{here}.items[{j}].cells: 0~50 사이 정수여야 함(넘으면 unit의 한 칸 크기를 키울 것)")
                if "ratio" in s:
                    E(f"{here}.items[{j}]: ratio와 cells는 하나만 쓸 것")
        with_cells = sum(1 for s in items if "cells" in s)
        if with_cells and not str(b.get("unit") or "").strip():
            E(f"{here}.unit: cells를 쓰면 한 칸의 뜻이 필요함(예: '1칸 = 10초')")
        if b.get("unit") and not with_cells:
            W(f"{here}.unit: cells가 있는 항목이 없어 unit이 쓰이지 않음")
        if 0 < with_cells < len(items):
            W(f"{here}: {len(items)}개 중 {with_cells}개에만 cells가 있음. 막대끼리 비교하려면 모두 넣을 것")
    if t == "steps":
        if not 2 <= len(items) <= 8:
            W(f"{here}: 단계 {len(items)}개. 2~8개를 권장")
        for j, s in enumerate(items):
            if not str(s.get("title") or "").strip():
                E(f"{here}.items[{j}].title: 비어 있음")
            if len(str(s.get("title", ""))) > 14:
                W(f"{here}.items[{j}].title: {len(s['title'])}자. 카드 제목이 두 줄이 될 수 있음")
            for row in s.get("rows") or []:
                if not (isinstance(row, list) and len(row) == 2):
                    E(f"{here}.items[{j}].rows: [라벨, 내용] 쌍이어야 함")
    if t == "points":
        for j, p in enumerate(items):
            if not str(p.get("title") or "").strip():
                E(f"{here}.items[{j}].title: 비어 있음")
    if t == "table":
        head, rows = b.get("head") or [], b.get("rows") or []
        if not rows:
            E(f"{here}: rows가 비어 있음")
        if head and any(len(r) != len(head) for r in rows):
            E(f"{here}: 행마다 칸 수가 head({len(head)}칸)와 같아야 함")
        if len(head) > 5:
            W(f"{here}: {len(head)}칸. 카드(4:5)와 PPT에서 좁아짐(4칸 이하 권장)")
    if t == "code":
        body = b.get("body") or ""
        if not body.strip():
            E(f"{here}: body가 비어 있음")
        used = {m for m in MARKS if m in body}
        noted = {n.get("mark") for n in b.get("notes") or []}
        for m in sorted(noted - used):
            E(f"{here}: 해설 {m}가 본문에 없음")
        for m in sorted(used - noted):
            E(f"{here}: 본문의 {m}에 해당하는 해설(notes)이 없음")
        excerpt = b.get("excerpt", True)
        has_omit = any(l.startswith("··· ") for l in body.splitlines())
        if excerpt is not False and not has_omit:
            W(f"{here}: 발췌로 표시되지만 '··· 생략:' 줄이 없음. 원문 전체면 \"excerpt\": false")
        if excerpt is False and has_omit:
            E(f"{here}: 원문 전체(excerpt:false)인데 생략 줄이 있음")


def lint(doc, brand=None):
    errors, warns = [], []
    E, W = errors.append, warns.append
    meta = doc.get("meta")
    if not isinstance(meta, dict):
        E("meta: 없음(표지 정보)")
        meta = {}
    title = meta.get("title")
    if not isinstance(title, list) or not 1 <= len(title) <= 3 or not all(str(t).strip() for t in title):
        E("meta.title: 1~3줄 문자열 배열이어야 함")
    else:
        for i, t in enumerate(title):
            if len(t) > 13:
                W(f"meta.title[{i}]: {len(t)}자. 표지에서 한 줄에 넘칠 수 있음(13자 이하 권장)")
    if len(meta.get("facts") or []) > 3:
        W("meta.facts: 표지에는 앞의 3개만 나옴")
    for i, kv in enumerate(meta.get("facts") or []):
        if not (isinstance(kv, list) and len(kv) == 2):
            E(f"meta.facts[{i}]: [이름, 값] 쌍이어야 함")
    secs = doc.get("sections")
    if not isinstance(secs, list) or not secs:
        E("sections: 비어 있음")
        secs = []
    for si, sec in enumerate(secs):
        if not str(sec.get("title") or "").strip():
            E(f"sections[{si}].title: 비어 있음")
        if "speaker" in sec and not isinstance(sec["speaker"], str):
            E(f"sections[{si}].speaker: 문자열이어야 함")
        if len(str(sec.get("title", ""))) > 20:
            W(f"sections[{si}].title: {len(sec['title'])}자. 카드(4:5)에서 두 줄이 됨(20자 이하 권장)")
        blocks = sec.get("blocks")
        if not isinstance(blocks, list) or not blocks:
            E(f"sections[{si}].blocks: 비어 있음")
            continue
        for bi, b in enumerate(blocks):
            lint_block(b, f"sections[{si}].blocks[{bi}]", E, W)

    for where, value, is_code in walk(doc):
        for rx, label in PRIVATE:
            m = rx.search(str(value))
            if m:
                E(f"{where}: {label} 포함 → '{m.group(0)[:40]}'. 공유 문서에서 지우거나 일반화할 것")
        if not is_code and COPY_HAZARD.search(str(value)):
            W(f"{where}: '.' 바로 뒤에 ~ 또는 백틱. PDF 복사 시 줄이 갈라질 수 있음(괄호 안에 넣는 식으로 고칠 것)")

    if brand is not None and brand.get("handlePlaceholder"):
        W(f"brand.handle: '{brand.get('handle')}'는 임시값. 실제 핸들로 바꾸면 assets/brand.json의 handlePlaceholder를 false로")
    return errors, warns


def selftest():
    good = {
        "meta": {"kicker": "KIT", "issue": "01", "title": ["제목"], "subtitle": "부제", "cta": "저장해 두세요.", "facts": [["tools", "A"]]},
        "sections": [
            {"title": "과정", "blocks": [
                {"type": "text", "text": "문단"},
                {"type": "steps", "items": [{"no": "01", "title": "점검", "text": "보고만 한다.", "rows": [["stop", "멈춘다"]]}, {"title": "구현"}]},
                {"type": "stats", "items": [{"value": "2/3", "label": "성공", "ratio": 0.67}]},
                {"type": "table", "head": ["a", "b"], "rows": [["1", "2"]]},
                {"type": "stats", "unit": "1칸 = 10초", "items": [{"value": "2분 10초", "label": "A", "cells": 13}, {"value": "1분 40초", "label": "B", "cells": 10}]},
            ]},
            {"title": "프롬프트", "speaker": "발표자 노트", "blocks": [{"type": "code", "body": "첫 줄 ①\n··· 생략: 나머지", "notes": [{"mark": "①", "title": "a", "text": "b"}]}]},
            {"title": "정리", "blocks": [{"type": "points", "items": [{"title": "t", "text": "x"}]}, {"type": "list", "items": ["a"]}]},
        ],
    }
    e, w = lint(good, {"handlePlaceholder": False})
    assert not e and not w, (e, w)
    bad = json.loads(json.dumps(good))
    bad["sections"][0]["blocks"][0]["text"] = "경로는 /Users/someone/Library/x 입니다. ~/.config도"
    code = bad["sections"][1]["blocks"][0]
    code["notes"].append({"mark": "②", "title": "c", "text": "d"})
    code["body"] = "연락: a.b@example.com ③"
    bad["sections"][0]["blocks"][3]["rows"] = [["1"]]
    bad["sections"][0]["blocks"].append({"type": "chart"})
    bad["sections"][0]["blocks"][2]["items"][0]["ratio"] = 3
    bad["sections"][1]["speaker"] = "메일은 x.y@example.com"
    cb = bad["sections"][0]["blocks"][4]
    del cb["unit"]
    cb["items"][0]["cells"] = 51
    cb["items"][1]["ratio"] = 0.5
    e, w = lint(bad, {"handlePlaceholder": True})
    joined = "\n".join(e + w)
    for needle in ("로컬 경로", "이메일 주소", "②가 본문에 없음", "③에 해당하는 해설", "줄이 갈라질 수", "임시값",
                   "생략:' 줄이 없음", "칸 수가 head", "알 수 없는 블록", "0~1 사이",
                   "0~50 사이 정수", "하나만 쓸 것", "한 칸의 뜻"):
        assert needle in joined, (needle, joined)
    e, _ = lint({"sections": []})
    assert any("meta" in x for x in e) and any("sections" in x for x in e), e
    print("lint_content 자체 테스트 통과")


def main(argv):
    if argv[:1] == ["--selftest"]:
        selftest()
        return 0
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    doc = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    brand_path = Path(argv[argv.index("--brand") + 1]) if "--brand" in argv else SKILL / "assets" / "brand.json"
    brand = json.loads(brand_path.read_text(encoding="utf-8")) if brand_path.exists() else None
    errors, warns = lint(doc, brand)
    for w in warns:
        print("경고:", w)
    for e in errors:
        print("오류:", e, file=sys.stderr)
    print(f"검사 결과: 오류 {len(errors)}개, 경고 {len(warns)}개")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
