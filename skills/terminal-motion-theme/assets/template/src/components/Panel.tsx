import React from 'react';
import {theme} from '../config/theme';
import {Rect, useLayout} from '../config/layout';

// 테마의 터미널 창: 제목줄(점 3개) + Navy 950 바탕. 직각, 그림자 없음.
// active = 지금 일하는 창: 첫 점이 금색, 테두리·제목이 밝아짐(쉬는 창의 첫 점은 슬레이트). 한 번에 1~2개만 active로 둔다.
// bodyStyle = 내용에만 주는 스타일(세로 창 교체에서 틀은 그대로 두고 내용만 바꿀 때)
type Props = Rect & {title: string; meta?: React.ReactNode; active?: boolean; children?: React.ReactNode; style?: React.CSSProperties; bodyStyle?: React.CSSProperties};

export const Panel: React.FC<Props> = ({title, meta, x, y, w, h, active, children, style, bodyStyle}) => {
  const L = useLayout();
  const dot = Math.round(L.t.barFont * 0.62);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        boxSizing: 'border-box',
        background: theme.navy950,
        border: `1px solid ${active ? theme.slate500 : theme.navy600}`,
        ...style,
      }}
    >
      <div
        style={{
          height: L.t.bar,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: dot * 0.75,
          padding: `0 ${L.t.barFont}px`,
          borderBottom: `1px solid ${theme.navy600}`,
          fontFamily: theme.mono,
          fontSize: L.t.barFont,
          color: theme.slate400,
          whiteSpace: 'nowrap',
        }}
      >
        <i style={{width: dot, height: dot, background: active ? theme.gold : theme.slate500, flex: 'none'}} />
        <i style={{width: dot, height: dot, background: theme.navy600, flex: 'none'}} />
        <i style={{width: dot, height: dot, background: theme.navy600, flex: 'none'}} />
        <span style={{marginLeft: dot, flex: '0 0 auto', maxWidth: '70%', color: active ? theme.ivory : theme.slate400, overflow: 'hidden', textOverflow: 'ellipsis'}}>{title}</span>
        {/* 공간이 모자라면 제목 대신 meta가 줄어든다 */}
        {meta ? <span style={{marginLeft: 'auto', paddingLeft: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'}}>{meta}</span> : null}
      </div>
      <div style={{position: 'relative', height: h - L.t.bar - 2, overflow: 'hidden', ...bodyStyle}}>{children}</div>
    </div>
  );
};
