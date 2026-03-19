import { useEffect, useMemo, useRef, useState } from 'react';
import useWindowStore from '../../os/store/windowStore';

const gridSize = 4; // 4x4 classic-ish variant
const milestones = [16, 32, 64, 128, 256, 512, 1024, 2048];

// Boost the "4" chance so the higher milestones aren't too rare on 4x4.
// (Classic 2048 uses ~10% 4s; we make it much easier for a side minigame.)
const spawnDistribution = {
  2: 0.6,
  4: 0.4,
};

const EMPTY = 0;

function makeEmptyBoard() {
  return Array.from({ length: gridSize }, () => Array(gridSize).fill(EMPTY));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (board[r][c] === EMPTY) cells.push([r, c]);
    }
  }
  return cells;
}

function addRandomTile(board) {
  const empties = getEmptyCells(board);
  if (empties.length === 0) return board;

  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const roll = Math.random();
  const value = roll < spawnDistribution[4] ? 4 : 2;
  const next = cloneBoard(board);
  next[r][c] = value;
  return next;
}

function compressAndMerge(line) {
  const values = line.filter((v) => v !== EMPTY);
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const current = values[i];
    const next = values[i + 1];
    if (next !== undefined && current === next) {
      out.push(current * 2);
      i++; // skip merged pair
    } else {
      out.push(current);
    }
  }
  while (out.length < gridSize) out.push(EMPTY);
  return out;
}

function moveBoard(board, dir) {
  // dir: 'left' | 'right' | 'up' | 'down'
  const next = makeEmptyBoard();

  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < gridSize; r++) {
      const row = board[r];
      const working = dir === 'right' ? row.slice().reverse() : row.slice();
      const merged = compressAndMerge(working);
      const finalRow = dir === 'right' ? merged.slice().reverse() : merged;
      next[r] = finalRow;
    }
  } else {
    for (let c = 0; c < gridSize; c++) {
      const col = board.map((row) => row[c]);
      const working = dir === 'down' ? col.slice().reverse() : col.slice();
      const merged = compressAndMerge(working);
      const finalCol = dir === 'down' ? merged.slice().reverse() : merged;
      for (let r = 0; r < gridSize; r++) next[r][c] = finalCol[r];
    }
  }

  const changed = board.some((row, r) => row.some((v, c) => v !== next[r][c]));
  return { nextBoard: next, changed };
}

function getMaxTile(board) {
  let max = EMPTY;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      max = Math.max(max, board[r][c]);
    }
  }
  return max;
}

function getNextMilestone(maxTile) {
  for (let i = 0; i < milestones.length; i++) {
    if (maxTile < milestones[i]) return milestones[i];
  }
  return 2048;
}

function canMove(board) {
  // If any empty cell exists, a move is possible.
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (board[r][c] === EMPTY) return true;
    }
  }

  // Otherwise check for adjacent merges (horizontal/vertical).
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const v = board[r][c];
      if (c + 1 < gridSize && board[r][c + 1] === v) return true;
      if (r + 1 < gridSize && board[r + 1][c] === v) return true;
    }
  }

  return false;
}

function getMilestoneIndex(maxTile) {
  let idx = -1;
  for (let i = 0; i < milestones.length; i++) {
    if (maxTile >= milestones[i]) idx = i;
  }
  return idx;
}

function tileColor(value) {
  // Simple palette; falls back to generic for unexpected tiles.
  const map = {
    2: '#eee4da',
    4: '#ede0c8',
    8: '#f2b179',
    16: '#f59563',
    32: '#f67c5f',
    64: '#f65e3b',
    128: '#edcf72',
    256: '#edcc61',
    512: '#edc850',
    1024: '#edc53f',
    2048: '#edc22e',
  };
  return map[value] || '#3a3a3a';
}

function tileTextColor(value) {
  return value <= 4 ? '#776e65' : '#f9f6f2';
}

function formatTileValue(value) {
  return value === EMPTY ? '' : String(value);
}

const icon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="4" width="24" height="24" rx="3" fill="#ece9d8" stroke="#0a246a"/>
    <rect x="8" y="8" width="16" height="16" rx="2" fill="#f2b179" stroke="#c86f2c"/>
    <text x="16" y="20" font-size="10" text-anchor="middle" font-family="Tahoma" fill="#0a246a" font-weight="bold">2048</text>
  </svg>
`);

function Milestone2048Component({ windowId }) {
  const activeWindowId = useWindowStore((s) => s.activeWindowId);
  const BEST_KEY = 'tattletale:milestone2048:bestMaxTile';

  const [bestMaxTile, setBestMaxTile] = useState(() => {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      const parsed = raw ? Number(raw) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  });

  const [board, setBoard] = useState(() => {
    let b = makeEmptyBoard();
    b = addRandomTile(b);
    b = addRandomTile(b);
    return b;
  });
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState('PLAYING'); // PLAYING | WIN | LOSE
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const maxTile = useMemo(() => getMaxTile(board), [board]);
  const nextMilestone = useMemo(() => getNextMilestone(maxTile), [maxTile]);

  const lastMilestoneIdxRef = useRef(-1);
  const currentMilestoneIdx = getMilestoneIndex(maxTile);

  useEffect(() => {
    if (status !== 'PLAYING') return;

    if (currentMilestoneIdx > lastMilestoneIdxRef.current) {
      const reached = milestones[currentMilestoneIdx];
      lastMilestoneIdxRef.current = currentMilestoneIdx;
      setToast(`Milestone reached: ${reached}`);

      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToast(null), 2500);
    }

    if (maxTile >= 2048) {
      setStatus('WIN');
      setToast('You hit 2048!');
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
    }

    if (!canMove(board) && maxTile < 2048) {
      setStatus('LOSE');
      setToast('No more moves. Try again!');
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
    }
  }, [board, currentMilestoneIdx, maxTile, status]);

  // Persist best max tile for this browser.
  useEffect(() => {
    if (status !== 'WIN' && status !== 'LOSE') return;
    if (!Number.isFinite(maxTile)) return;

    if (maxTile > bestMaxTile) {
      setBestMaxTile(maxTile);
      try {
        localStorage.setItem(BEST_KEY, String(maxTile));
      } catch {
        // ignore storage issues (private mode, etc.)
      }
    }
  }, [status, maxTile, bestMaxTile]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (activeWindowId !== windowId) return;
      if (status !== 'PLAYING') return;

      // If the user is typing in an input (e.g. the side-task modal),
      // don't hijack hotkeys like `h`/`l`.
      const target = e.target;
      if (
        target &&
        typeof target === 'object' &&
        ('tagName' in target || 'isContentEditable' in target)
      ) {
        const tag = target.tagName ? String(target.tagName).toUpperCase() : '';
        const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA';
        const isEditable = !!target.isContentEditable;
        if (isTextInput || isEditable) return;
      }

      const key = e.key;
      const map = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        h: 'left',
        l: 'right',
        k: 'up',
        j: 'down',
      };

      const dir = map[key];
      if (!dir) return;

      e.preventDefault();
      setBoard((prev) => {
        const { nextBoard, changed } = moveBoard(prev, dir);
        if (!changed) return prev;

        // Spawn after a successful move
        const spawned = addRandomTile(nextBoard);
        setMoves((m) => m + 1);
        return spawned;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeWindowId, windowId, status]);

  const reset = () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    lastMilestoneIdxRef.current = -1;
    setToast(null);
    setMoves(0);
    setStatus('PLAYING');
    let b = makeEmptyBoard();
    b = addRandomTile(b);
    b = addRandomTile(b);
    setBoard(b);
  };

  const handleMoveButton = (dir) => {
    if (activeWindowId !== windowId) return;
    if (status !== 'PLAYING') return;

    setBoard((prev) => {
      const { nextBoard, changed } = moveBoard(prev, dir);
      if (!changed) return prev;
      const spawned = addRandomTile(nextBoard);
      setMoves((m) => m + 1);
      return spawned;
    });
  };

  const bg = '#ece9d8';
  const gridGap = 6;
  const cellStyle = {
    height: 56,
    borderRadius: 6,
    fontFamily: 'Tahoma, sans-serif',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    userSelect: 'none',
  };

  return (
    <div
      style={{
        padding: 10,
        background: bg,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 'bold' }}>2048</div>
        <div style={{ color: '#0a246a' }}>
          Moves: <span style={{ fontWeight: 'bold' }}>{moves}</span>
        </div>
      </div>

      <div
        style={{
          padding: '6px 8px',
          border: '1px solid #aca899',
          background: '#fff',
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        Max tile: <b>{maxTile || 0}</b> · Best: <b>{bestMaxTile || 0}</b>
      </div>

      {toast && (
        <div
          style={{
            padding: '6px 8px',
            border: '1px solid #aca899',
            background: '#fff',
            borderRadius: 4,
            color: '#0a246a',
            fontSize: 11,
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          gap: gridGap,
          background: '#d8d3c9',
          padding: gridGap,
          borderRadius: 8,
        }}
      >
        {board.flatMap((row, r) =>
          row.map((value, c) => {
            const isEmpty = value === EMPTY;
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  ...cellStyle,
                  backgroundColor: isEmpty ? '#d8d3c9' : tileColor(value),
                  color: isEmpty ? 'transparent' : tileTextColor(value),
                  border: isEmpty ? '1px solid #d8d3c9' : '1px solid rgba(0,0,0,0.1)',
                }}
              >
                {formatTileValue(value)}
              </div>
            );
          })
        )}
      </div>

      {status === 'WIN' && (
        <div
          style={{
            marginTop: 'auto',
            padding: 10,
            border: '2px solid #0a246a',
            borderRadius: 8,
            background: '#fff',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
            2048 reached
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              minWidth: 120,
              padding: '4px 12px',
              border: '1px solid #7f9db9',
              background:
                'linear-gradient(to bottom, #ffffff, #d9e4f6)',
              cursor: 'pointer',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 11,
            }}
          >
            Play again
          </button>
        </div>
      )}

      {status === 'LOSE' && (
        <div
          style={{
            marginTop: 'auto',
            padding: 10,
            border: '2px solid #0a246a',
            borderRadius: 8,
            background: '#fff',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
            Game over
          </div>
          <div style={{ marginBottom: 10, color: '#0a246a' }}>
            Max tile: <b>{maxTile || 0}</b>
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              minWidth: 120,
              padding: '4px 12px',
              border: '1px solid #7f9db9',
              background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
              cursor: 'pointer',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 11,
            }}
          >
            Play again
          </button>
        </div>
      )}

      {status === 'PLAYING' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div />
          <button type="button" onClick={() => handleMoveButton('up')} style={arrowBtnStyle}>
            ↑
          </button>
          <div />
          <button type="button" onClick={() => handleMoveButton('left')} style={arrowBtnStyle}>
            ←
          </button>
          <button
            type="button"
            onClick={() => {}}
            disabled
            style={{ ...arrowBtnStyle, opacity: 0.4, cursor: 'default' }}
          >
            &nbsp;
          </button>
          <button type="button" onClick={() => handleMoveButton('right')} style={arrowBtnStyle}>
            →
          </button>
          <div />
          <button type="button" onClick={() => handleMoveButton('down')} style={arrowBtnStyle}>
            ↓
          </button>
          <div />
        </div>
      )}
    </div>
  );
}

const arrowBtnStyle = {
  padding: '8px 0',
  border: '1px solid #7f9db9',
  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
  cursor: 'pointer',
  borderRadius: 6,
  fontFamily: 'Tahoma, sans-serif',
  fontSize: 14,
};

const Milestone2048 = {
  id: 'milestone-2048',
  name: '2048',
  icon,
  component: Milestone2048Component,
  defaultWindow: {
    width: 360,
    height: 520,
    resizable: false,
    minWidth: 320,
    minHeight: 420,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Keep merging tiles until you reach 2048.',
  },
  desktopIcon: {
    show: true,
  },
};

export default Milestone2048;

