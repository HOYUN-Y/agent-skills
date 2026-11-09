// 움직임 어휘 — 모든 값은 프레임의 순수 함수(같은 프레임 = 같은 화면). 숫자는 references/direction.md의 기준과 같다.
import {Easing, interpolate} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 0→1 진행률, 끝에서 감속(ease-out cubic). 구간 밖은 고정
export const prog = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});

// 0→1 선형
export const lin = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], clamp);

// 0→1 가속 후 감속(카메라·픽셀 비행)
export const easeInOut = Easing.inOut(Easing.cubic);

// 튀어나오듯 등장(1을 살짝 넘었다가 돌아옴) — 새로 생긴 것 하나에만
export const popIn = (frame: number, at: number, dur = 14) =>
  interpolate(frame, [at, at + dur], [0, 1], {...clamp, easing: Easing.out(Easing.back(2.2))});

// 등장: 흐릿하다가 10px 아래에서 올라오며 나타남(12프레임)
export const appear = (frame: number, at: number, dur = 12) => {
  const p = prog(frame, at, at + dur);
  return {opacity: p, transform: `translateY(${(1 - p) * 10}px)`};
};

// 타이핑: 프레임에 맞춰 문자열 일부
export const typed = (text: string, frame: number, start: number, end: number) => {
  const n = Math.round(interpolate(frame, [start, end], [0, text.length], clamp));
  return text.slice(0, n);
};

// 깜빡이는 커서(15프레임 주기)
export const cursorOn = (frame: number) => Math.floor(frame / 15) % 2 === 0;

// 바뀐 곳 강조: 바뀐 순간 1 → dur 동안 0
export const flash = (frame: number, at: number, dur = 18) => (frame < at ? 0 : interpolate(frame, [at, at + dur], [1, 0], clamp));

// 강조 구간 가중치: start에서 ramp 동안 0→1, end 전 ramp 동안 1→0. 여러 구간이 겹치면 더하지 말고 최댓값을 쓴다.
export const windowWeight = (frame: number, start: number, end: number, ramp = 10) =>
  Math.min(lin(frame, start, start + ramp), 1 - lin(frame, end - ramp, end));

// 시점 목록에서 frame 이전 마지막 항목
export const latest = <X extends {at: number}>(list: readonly X[], frame: number): X | undefined => {
  let out: X | undefined;
  for (const x of list) if (frame >= x.at) out = x;
  return out;
};

export const fmtTime = (frame: number, fps: number) => {
  const s = frame / fps;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = (s % 60).toFixed(1).padStart(4, '0');
  return `${mm}:${ss}`;
};

export const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const fmtN = (n: number) => n.toLocaleString('en-US');
