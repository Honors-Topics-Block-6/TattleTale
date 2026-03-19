import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function dirEq(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isOppositeDir(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickEmptyCell(cols, rows, occupied) {
  // Best-effort random sampling, then fallback scan.
  for (let i = 0; i < 150; i += 1) {
    const cell = { x: randomInt(cols), y: randomInt(rows) };
    if (!occupied.some((p) => sameCell(p, cell))) return cell;
  }
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = { x, y };
      if (!occupied.some((p) => sameCell(p, cell))) return cell;
    }
  }
  return { x: 0, y: 0 };
}

function nextHead(head, dir) {
  return { x: head.x + dir.x, y: head.y + dir.y };
}

function withinBounds(p, cols, rows) {
  return p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows;
}

function defaultInitialSnake(cols, rows) {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  return [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ].filter((p) => withinBounds(p, cols, rows));
}

export function formatTimeMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function useSnakeGameCanvasEngine({
  title = 'Snake',
  cols = 20,
  rows = 20,
  tickMs = 120,
  targetFood = null,
  timeLimitMs = null,
  onWin,
  onLose,
  showGoal = false,
  showTime = false,
  autoStart = false,
} = {}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fieldWrapRef = useRef(null);
  const intervalRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const deadlineRef = useRef(0);
  const endedRef = useRef(false);

  const [status, setStatus] = useState('idle'); // idle | running | over | won
  const [score, setScore] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(timeLimitMs ?? 0);
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });

  const [snake, setSnake] = useState(() => defaultInitialSnake(cols, rows));
  const [dir, setDir] = useState({ x: 1, y: 0 });
  const nextDirRef = useRef({ x: 1, y: 0 });
  const [food, setFood] = useState(() => pickEmptyCell(cols, rows, defaultInitialSnake(cols, rows)));

  const palette = useMemo(() => {
    return {
      windowBg: '#c0c0c0',
      panelBg: '#ece9d8',
      borderLight: '#ffffff',
      borderDark: '#808080',
      borderMid: '#aca899',
      headerBg: '#0a246a',
      headerText: '#ffffff',
      fieldBg: '#000000',
      snakeBody: '#00a000',
      snakeHead: '#00ff00',
      snakeOutline: 'rgba(255,255,255,0.25)',
      food: '#ff2a2a',
      foodHighlight: '#ff9a9a',
      grid: 'rgba(255,255,255,0.07)',
      text: '#000000',
    };
  }, []);

  const cellSize = useMemo(() => {
    if (!wrapSize.w || !wrapSize.h) return 16;
    const pad = 24;
    const maxByW = Math.floor((wrapSize.w - pad) / cols);
    const maxByH = Math.floor((wrapSize.h - pad) / rows);
    const ideal = Math.min(maxByW, maxByH);
    return clamp(ideal, 10, 24);
  }, [cols, rows, wrapSize.h, wrapSize.w]);

  const fieldW = cols * cellSize;
  const fieldH = rows * cellSize;

  const reset = useCallback(() => {
    endedRef.current = false;
    const initial = defaultInitialSnake(cols, rows);
    setSnake(initial);
    setDir({ x: 1, y: 0 });
    nextDirRef.current = { x: 1, y: 0 };
    setFood(pickEmptyCell(cols, rows, initial));
    setScore(0);
    if (timeLimitMs != null) setTimeLeftMs(timeLimitMs);
    setStatus('idle');
  }, [cols, rows, timeLimitMs]);

  const begin = useCallback(() => {
    if (status === 'running') return;
    endedRef.current = false;
    setStatus('running');
    if (timeLimitMs != null) {
      deadlineRef.current = Date.now() + timeLimitMs;
      setTimeLeftMs(timeLimitMs);
    }
    setTimeout(() => containerRef.current?.focus(), 10);
  }, [status, timeLimitMs]);

  const endLose = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus('over');
    onLose?.();
  }, [onLose]);

  const endWin = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus('won');
    onWin?.();
  }, [onWin]);

  const step = useCallback(() => {
    setSnake((prev) => {
      const nd = nextDirRef.current;
      setDir((cur) => (dirEq(cur, nd) ? cur : nd));

      const head = prev[0];
      const nh = nextHead(head, nd);
      if (!withinBounds(nh, cols, rows)) {
        endLose();
        return prev;
      }

      const ate = sameCell(nh, food);
      // Moving into the trailing tail cell is allowed when not eating (tail moves away).
      const bodyToCheck = ate ? prev : prev.slice(0, Math.max(0, prev.length - 1));
      const hitsSelf = bodyToCheck.some((p) => sameCell(p, nh));
      if (hitsSelf) {
        endLose();
        return prev;
      }

      const nextSnake = [nh, ...prev];
      if (!ate) nextSnake.pop();

      if (ate) {
        setScore((s) => {
          const next = s + 1;
          if (targetFood != null && next >= targetFood) endWin();
          return next;
        });
        setFood(pickEmptyCell(cols, rows, nextSnake));
      }

      return nextSnake;
    });
  }, [cols, rows, endLose, endWin, food, targetFood]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      if (status === 'idle') {
        if (e.key === 'Enter' || e.key === ' ') begin();
        return;
      }
      if (status !== 'running') {
        if (e.key === 'Enter' || e.key === ' ') {
          reset();
          begin();
        }
        return;
      }

      const map = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };

      const desired = map[e.key];
      if (!desired) return;

      const current = nextDirRef.current;
      if (isOppositeDir(current, desired)) return;
      nextDirRef.current = desired;
    },
    [begin, reset, status]
  );

  useEffect(() => {
    if (autoStart) begin();
  }, [autoStart, begin]);

  useEffect(() => {
    const el = fieldWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setWrapSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setWrapSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (status !== 'running') {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = window.setInterval(step, tickMs);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [status, step, tickMs]);

  useEffect(() => {
    if (timeLimitMs == null) return;
    if (status !== 'running') {
      if (timeIntervalRef.current) window.clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = null;
      return;
    }
    const tick = () => {
      const left = deadlineRef.current - Date.now();
      setTimeLeftMs(left);
      if (left <= 0) {
        endLose();
      }
    };
    tick();
    timeIntervalRef.current = window.setInterval(tick, 100);
    return () => {
      if (timeIntervalRef.current) window.clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = null;
    };
  }, [status, timeLimitMs, endLose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = fieldW;
    canvas.height = fieldH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, fieldW, fieldH);

    ctx.fillStyle = palette.fieldBg;
    ctx.fillRect(0, 0, fieldW, fieldH);

    // Subtle grid
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, fieldH);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(fieldW, y * cellSize + 0.5);
      ctx.stroke();
    }

    // Food
    const fx = food.x * cellSize;
    const fy = food.y * cellSize;
    ctx.fillStyle = palette.food;
    ctx.fillRect(fx + 2, fy + 2, cellSize - 4, cellSize - 4);
    ctx.fillStyle = palette.foodHighlight;
    ctx.fillRect(
      fx + 3,
      fy + 3,
      Math.max(2, Math.floor((cellSize - 6) / 2)),
      Math.max(2, Math.floor((cellSize - 6) / 2))
    );

    // Snake
    snake.forEach((p, idx) => {
      const x = p.x * cellSize;
      const y = p.y * cellSize;
      ctx.fillStyle = idx === 0 ? palette.snakeHead : palette.snakeBody;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      ctx.strokeStyle = palette.snakeOutline;
      ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
    });
  }, [cellSize, cols, fieldH, fieldW, food, palette, rows, snake]);

  const banner = useMemo(() => {
    if (status === 'idle') return 'Press Enter to start';
    if (status === 'over') return 'Game Over — Press Enter to retry';
    if (status === 'won') return 'Challenge Complete!';
    return null;
  }, [status]);

  return {
    title,
    cols,
    rows,
    tickMs,
    targetFood,
    timeLimitMs,
    showGoal,
    showTime,
    autoStart,
    canvasRef,
    containerRef,
    fieldWrapRef,
    palette,
    status,
    score,
    timeLeftMs,
    snake,
    dir,
    food,
    cellSize,
    fieldW,
    fieldH,
    banner,
    begin,
    reset,
    handleKeyDown,
  };
}

