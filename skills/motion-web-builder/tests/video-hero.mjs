import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../assets/examples/video-hero.html', import.meta.url), 'utf8');
assert.match(html, /id="plan"/);
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const initialReduced of [false, true]) {
  for (const frameCallback of [false, true]) {
    const events = {};
    const changes = {};
    const classes = new Set();
    const video = {
      dataset: { src: 'example.mp4' }, paused: true, readyState: 2,
      classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
      getAttribute: () => video.src,
      addEventListener: (name, fn) => { events[name] = fn; },
      play() { this.paused = false; events.playing(); return Promise.resolve(); },
      pause() { this.paused = true; },
    };
    if (frameCallback) video.requestVideoFrameCallback = fn => fn();
    const button = { hidden: true, addEventListener() {}, setAttribute() {} };
    const reduce = { matches: initialReduced, addEventListener: (_, fn) => { changes.reduce = fn; } };
    vm.runInNewContext(script, {
      document: { hidden: false, querySelector: s => s === 'video' ? video : button, addEventListener() {} },
      matchMedia: s => s.includes('reduced') ? reduce : { matches: false },
      IntersectionObserver: class { observe() {} },
    });
    if (initialReduced) assert.equal(video.src, undefined, '동작 감소로 시작하면 다운로드하지 않음');
    reduce.matches = false;
    changes.reduce();
    assert.equal(video.paused, false);
    assert.ok(classes.has('ready'));
    reduce.matches = true;
    changes.reduce();
    assert.equal(video.paused, true);
    assert.equal(classes.has('ready'), false);
    assert.equal(button.hidden, true);
    reduce.matches = false;
    changes.reduce();
    assert.equal(video.paused, false);
    assert.ok(classes.has('ready'), '설정 해제 후 영상 표시 복구');
    assert.equal(button.hidden, false, '정지 버튼 복구');
  }
}
console.log('PASS: video-hero 상태 전환 4가지 및 CTA 목적지');
