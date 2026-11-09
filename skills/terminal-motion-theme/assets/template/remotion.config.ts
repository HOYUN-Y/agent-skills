import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setCrf(18);
Config.setOverwriteOutput(true);

// macOS 보호 폴더(~/Documents 등)에서 Chrome이 실패한 이력이 있어 ~/Library/Caches 사본을 우선 쓴다(scripts/setup-browser.sh).
const externalBrowser =
  process.env.REMOTION_BROWSER_EXECUTABLE ??
  path.join(os.homedir(), 'Library/Caches/terminal-motion/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if (fs.existsSync(externalBrowser)) {
  Config.setBrowserExecutable(externalBrowser);
}

// 주인공 시각물을 three.js(WebGL)로 바꿀 때 필요하다. 2D(SVG)만 쓰면 영향 없음.
Config.setChromiumOpenGlRenderer('angle');
