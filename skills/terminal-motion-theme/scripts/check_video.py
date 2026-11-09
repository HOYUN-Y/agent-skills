#!/usr/bin/env python3
"""렌더한 영상의 규격과 '한 프레임에 튀는 변화'를 검사한다(표준 라이브러리 + ffmpeg/ffprobe).

사용:
  python3 -I check_video.py <영상.mp4> [--expect 1920x1080@30:600] [--sheet out.png] [--top 12]
  python3 -I check_video.py --selftest

- 규격: 해상도·fps·프레임 수·코덱·픽셀 형식을 출력하고 --expect와 다르면 종료 코드 1.
- 튐: 프레임을 작은 회색조(160폭)로 줄여 앞 프레임과의 평균 차이를 재고, 주변 프레임보다 크게 튀는 프레임을 나열한다.
  이름표가 한 번에 자리를 바꾸거나, 창이 한 프레임에 켜지고 꺼지는 곳을 찾는 데 쓴다. 의도한 장면 전환도 함께 나오므로
  목록의 타임코드를 실제 프레임으로 열어 보고 판단한다(자동 판정 아님).
- --sheet: 1초마다 한 장씩 모은 접촉 시트(PNG)를 만든다.
"""
import argparse
import json
import subprocess
import sys

W = 160


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
         'stream=width,height,r_frame_rate,nb_read_frames,codec_name,pix_fmt', '-of', 'json', path],
        check=True, capture_output=True, text=True).stdout
    s = json.loads(out)['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return {'width': s['width'], 'height': s['height'], 'fps': round(int(num) / int(den), 3),
            'frames': int(s['nb_read_frames']), 'codec': s['codec_name'], 'pix_fmt': s['pix_fmt']}


def diffs(path, width, height):
    h = max(2, round(height * W / width / 2) * 2)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{h},format=gray', '-f', 'rawvideo', '-'],
                         check=True, capture_output=True).stdout
    n = W * h
    frames = [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]
    return [0.0] + [sum(abs(a - b) for a, b in zip(frames[i - 1], frames[i])) / n for i in range(1, len(frames))]


def spikes(d, top, floor=0.8):
    """주변 ±6프레임 중앙값보다 3배 이상, 그리고 floor 이상 큰 변화."""
    out = []
    for i in range(1, len(d)):
        around = sorted(d[max(1, i - 6):i] + d[i + 1:i + 7]) or [0.0]
        med = around[len(around) // 2]
        if d[i] >= floor and d[i] >= 3 * max(med, 0.05):
            out.append((d[i] / max(med, 0.05), i, d[i]))
    return sorted(out, reverse=True)[:top]


def sheet(path, out, fps):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf',
                    f"select='not(mod(n\\,{int(round(fps))}))',scale=480:-2,tile=5x4:padding=6:color=0x0B1220",
                    '-frames:v', '1', out], check=True)


def selftest():
    d = [0.0, 0.2, 0.2, 0.25, 0.2, 5.0, 0.2, 0.2, 0.3, 0.2, 0.2]
    s = spikes(d, 5)
    assert s and s[0][1] == 5, s
    assert not spikes([0.0] + [1.0] * 20, 5), '고른 움직임은 튐이 아니다'
    print('selftest ok')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video', nargs='?')
    ap.add_argument('--expect', help='예: 1920x1080@30:600')
    ap.add_argument('--sheet')
    ap.add_argument('--top', type=int, default=12)
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.video:
        ap.error('영상 경로가 필요합니다')
    info = probe(a.video)
    print('규격:', f"{info['width']}x{info['height']} {info['fps']}fps {info['frames']}프레임 {info['codec']} {info['pix_fmt']}")
    bad = False
    if a.expect:
        size, rest = a.expect.split('@')
        fps, frames = rest.split(':')
        want = (size, float(fps), int(frames))
        got = (f"{info['width']}x{info['height']}", info['fps'], info['frames'])
        if want != got:
            print('  기대와 다름:', want, '≠', got)
            bad = True
        else:
            print('  기대 규격과 같음')
    d = diffs(a.video, info['width'], info['height'])
    print(f'튐 후보(주변보다 3배 이상 큰 프레임 변화, 큰 순 {a.top}개):')
    for ratio, i, v in spikes(d, a.top):
        print(f'  프레임 {i:4d} ({i / info["fps"]:5.2f}초)  변화 {v:5.2f}  주변 대비 {ratio:4.1f}배')
    if a.sheet:
        sheet(a.video, a.sheet, info['fps'])
        print('접촉 시트:', a.sheet)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
