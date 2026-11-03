#!/usr/bin/env node
/**
 * 시간 기반 프레임 캡처: 스크롤이 아니라 "시간"으로 진행되는 모션을 확인한다.
 * (로드 시 등장, 마키, 영상 배경, 호버 반응 등. 스크롤 연동은 shoot.mjs 를 쓴다.)
 *
 * 페이지를 열고 지정한 시점(ms)마다 화면을 찍어 컨택트 시트로 묶는다. 한 장의 스크린샷은
 * 애니메이션이 지나가는 도중의 한 순간일 뿐이라 검증이 되지 않는다.
 *
 *   node frames.mjs --url http://localhost:4500 --out lab/frames
 *   node frames.mjs --url ... --width 360 --height 740 --out lab/frames-mobile
 *   node frames.mjs --url ... --reduced-motion --out lab/frames-reduced
 *   node frames.mjs --url ... --at 0,150,300,600,1200,2400,4000 --hover ".cta"
 *   node frames.mjs --url ... --tab 3          # Tab 3번 뒤 포커스 상태를 focus.png 로
 *
 * 시점은 DOMContentLoaded 기준이다. 캡처 자체에 시간이 걸리므로 실제 시점을 report.json 에
 * 함께 적는다. 시점은 근사값이며 프레임 단위 정밀 비교용이 아니다.
 *
 * 보고 항목
 *   STUCK HIDDEN   마지막 프레임에서 화면 안 텍스트가 투명/숨김으로 남음 (복구 경로 누락)
 *   H-OVERFLOW     원치 않는 가로 스크롤
 *   STATIC AFTER   그 시점 이후 화면이 바뀌지 않음 (등장이 언제 끝나는지 확인용, 오류 아님)
 *   콘솔 오류·실패 요청
 *
 * playwright-core 는 빌드 폴더에 설치한다(설치 전 사용자 승인). 영상이 있는 페이지는 설치된
 * Chrome 이 필요하다(번들 Chromium 은 h264 를 못 그린다). SCROLLCRAFT_CHROME 으로 지정 가능.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const req = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
for (const name of ["playwright-core", "playwright"]) {
  try { ({ chromium } = req(name)); break; } catch {}
}
if (!chromium) {
  console.error("playwright-core not found. Run this in the build project after:\n  npm i playwright-core");
  process.exit(1);
}

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const URL = arg("--url", "http://localhost:4500");
const OUT = path.resolve(arg("--out", "lab/frames"));
const AT = arg("--at", "0,200,400,700,1000,1500,2500,4000").split(",").map(Number).sort((a, b) => a - b);
const W = parseInt(arg("--width", "1440"), 10);
const H = parseInt(arg("--height", "900"), 10);
const DPR = parseFloat(arg("--dpr", "1"));
const REDUCED = has("--reduced-motion");
const HOVER = arg("--hover", "");
const TAB = parseInt(arg("--tab", "0"), 10);   // 마지막 프레임 뒤 Tab 을 n번 눌러 포커스 상태를 찍는다

const CHROME = [
  process.env.SCROLLCRAFT_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].find((p) => p && fs.existsSync(p));
if (!CHROME) console.warn("installed Chrome not found; using bundled Chromium (video frames may not paint)");

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^\d\d\.png$/.test(f)) fs.rmSync(path.join(OUT, f));

const browser = await chromium.launch(CHROME ? { executablePath: CHROME, headless: true } : { headless: true });
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  reducedMotion: REDUCED ? "reduce" : "no-preference",
});

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));
const failed = [];
page.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText} ${r.url()}`));
page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

await page.goto(URL, { waitUntil: "domcontentloaded" });
const t0 = Date.now();

const frames = [];
let prevHash = "";
let staticSince = null;
for (const [i, t] of AT.entries()) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const actual = Date.now() - t0;
  const file = path.join(OUT, `${String(i).padStart(2, "0")}.png`);
  const buf = await page.screenshot({ path: file });
  const hash = crypto.createHash("sha1").update(buf).digest("hex");
  if (hash === prevHash) { if (staticSince === null) staticSince = frames[frames.length - 1].actual; }
  else staticSince = null;
  prevHash = hash;
  frames.push({ file: path.basename(file), target: t, actual });
}

// 마지막 프레임 기준 상태 점검
const state = await page.evaluate(() => {
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none") return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  };
  const hidden = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    const el = node.parentElement;
    if (!text || !el || seen.has(el) || el.closest("script,style,noscript,[aria-hidden='true'],[hidden]")) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
    const vis = getComputedStyle(el).visibility;
    const o = effOpacity(el);
    if (o < 0.1 || vis === "hidden") hidden.push({ text: text.slice(0, 40), opacity: +o.toFixed(2), visibility: vis });
  }
  const running = document.getAnimations().filter((a) => a.playState === "running")
    .map((a) => ({ name: a.animationName || a.constructor.name, infinite: a.effect?.getTiming().iterations === Infinity }));
  return {
    hidden,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    running,
  };
});

let focusFile = null;
if (TAB > 0) {
  for (let i = 0; i < TAB; i++) await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  focusFile = path.join(OUT, "focus.png");
  await page.screenshot({ path: focusFile });
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return a && a !== document.body ? `${a.tagName.toLowerCase()} "${(a.textContent || "").trim().slice(0, 30)}"` : "(none)";
  });
  console.log(`focus after ${TAB} Tab: ${focused}`);
}

let hoverFile = null;
if (HOVER) {
  const el = await page.$(HOVER);
  if (el) {
    await el.hover();
    await page.waitForTimeout(400);
    hoverFile = path.join(OUT, "hover.png");
    await page.screenshot({ path: hoverFile });
  } else console.log(`hover target not found: ${HOVER}`);
}

await browser.close();

const report = { url: URL, viewport: `${W}x${H}`, reduced: REDUCED, frames, staticSince, ...state, consoleErrors, failed };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

console.log(`frames: ${frames.map((f) => `${f.target}→${f.actual}ms`).join("  ")}`);
if (state.hidden.length)
  console.log("\nSTUCK HIDDEN (visible-area text still transparent at last frame):\n  " +
    state.hidden.map((h) => `o=${h.opacity} ${h.visibility} "${h.text}"`).join("\n  "));
if (state.overflowX > 1) console.log(`\nH-OVERFLOW: page is ${state.overflowX}px wider than the viewport`);
if (staticSince !== null) console.log(`\nSTATIC AFTER ~${staticSince}ms (no pixel change in later frames)`);
if (state.running.length)
  console.log(`\nstill running at last frame: ${state.running.map((a) => a.name + (a.infinite ? " (infinite)" : "")).join(", ")}`);
if (consoleErrors.length) console.log("\nCONSOLE ERRORS:\n  " + consoleErrors.join("\n  "));
if (failed.length) console.log("\nFAILED REQUESTS:\n  " + failed.join("\n  "));
if (!state.hidden.length && state.overflowX <= 1 && !consoleErrors.length && !failed.length)
  console.log("\nno stuck content, no horizontal overflow, no console errors");

// 컨택트 시트
const FFMPEG = [process.env.SCROLLCRAFT_FFMPEG, "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "ffmpeg"]
  .find((p) => p && (p === "ffmpeg" || fs.existsSync(p)));
if (FFMPEG) {
  const cols = Math.min(4, frames.length);
  const rows = Math.ceil(frames.length / cols);
  const r = spawnSync(FFMPEG, [
    "-y", "-v", "error", "-i", path.join(OUT, "%02d.png"),
    "-vf", `scale=480:-1,tile=${cols}x${rows}`, "-frames:v", "1", path.join(OUT, "sheet.png"),
  ]);
  if (r.status === 0) console.log(`\ncontact sheet: ${path.join(OUT, "sheet.png")}`);
  else console.log("\ncontact sheet skipped (needs a full ffmpeg build with scale/tile)");
}
if (focusFile) console.log(`focus frame: ${focusFile}`);
if (hoverFile) console.log(`hover frame: ${hoverFile}`);
console.log(`frames + report.json in ${OUT}`);
