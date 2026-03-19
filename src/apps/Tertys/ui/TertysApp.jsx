import { useEffect, useMemo, useRef, useState } from 'react';
import useWindowStore from '../../../os/store/windowStore';
import { createTertysEngine, getFallIntervalMs } from '../game/engine';
import { renderBoardCanvas, renderNextCanvas } from '../render/canvasRenderer';
import { playGameOver, playLanding, playLineClear } from '../audio/sounds';

import './tertys.css';

const HIGH_SCORE_KEY = 'tetris_high_score_v1';
const OLD_HIGH_SCORE_KEY = 'tertys_high_score_v1';

export default function TertysApp({ windowId }) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = createTertysEngine();

  const activeWindowId = useWindowStore((s) => s.activeWindowId);
  const win = useWindowStore((s) => s.windows[windowId]);
  const isActive = activeWindowId === windowId;
  const isMinimized = !!win?.minimized;

  const [snap, setSnap] = useState(() => engineRef.current.snapshot());
  const [highScore, setHighScore] = useState(() => {
    try {
      const current = localStorage.getItem(HIGH_SCORE_KEY);
      if (current != null) return Number(current || 0) || 0;

      // Migrate old score forward (one-way).
      const old = localStorage.getItem(OLD_HIGH_SCORE_KEY);
      const oldNum = Number(old || 0) || 0;
      if (oldNum > 0) {
        localStorage.setItem(HIGH_SCORE_KEY, String(oldNum));
        localStorage.removeItem(OLD_HIGH_SCORE_KEY);
      }
      return oldNum;
    } catch {
      return 0;
    }
  });

  const boardCanvasRef = useRef(null);
  const nextCanvasRef = useRef(null);

  const statusText = useMemo(() => {
    if (snap.over) return 'Game over. Click “Restart Game”.';
    if (!isActive || isMinimized) return 'Paused (click the window to resume).';
    return `${snap.status}  ← → move, ↑ rotate, ↓ soft drop, Space hard drop.`;
  }, [snap.over, snap.status, isActive, isMinimized]);

  function applyResult(result) {
    if (!result) return;
    const events = result.events || [];

    const cleared = events.find((e) => e.type === 'LINE_CLEAR');
    const gameOver = events.find((e) => e.type === 'GAME_OVER');
    const locked = events.find((e) => e.type === 'LOCK');

    if (gameOver) playGameOver();
    else if (cleared) playLineClear(cleared.lines);
    else if (locked) playLanding();

    setSnap(result.snapshot || engineRef.current.snapshot());
  }

  function restart() {
    const s = engineRef.current.reset();
    setSnap(s);
  }

  // Gravity loop (paused when window isn't active).
  useEffect(() => {
    if (!isActive || isMinimized) return;
    if (snap.over) return;

    const interval = getFallIntervalMs(snap.level);
    const id = window.setInterval(() => {
      applyResult(engineRef.current.tickGravity());
    }, interval);

    return () => window.clearInterval(id);
  }, [isActive, isMinimized, snap.over, snap.level]);

  // High score persistence
  useEffect(() => {
    if (snap.score <= highScore) return;
    setHighScore(snap.score);
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(snap.score));
    } catch {
      // ignore
    }
  }, [snap.score, highScore]);

  // Keyboard controls (only when active)
  useEffect(() => {
    if (!isActive || isMinimized) return;

    const onKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

      if (e.code === 'Space' || e.key.startsWith('Arrow')) e.preventDefault();

      if (snap.over) {
        if (e.key === 'r' || e.key === 'R' || e.code === 'Enter') restart();
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          applyResult(engineRef.current.moveLeft());
          break;
        case 'ArrowRight':
          applyResult(engineRef.current.moveRight());
          break;
        case 'ArrowUp':
          applyResult(engineRef.current.rotateCW());
          break;
        case 'ArrowDown':
          applyResult(engineRef.current.softDrop());
          break;
        default:
          break;
      }

      if (e.code === 'Space') {
        applyResult(engineRef.current.hardDrop());
      }

      if (e.key === 'r' || e.key === 'R') restart();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, isMinimized, snap.over]);

  // Render canvases
  useEffect(() => {
    const getCellColor = engineRef.current.getCellColor;
    renderBoardCanvas({
      canvas: boardCanvasRef.current,
      snapshot: snap,
      cellSize: 20,
      getCellColor,
    });
    renderNextCanvas({
      canvas: nextCanvasRef.current,
      nextType: snap.next,
      cellSize: 16,
      getCellColor,
    });
  }, [snap]);

  return (
    <div className="tertys-root" data-window-id={windowId}>
      <div className="tertys-topbar">
        <div className="tertys-topbar-left">
          <div className="tertys-highscore">
            <div className="tertys-label">High Score</div>
            <div className="tertys-value">{highScore}</div>
          </div>
        </div>
        <div className="tertys-topbar-right">
          <button className="tertys-btn" onClick={restart}>
            Restart Game
          </button>
        </div>
      </div>

      <div className="tertys-body">
        <div className="tertys-game">
          <div className="tertys-frame">
            <canvas ref={boardCanvasRef} className="tertys-board" />
          </div>
        </div>

        <div className="tertys-side">
          <div className="tertys-group">
            <div className="tertys-group-title">Score</div>
            <div className="tertys-score">{snap.score}</div>
            <div className="tertys-meta">
              <div>
                <span className="tertys-meta-k">Level</span>
                <span className="tertys-meta-v">{snap.level}</span>
              </div>
              <div>
                <span className="tertys-meta-k">Lines</span>
                <span className="tertys-meta-v">{snap.lines}</span>
              </div>
            </div>
          </div>

          <div className="tertys-group">
            <div className="tertys-group-title">Next Block</div>
            <div className="tertys-next-frame">
              <canvas ref={nextCanvasRef} className="tertys-next" />
            </div>
          </div>

          <div className="tertys-group">
            <div className="tertys-group-title">Controls</div>
            <div className="tertys-controls">
              <div>
                <b>←</b>/<b>→</b> Move
              </div>
              <div>
                <b>↑</b> Rotate
              </div>
              <div>
                <b>↓</b> Soft drop
              </div>
              <div>
                <b>Space</b> Hard drop
              </div>
              <div className="tertys-controls-muted">
                <b>R</b> Restart
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tertys-statusbar">
        <div className="tertys-status-text">{statusText}</div>
        <div className="tertys-status-right">
          {snap.over ? 'Stopped' : !isActive || isMinimized ? 'Paused' : `Speed ${getFallIntervalMs(snap.level)}ms`}
        </div>
      </div>
    </div>
  );
}

