// 한 장면을 화면비에 맞는 배치로 그린다(가로·세로 같은 코드). 배치는 config/layout.ts, 내용은 data/.
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {theme} from './config/theme';
import {T} from './config/timeline';
import {inner, useLayout} from './config/layout';
import {ActorCards, Band, Footer, Header, StageTitle} from './components/Chrome';
import {FinaleLogo} from './components/FinaleLogo';
import {Panel} from './components/Panel';
import {heroFinalePoints, heroMeta, heroTitle, HeroView} from './components/Hero';
import {DoneBadge, FilePanel, LogPanel, OutputPanel, SwapPanel, TreePanel} from './components/Windows';
import {lin} from './lib/anim';

export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const fade = 1 - lin(frame, T.finale, T.finale + 16); // 마무리 시작에 대시보드가 사라진다
  const hi = inner(L.hero, L);
  const finalePoints = frame >= T.finale ? heroFinalePoints(T.finale, hi.w, hi.h, L).map((p) => ({...p, x: p.x + hi.x, y: p.y + hi.y})) : [];

  return (
    <AbsoluteFill style={{background: theme.navy800, fontFamily: theme.mono, color: theme.slate300}}>
      <Band L={L} />
      <Header frame={frame} L={L} fade={fade} />
      <div style={{position: 'absolute', inset: 0, opacity: fade}}>
        <StageTitle frame={frame} L={L} />
        <ActorCards frame={frame} L={L} />
        <TreePanel frame={frame} L={L} />
        <Panel title={heroTitle} meta={heroMeta(frame)} {...L.hero} active={frame >= T.intro.end && frame < T.allDone}>
          <HeroView frame={frame} w={hi.w} h={hi.h} L={L} />
        </Panel>
        {L.swap ? (
          <SwapPanel frame={frame} L={L} />
        ) : (
          <>
            <FilePanel frame={frame} L={L} />
            <OutputPanel frame={frame} L={L} />
          </>
        )}
        <LogPanel frame={frame} L={L} doneBadge={<DoneBadge frame={frame} L={L} />} />
      </div>
      <Footer frame={frame} L={L} fade={fade} />
      <FinaleLogo frame={frame} L={L} points={finalePoints} />
    </AbsoluteFill>
  );
};
