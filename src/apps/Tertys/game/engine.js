import {
  BOARD_COLS,
  BOARD_ROWS,
  HIDDEN_ROWS,
  FALL_INTERVAL_LEVEL_STEP_MS,
  FALL_INTERVAL_MIN_MS,
  FALL_INTERVAL_START_MS,
  SCORE_HARD_DROP_PER_CELL,
  SCORE_LINE_CLEAR,
  SCORE_SOFT_DROP_PER_CELL,
} from './constants';
import { PIECE_COLORS, PIECE_TYPES, getPieceMatrix } from './pieces';

function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));
}

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffledBag() {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function createQueue() {
  // Keep a small queue so "Next" is always defined.
  return [...shuffledBag(), ...shuffledBag()];
}

function getSpawnX(type) {
  // Center-ish spawn for both 3x3 and 4x4 pieces.
  const m = getPieceMatrix(type, 0);
  return Math.floor((BOARD_COLS - m[0].length) / 2);
}

function canPlace(board, piece) {
  const m = getPieceMatrix(piece.type, piece.rotation);
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (!m[y][x]) continue;
      const bx = piece.x + x;
      const by = piece.y + y;
      if (bx < 0 || bx >= BOARD_COLS) return false;
      if (by >= BOARD_ROWS) return false;
      if (by < 0) continue; // allow spawning/rotation above the visible board
      if (board[by][bx]) return false;
    }
  }
  return true;
}

function mergePiece(board, piece) {
  const m = getPieceMatrix(piece.type, piece.rotation);
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (!m[y][x]) continue;
      const bx = piece.x + x;
      const by = piece.y + y;
      if (by < 0) continue;
      board[by][bx] = piece.type;
    }
  }
}

function clearFullLines(board) {
  let cleared = 0;
  const out = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    const full = board[y].every(Boolean);
    if (full) cleared++;
    else out.push(board[y]);
  }
  while (out.length < BOARD_ROWS) out.unshift(Array.from({ length: BOARD_COLS }, () => null));
  return { board: out, cleared };
}

function computeLevel(lines) {
  return Math.floor(lines / 10);
}

export function getFallIntervalMs(level) {
  return Math.max(
    FALL_INTERVAL_MIN_MS,
    FALL_INTERVAL_START_MS - level * FALL_INTERVAL_LEVEL_STEP_MS
  );
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function createTertysEngine() {
  /** @type {import('./types').TertysSnapshot} */
  let state = null;

  function newPiece(type) {
    // Spawn slightly into the hidden buffer so pieces appear immediately,
    // while still allowing "above the top" behavior for rotations.
    return { type, rotation: 0, x: getSpawnX(type), y: Math.max(0, HIDDEN_ROWS - 1) };
  }

  function ensureQueue(queue) {
    if (queue.length >= 7) return queue;
    return [...queue, ...shuffledBag()];
  }

  function spawnNext() {
    state.queue = ensureQueue(state.queue);
    const type = state.queue.shift();
    state.active = newPiece(type);
    state.next = state.queue[0] || null;

    if (!canPlace(state.board, state.active)) {
      state.over = true;
      state.status = 'Game over.';
      return [{ type: 'GAME_OVER' }];
    }
    return [{ type: 'SPAWN' }];
  }

  function reset() {
    state = {
      board: createEmptyBoard(),
      queue: createQueue(),
      active: null,
      next: null,
      score: 0,
      lines: 0,
      level: 0,
      over: false,
      status: 'Ready.',
    };
    spawnNext();
    return snapshot();
  }

  function snapshot() {
    // Small board; cloning keeps rendering predictable in React.
    return {
      board: cloneBoard(state.board),
      active: state.active ? { ...state.active } : null,
      next: state.next,
      dims: { cols: BOARD_COLS, rows: BOARD_ROWS, hiddenRows: HIDDEN_ROWS },
      score: state.score,
      lines: state.lines,
      level: state.level,
      over: state.over,
      status: state.status,
    };
  }

  // Basic kick table for a "simple but forgiving" feel.
  const KICKS = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: -1 },
  ];

  function move(dx, dy) {
    if (!state || state.over) return { snapshot: snapshot(), events: [] };
    const next = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
    if (!canPlace(state.board, next)) return { snapshot: snapshot(), events: [] };
    state.active = next;
    return { snapshot: snapshot(), events: [] };
  }

  function rotateCW() {
    if (!state || state.over) return { snapshot: snapshot(), events: [] };
    const base = state.active;
    const rot = (base.rotation + 1) % 4;
    for (const k of KICKS) {
      const candidate = { ...base, rotation: rot, x: base.x + k.x, y: base.y + k.y };
      if (canPlace(state.board, candidate)) {
        state.active = candidate;
        return { snapshot: snapshot(), events: [] };
      }
    }
    return { snapshot: snapshot(), events: [] };
  }

  function lockAndAdvance() {
    const events = [{ type: 'LOCK' }];
    mergePiece(state.board, state.active);

    const { board: nextBoard, cleared } = clearFullLines(state.board);
    state.board = nextBoard;

    if (cleared > 0) {
      events.push({ type: 'LINE_CLEAR', lines: cleared });
      state.lines += cleared;
      state.level = computeLevel(state.lines);
      const base = SCORE_LINE_CLEAR[cleared] || cleared * 100;
      state.score += base * (state.level + 1);
      state.status = `Cleared ${cleared} line${cleared === 1 ? '' : 's'}!`;
    } else {
      state.status = 'Locked.';
    }

    events.push(...spawnNext());
    return events;
  }

  function tickGravity() {
    if (!state || state.over) return { snapshot: snapshot(), events: [] };
    const candidate = { ...state.active, y: state.active.y + 1 };
    if (canPlace(state.board, candidate)) {
      state.active = candidate;
      return { snapshot: snapshot(), events: [] };
    }
    const events = lockAndAdvance();
    return { snapshot: snapshot(), events };
  }

  function softDrop() {
    if (!state || state.over) return { snapshot: snapshot(), events: [] };
    const candidate = { ...state.active, y: state.active.y + 1 };
    if (!canPlace(state.board, candidate)) return { snapshot: snapshot(), events: [] };
    state.active = candidate;
    state.score += SCORE_SOFT_DROP_PER_CELL;
    return { snapshot: snapshot(), events: [] };
  }

  function hardDrop() {
    if (!state || state.over) return { snapshot: snapshot(), events: [] };
    let dist = 0;
    while (true) {
      const candidate = { ...state.active, y: state.active.y + 1 };
      if (!canPlace(state.board, candidate)) break;
      state.active = candidate;
      dist++;
    }
    if (dist > 0) state.score += dist * SCORE_HARD_DROP_PER_CELL;
    const events = lockAndAdvance();
    return { snapshot: snapshot(), events: [{ type: 'HARD_DROP', dist }, ...events] };
  }

  function getCellColor(type) {
    return PIECE_COLORS[type] || '#999';
  }

  // initialize
  reset();

  return {
    reset,
    snapshot,
    moveLeft: () => move(-1, 0),
    moveRight: () => move(1, 0),
    softDrop,
    rotateCW,
    hardDrop,
    tickGravity,
    getCellColor,
    getDims: () => ({ cols: BOARD_COLS, rows: BOARD_ROWS, hiddenRows: HIDDEN_ROWS }),
  };
}

