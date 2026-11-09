// 영상 문구·모의 데이터 — 내용 수정 지점. 화면 글자는 짧게(세로 영상의 창 한 줄 = 고정폭 약 50자).
// 예시 주제: 릴리스 점검 에이전트 4개(가상 저장소). 모든 파일명·수치는 모의 데이터다.
import brandJson from './brand.json';
import {T} from '../config/timeline';
import type {Actor, Change, Doc, FocusWindow, Log, Metric, Output, Phase, Title, TreeItem} from './types';

// 브랜드: insight-design-theme 스킬의 assets/brand.json 사본(new_project.sh가 복사). handlePlaceholder가 true면 게시 전에 바꾼다.
export const brand = {
  name: brandJson.name.toUpperCase(),
  slug: brandJson.slug,
  handle: brandJson.handle,
  handlePlaceholder: brandJson.handlePlaceholder,
  tagline: brandJson.tagline,
};

// mode: 'demo' = 모의 데이터(수치를 지어내도 되지만 DEMO 표시를 계속 보인다)
//       'record' = 실제 기록 영상(화면의 모든 수치가 출처에 있어야 한다. 재생 시계·로그 시각·토큰·자동 생성 개수를 숨긴다)
export const video: {mode: 'demo' | 'record'; path: string; badge: string; idle: string; closing: string; doneBadge: string} = {
  mode: 'demo',
  path: '~/demo/release-check', // 머리줄 경로(16:9)
  // record면 출처를 쓴다(예: 'README 기록'). 순서·명령을 원본에서 재구성했으면 그것도 쓴다(예: 'README 기록 · 순서 재구성')
  badge: 'DEMO · SIMULATED DATA',
  idle: '$ cd ~/demo/release-check', // 첫 단계 전 빈 창에 보이는 주제 고유의 첫 줄(자리표시 문구 대신)
  closing: 'release check · scan → test → ship', // 로고 아래 한 줄
  doneBadge: 'ALL AGENTS DONE',
};

export const titles: Title[] = [
  {at: -30, title: 'RELEASE CHECK', tag: '4 agents · v2.4.0 candidate'},
  {at: T.scan.start, title: '01 SCAN', tag: 'git diff → 3 changed files'},
  {at: T.test.start, title: '02 TEST', tag: '1 fail → fix → 213 pass'},
  {at: T.ship.start, title: '03 SHIP', tag: 'notes → tag v2.4.0'},
  {at: T.allDone, title: 'DONE', tag: '213/213 tests · 3 changes shipped'},
];

export const phases: Phase[] = [
  {label: 'scan', start: T.scan.start, end: T.test.start},
  {label: 'test', start: T.test.start, end: T.ship.start},
  {label: 'ship', start: T.ship.start, end: T.allDone},
];

export const actors: Actor[] = [
  {
    id: 'scanner',
    name: 'SCANNER',
    span: T.scan,
    steps: [
      [T.scan.start, 'open git diff'],
      [T.changed[0], 'list changed files'],
      [T.changed[2] + 16, 'map to modules'],
    ],
    done: '3 files',
    rate: 142.3,
  },
  {
    id: 'tester',
    name: 'TESTER',
    span: T.test,
    steps: [
      [T.test.start, 'select specs'],
      [T.testType.end, 'run 213 specs'],
      [T.testFail, '1 failing'],
      [T.testPass, 'rerun → pass'],
    ],
    done: '213 passed',
    rate: 96.8,
  },
  {
    id: 'fixer',
    name: 'FIXER',
    span: T.fix,
    steps: [
      [T.fix.start, 'read failure'],
      [T.fixType.start, 'patch prorate()'],
      [T.fixType.end, 'request rerun'],
    ],
    done: '1 patch',
    rate: 118.5,
  },
  {
    id: 'writer',
    name: 'WRITER',
    span: T.ship,
    steps: [
      [T.ship.start, 'collect changes'],
      [T.notesType.start, 'write CHANGELOG'],
      [T.tag, 'tag v2.4.0'],
      [T.results, 'summarize'],
    ],
    done: 'v2.4.0',
    rate: 171.2,
  },
];

export const actorTokens = (frame: number) =>
  actors.map((a) => Math.floor((a.rate ?? 0) * Math.max(0, Math.min(frame, a.span.end) - a.span.start)));

export const metrics: Metric[] = [
  {
    label: 'CHANGED',
    width: 1,
    keys: [
      {at: T.changed[0], v: 1},
      {at: T.changed[1], v: 2},
      {at: T.changed[2], v: 3},
    ],
  },
  {
    label: 'TESTS',
    width: 3,
    keys: [
      {at: T.testType.end + 8, v: 212, ramp: 14},
      {at: T.testPass, v: 213},
    ],
  },
  {label: 'TOKENS', width: 6, value: (f) => actorTokens(f).reduce((s, v) => s + v, 0)},
];

export const tree: TreeItem[] = [
  {label: 'release-check/', depth: 0, dir: true},
  {label: 'CHANGELOG.md', depth: 1, key: 'changelog'},
  {label: 'core/', depth: 1, dir: true, group: 'core'},
  {label: 'billing.ts', depth: 2, key: 'billing'},
  {label: 'api/', depth: 1, dir: true, group: 'api'},
  {label: 'auth.ts', depth: 2, key: 'auth'},
  {label: 'ui/', depth: 1, dir: true, group: 'ui'},
  {label: 'Button.tsx', depth: 2, key: 'button'},
  {label: 'tests/', depth: 1, dir: true, group: 'tests'},
  {label: 'billing.test.ts', depth: 2, key: 'billingTest'},
  {label: 'tags/', depth: 1, dir: true},
  {label: 'v2.4.0', depth: 2, key: 'release', appearAt: T.tag},
];

export const treeFocus: FocusWindow[] = [
  {start: T.changed[0], end: T.scan.end, keys: ['auth']},
  {start: T.changed[1], end: T.scan.end, keys: ['billing']},
  {start: T.changed[2], end: T.scan.end, keys: ['button']},
  {start: T.testFail, end: T.testPass + 12, keys: ['billingTest', 'billing']},
  {start: T.notesType.start, end: T.allDone, keys: ['changelog']},
  {start: T.tag, end: T.allDone, keys: ['release']},
];

export const changes: Change[] = [
  {at: T.fixType.end, sign: '~', path: 'core/billing.ts', note: '+1 line'},
  {at: T.notesType.end, sign: '~', path: 'CHANGELOG.md', note: '+1 line'},
  {at: T.tag, sign: '+', path: 'tags/v2.4.0', note: 'new'},
];

export const docs: Doc[] = [
  {
    from: T.diffOpen,
    title: 'git diff --stat',
    meta: [
      [T.diffOpen, 'reading'],
      [T.scan.end, 'done'],
    ],
    scan: {start: T.diffOpen + 8, end: T.changed[2], to: 2},
    lines: [
      {text: 'api/auth.ts     | 12 +++---', mark: {at: T.changed[0], label: 'api'}},
      {text: 'core/billing.ts | 31 +++++--', mark: {at: T.changed[1], label: 'core'}},
      {text: 'ui/Button.tsx   |  4 ++--', mark: {at: T.changed[2], label: 'ui'}},
      {text: '3 files · +34 −13', kind: 'note'},
    ],
  },
  {
    from: T.fix.start,
    title: 'core/billing.ts',
    meta: [
      [T.fix.start, 'reading'],
      [T.fixType.start, 'writing'],
      [T.fixType.end, 'saved'],
    ],
    lines: [
      {text: 'export function prorate(plan, days) {', kind: 'code'},
      {text: '  if (days <= 0) return 0;', kind: 'code', added: T.fixType},
      {text: '  const rate = plan.price / 30;', kind: 'code'},
      {text: '  return round(rate * days, 2);', kind: 'code'},
      {text: '}', kind: 'code'},
    ],
  },
  {
    from: T.ship.start,
    title: 'CHANGELOG.md',
    meta: [
      [T.ship.start, 'reading'],
      [T.notesType.start, 'writing'],
      [T.notesType.end, 'saved'],
    ],
    lines: [
      {text: '# changelog', kind: 'h1'},
      {text: '## v2.4.0 · 2026-11-09', kind: 'h2'},
      {text: '- auth: refresh token on 401'},
      {text: '- ui: Button loading state'},
      {text: '- billing: zero-day proration fix', added: T.notesType},
      {text: '## v2.3.2', kind: 'h2'},
      {text: '- docs: SSO setup guide'},
    ],
  },
];

export const outputs: Output[] = [
  {
    from: T.test.start,
    title: 'test',
    meta: [
      [T.test.start, 'running'],
      [T.testFail, '1 failing'],
      [T.testPass, 'passed'],
    ],
    prompt: {text: 'npm test -- --changed', ...T.testType},
    lines: [
      {at: T.testType.end + 8, text: '212 passed', sub: 'api · ui · core', mark: 'ok'},
      {at: T.testFail, text: '1 failed · billing.test.ts', sub: 'prorate(plan, 0) → NaN', mark: 'fail'},
      {at: T.testPass, text: 'rerun · 213 passed', sub: 'after fix in core/billing.ts', mark: 'ok'},
    ],
  },
  {
    from: T.releaseType.start - 4,
    title: 'release',
    meta: [
      [T.releaseType.start - 4, 'running'],
      [T.allDone, 'shipped'],
    ],
    prompt: {text: 'release v2.4.0 --notes', ...T.releaseType},
    route: {at: T.releaseType.end + 2, steps: ['diff', 'tests', 'CHANGELOG.md']},
    lines: [
      {at: T.results, text: 'tagged v2.4.0 · 3 changes', sub: 'auth · billing · ui', mark: 'ok'},
      {at: T.results + 8, text: 'tests 213/213 passed', sub: 'coverage 87%', mark: 'ok', score: 0.87},
      {at: T.results + 16, text: 'notes written to CHANGELOG.md', sub: '+1 line', mark: 'info'},
    ],
  },
];

export const logs: Log[] = [
  {at: 14, tag: 'system', text: 'session start · release-check · demo'},
  {at: T.diffOpen, tag: 'scanner', text: 'git diff main...release/2.4 --stat'},
  {at: T.changed[0], tag: 'scanner', text: 'changed  api/auth.ts'},
  {at: T.changed[1], tag: 'scanner', text: 'changed  core/billing.ts'},
  {at: T.changed[2], tag: 'scanner', text: 'changed  ui/Button.tsx · 3 files'},
  {at: T.testType.end, tag: 'tester', text: 'run 213 specs (changed modules)'},
  {at: T.testFail, tag: 'tester', text: 'FAIL billing.test.ts › zero days'},
  {at: T.fix.start + 6, tag: 'fixer', text: 'read failure · prorate(plan, 0) → NaN'},
  {at: T.fixType.end, tag: 'fixer', text: 'patch core/billing.ts L2 · guard days'},
  {at: T.testPass, tag: 'tester', text: 'rerun · 213 passed · 0 failed'},
  {at: T.notesType.start, tag: 'writer', text: 'append CHANGELOG.md · v2.4.0'},
  {at: T.tag, tag: 'writer', text: 'tag v2.4.0 → 3 changes'},
  {at: T.results + 16, tag: 'writer', text: 'release summary ready'},
  {at: T.allDone, tag: 'system', text: 'run complete · 4/4 agents done'},
];
