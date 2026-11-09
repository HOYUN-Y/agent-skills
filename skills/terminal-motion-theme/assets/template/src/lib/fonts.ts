// 테마 글꼴을 public/fonts에서 불러온다(라이선스: public/fonts/licenses). 다 불러오기 전에는 렌더하지 않는다.
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

const FACES: [family: string, file: string, weight: string][] = [
  ['Pretendard', 'fonts/Pretendard-Regular.woff2', '400'],
  ['Pretendard', 'fonts/Pretendard-SemiBold.woff2', '600'],
  ['Pretendard', 'fonts/Pretendard-Bold.woff2', '700'],
  ['JetBrains Mono', 'fonts/JetBrainsMono-Regular.woff2', '400'],
  ['JetBrains Mono', 'fonts/JetBrainsMono-SemiBold.woff2', '600'],
  ['JetBrains Mono', 'fonts/JetBrainsMono-Bold.woff2', '700'],
  ['Silkscreen', 'fonts/Silkscreen-Regular.woff2', '400'],
  ['Silkscreen', 'fonts/Silkscreen-Bold.woff2', '700'],
  ['Galmuri11', 'fonts/Galmuri11.woff2', '400'],
  ['Galmuri11', 'fonts/Galmuri11-Bold.woff2', '700'],
];

const handle = delayRender('Loading theme fonts');
Promise.all(
  FACES.map(([family, file, weight]) =>
    new FontFace(family, `url('${staticFile(file)}') format('woff2')`, {weight}).load().then((face) => {
      document.fonts.add(face);
    }),
  ),
)
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
