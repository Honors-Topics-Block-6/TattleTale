import { useMemo } from 'react';
import { formatTimeMs, useSnakeGameCanvasEngine } from './snakeGame';

export default function SnakeGameView(props) {
  const engine = useSnakeGameCanvasEngine(props);

  const {
    title,
    canvasRef,
    containerRef,
    fieldWrapRef,
    palette,
    status,
    score,
    timeLeftMs,
    targetFood,
    showGoal,
    showTime,
    timeLimitMs,
    fieldW,
    fieldH,
    banner,
    begin,
    reset,
    handleKeyDown,
  } = engine;

  const footerLabel = useMemo(() => {
    if (status === 'idle') return 'Start';
    if (status === 'running') return null;
    return 'Retry';
  }, [status]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '100%',
        background: palette.windowBg,
        padding: 10,
        boxSizing: 'border-box',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        color: palette.text,
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          background: palette.headerBg,
          color: palette.headerText,
          padding: '4px 8px',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: `1px solid ${palette.borderMid}`,
          boxShadow: `inset 1px 1px 0 ${palette.borderLight}, inset -1px -1px 0 ${palette.borderDark}`,
        }}
      >
        <span>{title}</span>
        <span style={{ fontWeight: 'normal', opacity: 0.95 }}>
          Score: <b>{score}</b>
          {showGoal && targetFood != null ? (
            <>
              {' '}
              / <b>{targetFood}</b>
            </>
          ) : null}
          {showTime && timeLimitMs != null ? (
            <>
              {' '}
              | Time: <b>{formatTimeMs(timeLeftMs)}</b>
            </>
          ) : null}
        </span>
      </div>

      <div
        ref={fieldWrapRef}
        style={{
          flex: 1,
          background: palette.panelBg,
          padding: 10,
          border: `1px solid ${palette.borderMid}`,
          boxShadow: `inset 1px 1px 0 ${palette.borderLight}, inset -1px -1px 0 ${palette.borderDark}`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          minHeight: 240,
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              padding: 2,
              background: palette.windowBg,
              boxShadow: `inset 1px 1px 0 ${palette.borderLight}, inset -1px -1px 0 ${palette.borderDark}`,
            }}
          >
            <div style={{ width: fieldW, height: fieldH, background: palette.fieldBg, position: 'relative' }}>
              <canvas
                ref={canvasRef}
                style={{ width: fieldW, height: fieldH, display: 'block', imageRendering: 'pixelated' }}
              />
            </div>
          </div>

          {banner ? (
            <div
              style={{
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: 8,
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                fontSize: 11,
              }}
            >
              {banner}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ opacity: 0.9 }}>
          <b>Controls:</b> Arrow keys • <b>Start/Retry:</b> Enter
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {footerLabel ? (
            <button type="button" onClick={() => begin()} style={btnStyle}>
              {footerLabel}
            </button>
          ) : null}
          <button type="button" onClick={() => reset()} style={btnStyle}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  minWidth: 90,
  padding: '3px 12px',
  border: '1px solid #7f9db9',
  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
  cursor: 'pointer',
  fontFamily: 'Tahoma, sans-serif',
  fontSize: 11,
};

