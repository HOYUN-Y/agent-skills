// 주인공 시각물 고르기: data/hero.ts의 heroKind에 따라 픽셀 네트워크(관계·구조) 또는 단계 파이프라인(과정·순서).
// 새 시각물을 더할 때도 이 파일에 이어 붙인다: 그리기, 마무리 픽셀 출발점(points), 창 제목줄 meta.
import React from 'react';
import {Layout} from '../config/layout';
import {hero, heroKind} from '../data/hero';
import {pipeline} from '../data/pipeline';
import {video} from '../data/scenario';
import {fmtN} from '../lib/anim';
import {heroPoints, heroStats, PixelNetwork} from './PixelNetwork';
import {pipelinePoints, PixelPipeline} from './PixelPipeline';

export const heroTitle = heroKind === 'pipeline' ? pipeline.title : hero.title;

// 창 제목줄 오른쪽. 실제 기록 영상(record)에서는 자동 생성된 개수를 보이지 않는다
export const heroMeta = (frame: number) => {
  if (heroKind === 'pipeline') return `${pipeline.stages.length} stages`;
  if (video.mode === 'record') return 'illustrative';
  const s = heroStats(frame);
  return `${fmtN(s.nodes)} nodes · ${fmtN(s.edges)} links`;
};

export const heroFinalePoints = (frame: number, w: number, h: number, L: Layout) =>
  heroKind === 'pipeline' ? pipelinePoints(frame, w, h, L.t.heroLabel) : heroPoints(frame, w, h);

export const HeroView: React.FC<{frame: number; w: number; h: number; L: Layout}> = ({frame, w, h, L}) =>
  heroKind === 'pipeline' ? (
    <PixelPipeline frame={frame} w={w} h={h} labelSize={L.t.heroLabel} small={L.t.small} />
  ) : (
    <PixelNetwork frame={frame} w={w} h={h} labelSize={L.t.heroLabel} small={L.t.small} legend={L.legend} hud={L.legend} />
  );
