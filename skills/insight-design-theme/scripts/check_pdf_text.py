"""완성 PDF의 복사 품질과 정보 노출을 검사한다. 표준 라이브러리만 쓴다.

사용: python3 -I check_pdf_text.py doc.json extracted.txt document.pdf [rows.json]
- extracted.txt: pdf2png가 저장한 PDFKit 추출 텍스트(복사했을 때 나오는 텍스트에 가깝다).
- code 블록 본문의 각 줄이 추출 텍스트에 이어진 채로 들어 있는지 본다(공백·줄바꿈은 무시).
  빠지거나 순서가 뒤섞이면 독자가 복사해 쓸 때 문장이 깨진다.
- rows.json(선택): 렌더러(kit.js codeRows)가 기록한 코드 블록의 화면 줄 목록. 화면의 한 줄이 추출 텍스트에서도
  한 줄 안에 있는지 본다. 화면에서는 한 줄인데 복사하면 둘로 갈라지는 경우(예: "- .env")를 잡는다.
- PDF 안(압축 스트림 포함)과 추출 텍스트에 로컬 경로·이메일이 있는지 본다.
종료 코드: 0 통과, 1 문제 있음.
"""
import json
import re
import sys
import zlib

MARKS = re.compile(r"\s*[①②③④⑤⑥⑦⑧⑨]")
# 실제 계정 이름이 들어간 경로·이메일
LEAK = re.compile(rb"/Users/[A-Za-z0-9._-]+|/home/[a-z][\w.-]*|[\w.+-]+@[\w-]+\.(com|net|org|kr|io|dev)\b")


def squash(s):
    return re.sub(r"\s+", "", s)


def code_blocks(doc):
    for si, sec in enumerate(doc.get("sections") or []):
        for bi, b in enumerate(sec.get("blocks") or []):
            if b.get("type") == "code":
                yield f"sections[{si}].blocks[{bi}]", b


def split_rows(rows, raw_text):
    """화면의 한 줄이 추출 텍스트의 어느 한 줄에도 통째로 없으면 복사할 때 갈라진 것이다."""
    lines = [squash(x) for x in raw_text.splitlines()]
    bad = []
    for r in rows:
        q = squash(r)
        if q and not any(q in x for x in lines):
            bad.append(r)
    return bad


def main(doc_path, text_path, pdf_path, rows_path=None):
    doc = json.load(open(doc_path, encoding="utf-8"))
    raw_text = open(text_path, encoding="utf-8").read()
    text = squash(raw_text)
    problems = []
    checked = 0
    for where, b in code_blocks(doc):
        for n, line in enumerate((b.get("body") or "").splitlines(), 1):
            plain = MARKS.sub("", line).replace("`", "")
            if not plain.strip() or plain.startswith("··· "):
                continue
            checked += 1
            if squash(plain) not in text:
                problems.append(f"{where} {n}행이 복사 텍스트에서 끊기거나 순서가 바뀜: {plain.strip()[:60]}")
    rows = json.load(open(rows_path, encoding="utf-8")) if rows_path else []
    for r in split_rows(rows, raw_text):
        problems.append(f"화면의 한 줄이 복사하면 두 줄로 갈라짐: {r.strip()[:60]}")
    raw = open(pdf_path, "rb").read()
    blobs = [raw, raw_text.encode("utf-8")]
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, re.S):
        try:
            blobs.append(zlib.decompress(m.group(1)))
        except zlib.error:
            pass
    leaks = sorted({m.group(0).decode("utf-8", "replace") for b in blobs for m in LEAK.finditer(b)})
    if leaks:
        problems.append("PDF 안에 로컬 경로·이메일로 보이는 값: " + ", ".join(leaks[:5]))
    for p in problems:
        print("문제:", p)
    rows_note = f", 화면 줄 {len(rows)}개" if rows_path else ""
    print(f"복사 검사: 코드 {checked}줄{rows_note} 확인, 문제 {len(problems)}개")
    return 1 if problems else 0


def selftest():
    rows = ["- .env 파일은 읽지 않는다.", "1. 첫 줄이 길어서 화면에서", "줄바꿈된 부분"]
    ok = "- .env 파일은 읽지 않는다.\n1. 첫 줄이 길어서 화면에서\n줄바꿈된 부분\n"
    assert split_rows(rows, ok) == []
    broken = "-\n.env 파일은 읽지 않는다.\n1. 첫 줄이 길어서 화면에서\n줄바꿈된 부분\n"
    assert split_rows(rows, broken) == ["- .env 파일은 읽지 않는다."]
    joined = "- .env 파일은 읽지 않는다. 1. 첫 줄이 길어서 화면에서 줄바꿈된 부분 (옆 단의 글)\n"
    assert split_rows(rows, joined) == []  # 한 줄로 합쳐지는 것은 복사에 해가 없다
    print("check_pdf_text 자체 테스트 통과")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        selftest()
        sys.exit(0)
    if len(sys.argv) not in (4, 5):
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
