"""PDF에 들어간 글꼴 목록을 출력한다. 사용: python3 -I tools/pdf_fonts.py <파일.pdf>

압축된 객체 스트림까지 풀어서 /Font 사전의 BaseFont와 Subtype을 찾는다(표준 라이브러리만 사용).
"""
import re
import sys
import zlib


def objects(data):
    # 일반 객체
    for m in re.finditer(rb"\d+\s+\d+\s+obj(.*?)endobj", data, re.S):
        body = m.group(1)
        yield body
        s = re.search(rb"stream\r?\n(.*?)\r?\nendstream", body, re.S)
        if s and b"/FlateDecode" in body:
            try:
                raw = zlib.decompress(s.group(1))
            except zlib.error:
                continue
            if b"/Type /ObjStm" in body or b"/Type/ObjStm" in body:
                yield raw  # 객체 스트림 안의 사전들


def main(path):
    data = open(path, "rb").read()
    fonts = set()
    for body in objects(data):
        for m in re.finditer(rb"<<[^<>]*?/Type\s*/Font(?![A-Za-z])[^<>]*?>>", body, re.S):  # FontDescriptor 제외
            d = m.group(0)
            sub = re.search(rb"/Subtype\s*/(\w+)", d)
            base = re.search(rb"/BaseFont\s*/([^\s/<>\[\]]+)", d)
            fonts.add(((sub.group(1).decode() if sub else "?"), (base.group(1).decode() if base else "(no BaseFont)")))
    subset_tag = re.compile(r"^[A-Z]{6}\+")
    for sub, base in sorted(fonts):
        print(f"{sub:12} {subset_tag.sub('', base)}")


if __name__ == "__main__":
    main(sys.argv[1])
