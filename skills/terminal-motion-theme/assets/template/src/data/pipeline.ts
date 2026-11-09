// 주인공 시각물(단계 파이프라인) — 연출 수정 지점. data/hero.ts의 heroKind가 'pipeline'일 때 쓴다.
// 과정·순서가 이야기의 중심이면 이 형태를 쓴다(도구 체인, 제작 단계, 처리 파이프라인). 예시: 릴리스 점검(가상).
import {dataColors} from '../config/theme';
import {T} from '../config/timeline';
import type {PipelineConfig} from './types';

export const pipeline: PipelineConfig = {
  title: 'pipeline',
  stages: [
    {key: 'scan', label: 'SCAN', span: T.scan, colors: dataColors.blue},
    {key: 'test', label: 'TEST', span: {start: T.test.start, end: T.testPass}, colors: dataColors.violet},
    {key: 'fix', label: 'FIX', span: T.fix, colors: dataColors.rose},
    {key: 'ship', label: 'SHIP', span: T.ship, colors: dataColors.mint},
  ],
  marks: [
    {at: T.changed[2], stage: 'scan', label: '3 files', kind: 'info'},
    {at: T.testFail, stage: 'test', label: '1 failed', kind: 'fail', until: T.testPass},
    {at: T.testPass, stage: 'test', label: '213 passed', kind: 'ok'},
    {at: T.fixType.end, stage: 'fix', label: 'prorate()', kind: 'info'},
    {at: T.tag, stage: 'ship', label: 'v2.4.0', kind: 'ok'},
  ],
  status: [
    {start: T.scan.start, end: T.scan.end, text: 'scan · changed files'},
    {start: T.test.start, end: T.testPass + 14, text: 'test → fix → rerun'},
    {start: T.ship.start, end: T.allDone, text: 'ship · v2.4.0'},
  ],
};
