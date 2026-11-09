// 주인공 시각물(픽셀 네트워크) — 연출 수정 지점. 예시: 저장소 모듈 그래프(가상, 노드 = 파일).
// 노드 배치는 시드로 고정 생성된다. 이야기에 나오는 노드(story)·새로 생기는 노드(added)에만 이름을 붙인다.
import {dataColors} from '../config/theme';
import {T} from '../config/timeline';
import type {HeroConfig} from './types';

// 주인공 시각물 종류: 'network' = 관계·구조(이 파일의 hero), 'pipeline' = 과정·순서(data/pipeline.ts)
export const heroKind = 'network' as 'network' | 'pipeline';

export const hero: HeroConfig = {
  title: 'module-graph',
  groups: [
    {key: 'core', label: 'core', count: 170, colors: dataColors.blue},
    {key: 'api', label: 'api', count: 140, colors: dataColors.violet},
    {key: 'ui', label: 'ui', count: 150, colors: dataColors.mint},
    {key: 'tests', label: 'tests', count: 90, colors: dataColors.rose},
  ],
  story: [
    {key: 'billing', group: 'core', label: 'core/billing.ts'},
    {key: 'auth', group: 'api', label: 'api/auth.ts'},
    {key: 'button', group: 'ui', label: 'ui/Button.tsx'},
    {key: 'billingTest', group: 'tests', label: 'tests/billing.test.ts'},
  ],
  links: [['billingTest', 'billing']],
  added: [{key: 'release', label: 'v2.4.0', near: ['billing', 'auth', 'button'], at: T.tag, links: ['auth', 'billing', 'button']}],
  windows: [
    {start: T.changed[0], end: T.scan.end + 6, sel: ['auth']},
    {start: T.changed[1], end: T.scan.end + 6, sel: ['billing']},
    {start: T.changed[2], end: T.scan.end + 6, sel: ['button']},
    {start: T.testFail, end: T.testPass + 14, sel: ['billingTest', 'billing'], edges: [['billingTest', 'billing']]},
    {
      start: T.tag,
      end: T.allDone + 6,
      sel: ['release'],
      lit: ['auth', 'billing', 'button'],
      edges: [
        ['release', 'auth'],
        ['release', 'billing'],
        ['release', 'button'],
      ],
    },
  ],
  flows: [
    {start: T.testFail, end: T.testPass + 14, path: ['billingTest', 'billing']},
    {start: T.tag + 24, end: T.allDone + 6, path: ['release', 'auth']},
    {start: T.tag + 24, end: T.allDone + 6, path: ['release', 'billing']},
    {start: T.tag + 24, end: T.allDone + 6, path: ['release', 'button']},
  ],
  shots: [
    {at: 0, zoom: 1},
    {at: T.changed[0] - 8, focus: ['auth', 'billing', 'button'], zoom: 1.08},
    {at: T.testFail - 10, focus: ['billingTest', 'billing'], zoom: 1.6},
    {at: T.testPass + 14, zoom: 1},
    {at: T.tag - 8, focus: ['release', 'auth', 'billing', 'button'], zoom: 1.15},
    {at: T.allDone + 8, zoom: 1},
  ],
  status: [
    {start: T.scan.start, end: T.scan.end, text: 'scan · changed files'},
    {start: T.test.start, end: T.testPass + 14, text: 'test · billing.test.ts → core/billing.ts'},
    {start: T.ship.start, end: T.allDone, text: 'ship · v2.4.0 → 3 changes'},
  ],
};
