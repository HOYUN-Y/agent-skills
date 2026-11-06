"""완성 PPT(.pptx)를 점검한다. 표준 라이브러리만 쓴다.

사용: python3 -I check_pptx.py deck.pptx doc.json
- 파일 안(XML 전체)에 로컬 경로·이메일이 있는지 본다(pptxgenjs는 그림 대체 텍스트에 로컬 경로를 넣는다).
- ZIP에 폴더 항목이 있는지 본다(클라우드 저장소에서 열기·공동 편집 실패 원인).
- code 블록 본문 각 줄이 슬라이드 텍스트에 빠짐없이 들어갔는지 본다.
- 슬라이드별 텍스트를 deck.pptx.txt로 저장한다(내용 검토용).
종료 코드: 0 통과, 1 문제 있음.
"""
import html
import json
import re
import sys
import zipfile

# 실제 계정 이름이 들어간 경로·이메일
LEAK = re.compile(r"/Users/[A-Za-z0-9._-]+|/home/[a-z][\w.-]*|[\w.+-]+@[\w-]+\.(com|net|org|kr|io|dev)\b")
MARKS = re.compile(r"\s*[①②③④⑤⑥⑦⑧⑨]")


def squash(s):
    return re.sub(r"\s+", "", s)


def main(pptx, doc_path):
    doc = json.load(open(doc_path, encoding="utf-8"))
    problems = []
    with zipfile.ZipFile(pptx) as z:
        dirs = [n for n in z.namelist() if n.endswith("/")]
        if dirs:
            problems.append(f"ZIP 폴더 항목 {len(dirs)}개")
        slides = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)), key=lambda n: int(re.findall(r"\d+", n)[0]))
        texts = []
        for n in z.namelist():
            if n.endswith((".xml", ".rels")):
                data = z.read(n).decode("utf-8", "replace")
                for m in LEAK.finditer(data):
                    problems.append(f"{n}: 로컬 경로·이메일로 보이는 값 '{m.group(0)}'")
                    break
        for n in slides:
            xml = z.read(n).decode("utf-8")
            paras = [html.unescape("".join(re.findall(r"<a:t>([^<]*)</a:t>", p))) for p in re.findall(r"<a:p>.*?</a:p>", xml, re.S)]
            texts.append("\n".join(p for p in paras if p.strip()))
    all_text = squash("\n".join(texts))
    checked = 0
    for si, sec in enumerate(doc.get("sections") or []):
        for bi, b in enumerate(sec.get("blocks") or []):
            if b.get("type") != "code":
                continue
            for k, line in enumerate((b.get("body") or "").splitlines(), 1):
                plain = MARKS.sub("", line).replace("`", "")
                if not plain.strip():
                    continue
                checked += 1
                if squash(plain) not in all_text:
                    problems.append(f"sections[{si}].blocks[{bi}] {k}행이 슬라이드에 없음: {plain.strip()[:60]}")
    with open(pptx + ".txt", "w", encoding="utf-8") as f:
        for i, t in enumerate(texts, 1):
            f.write(f"===== SLIDE {i} =====\n{t}\n\n")
    for p in problems:
        print("문제:", p)
    print(f"PPT 점검: 슬라이드 {len(slides)}장, 코드 {checked}줄 확인, 문제 {len(problems)}개 (텍스트: {pptx}.txt)")
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
