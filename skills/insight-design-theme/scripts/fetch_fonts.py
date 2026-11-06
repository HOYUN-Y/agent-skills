"""assets/fonts/fonts.json에 적힌 글꼴을 받아 검증값(sha256)을 확인한다. 표준 라이브러리만 쓴다.

사용:
  python3 -I fetch_fonts.py            # PDF용 웹 글꼴 → assets/fonts/web/ (코드용 복사 보정본도 만든다)
  python3 -I fetch_fonts.py --desktop  # PPT용 OTF/TTF → assets/fonts/desktop/ (설치는 하지 않는다)
  python3 -I fetch_fonts.py --check    # 받지 않고 있는지·맞는지만 확인 (없거나 다르면 종료 코드 1)
  python3 -I fetch_fonts.py --selftest # 복사 보정 함수 자체 테스트(글꼴 파일 없이)

복사 보정본(*-CopySafe.ttf):
  macOS·iOS PDFKit은 PDF에서 글자를 복사할 때, 나란한 두 글자의 세로 범위(글리프 경계 상자)가 겹치지 않으면
  그 사이에 줄바꿈을 넣는다. 예: "- .env"(가운데 '-'와 바닥 '.'), "a.~b", "x-.ics", "- 'a'". 원문 프롬프트를
  복사해 쓰는 독자에게는 줄이 갈라진 텍스트가 된다. 보정본은 코드 글꼴의 모든 글리프 경계 상자 값을 같은 세로 띠
  (-0.24em ~ 0.76em)까지 넓힌다. 윤곽선은 그대로라 화면·인쇄 모양은 같고, 경계 상자 값만 바뀐다.
  원본 파일은 고치지 않는다(DejaVu 라이선스는 이름에 Bitstream·Vera가 없으면 수정본을 허용한다).
"""
import argparse
import hashlib
import json
import struct
import sys
import urllib.request
from pathlib import Path

FONTS = Path(__file__).resolve().parents[1] / "assets" / "fonts"
COPY_SAFE = {"DejaVuSansMono.ttf": "DejaVuSansMono-CopySafe.ttf", "DejaVuSansMono-Bold.ttf": "DejaVuSansMono-Bold-CopySafe.ttf"}
BAND = (-0.24, 0.76)  # em 단위 세로 띠. 줄 높이(1.55)보다 충분히 작아 위아래 줄과는 겹치지 않는다


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _sum32(data):
    data = data + b"\0" * (-len(data) % 4)
    return sum(struct.unpack(f">{len(data) // 4}I", data)) & 0xFFFFFFFF


def copy_safe(data):
    """TrueType(glyf) 글꼴의 모든 글리프 경계 상자를 BAND까지 넓힌 사본을 돌려준다."""
    b = bytearray(data)
    tables = {}
    for i in range(struct.unpack(">H", b[4:6])[0]):
        rec = 12 + 16 * i
        tag, _, off, ln = struct.unpack(">4sIII", b[rec:rec + 16])
        tables[tag.decode("latin-1")] = (rec, off, ln)
    for need in ("head", "maxp", "loca", "glyf"):
        if need not in tables:
            raise ValueError(f"TrueType 표 '{need}'가 없음")
    head = tables["head"][1]
    upm = struct.unpack(">H", b[head + 18:head + 20])[0]
    long_loca = struct.unpack(">h", b[head + 50:head + 52])[0] == 1
    glyphs = struct.unpack(">H", b[tables["maxp"][1] + 4:tables["maxp"][1] + 6])[0]
    loca, glyf = tables["loca"][1], tables["glyf"][1]
    if long_loca:
        offs = struct.unpack(f">{glyphs + 1}I", b[loca:loca + 4 * (glyphs + 1)])
    else:
        offs = [2 * o for o in struct.unpack(f">{glyphs + 1}H", b[loca:loca + 2 * (glyphs + 1)])]
    lo, hi = round(BAND[0] * upm), round(BAND[1] * upm)
    for g in range(glyphs):
        if offs[g + 1] <= offs[g]:
            continue  # 빈 글리프(공백 등)
        o = glyf + offs[g]
        ymin, = struct.unpack(">h", b[o + 4:o + 6])
        ymax, = struct.unpack(">h", b[o + 8:o + 10])
        b[o + 4:o + 6] = struct.pack(">h", min(ymin, lo))
        b[o + 8:o + 10] = struct.pack(">h", max(ymax, hi))
    # 표 검사합과 head.checkSumAdjustment를 다시 계산한다
    b[head + 8:head + 12] = b"\0\0\0\0"
    for tag in ("glyf", "head"):
        rec, off, ln = tables[tag]
        b[rec + 4:rec + 8] = struct.pack(">I", _sum32(bytes(b[off:off + ln])))
    b[head + 8:head + 12] = struct.pack(">I", (0xB1B0AFBA - _sum32(bytes(b))) & 0xFFFFFFFF)
    return bytes(b)


def ensure_copy_safe(dest, check):
    bad = []
    for src, out in COPY_SAFE.items():
        s, d = dest / src, dest / out
        if not s.exists():
            continue  # 원본이 없으면 위에서 이미 실패로 잡힌다
        want = copy_safe(s.read_bytes())
        if d.exists() and d.read_bytes() == want:
            continue
        if check:
            bad.append(out + " (복사 보정본)")
            continue
        d.write_bytes(want)
        print("만듦", out)
    return bad


def selftest():
    # 글리프 2개(점 하나짜리, 빈 글리프)를 가진 최소 TrueType 조각으로 경계 상자 확장을 확인한다
    upm = 1000
    glyph = struct.pack(">hhhhh", 1, 0, 0, 100, 100) + b"\0" * 8
    tabs = {
        "head": struct.pack(">IIII", 0x10000, 0, 0, 0x5F0F3CF5) + struct.pack(">HH", 0, upm) + b"\0" * 28 + struct.pack(">hhh", 0, 1, 0),
        "maxp": struct.pack(">IH", 0x5000, 2),
        "loca": struct.pack(">III", 0, len(glyph), len(glyph)),
        "glyf": glyph,
    }
    n, off, recs, body = len(tabs), 12 + 16 * len(tabs), b"", b""
    for tag, data in tabs.items():
        recs += struct.pack(">4sIII", tag.encode(), 0, off + len(body), len(data))
        body += data + b"\0" * (-len(data) % 4)
    font = struct.pack(">IHHHH", 0x10000, n, 0, 0, 0) + recs + body
    out = copy_safe(font)
    g = out.index(glyph[:2] + struct.pack(">hh", 0, -240))  # yMin이 -0.24em으로
    assert struct.unpack(">h", out[g + 8:g + 10])[0] == 760, "yMax가 0.76em으로 넓어지지 않음"
    assert len(out) == len(font), "파일 길이가 바뀜"
    assert _sum32(out) == 0xB1B0AFBA, "검사합 보정이 틀림"
    print("fetch_fonts 자체 테스트 통과")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desktop", action="store_true", help="PPT용 데스크톱 글꼴")
    ap.add_argument("--check", action="store_true", help="받지 않고 확인만")
    ap.add_argument("--selftest", action="store_true", help="복사 보정 자체 테스트")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    kind = "desktop" if args.desktop else "web"
    items = json.loads((FONTS / "fonts.json").read_text(encoding="utf-8"))[kind]
    dest = FONTS / kind
    dest.mkdir(exist_ok=True)
    bad = []
    for it in items:
        path = dest / it["file"]
        if path.exists() and sha256(path) == it["sha256"]:
            continue
        if args.check:
            bad.append(it["file"])
            continue
        req = urllib.request.Request(it["url"], headers={"User-Agent": "insight-design-theme/1.0"})
        with urllib.request.urlopen(req, timeout=120) as res:
            data = res.read()
        if hashlib.sha256(data).hexdigest() != it["sha256"]:
            bad.append(it["file"] + " (검증값 불일치: 배포처 파일이 바뀌었을 수 있음)")
            continue
        path.write_bytes(data)
        print("받음", it["file"])
    if kind == "web":
        bad += ensure_copy_safe(dest, args.check)
    if bad:
        print(("없음/불일치: " if args.check else "실패: ") + ", ".join(bad), file=sys.stderr)
        sys.exit(1)
    print(f"{kind} 글꼴 {len(items)}개 준비됨: {dest}")


if __name__ == "__main__":
    main()
