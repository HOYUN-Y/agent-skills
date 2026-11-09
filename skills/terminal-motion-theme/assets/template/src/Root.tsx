import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import {FPS} from './config/theme';
import {LANDSCAPE, PORTRAIT} from './config/layout';
import {T} from './config/timeline';
import './lib/fonts';

// 같은 장면을 두 화면비로 낸다. Landscape = 16:9(데스크톱·X·유튜브), Portrait = 9:16(릴스·쇼츠)
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Landscape" component={Main} width={LANDSCAPE.W} height={LANDSCAPE.H} fps={FPS} durationInFrames={T.end} />
    <Composition id="Portrait" component={Main} width={PORTRAIT.W} height={PORTRAIT.H} fps={FPS} durationInFrames={T.end} />
  </>
);
