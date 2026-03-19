import { useEffect, useRef, useState } from 'react';

const COLS = 15;
const ROWS = 15;

const DIRS = [
  { key: 'ArrowUp', dx: 0, dy: -1, name: 'up' },
  { key: 'ArrowDown', dx: 0, dy: 1, name: 'down' },
  { key: 'ArrowLeft', dx: -1, dy: 0, name: 'left' },
  { key: 'ArrowRight', dx: 1, dy: 0, name: 'right' },
  { key: 'w', dx: 0, dy: -1, name: 'up' },
  { key: 's', dx: 0, dy: 1, name: 'down' },
  { key: 'a', dx: -1, dy: 0, name: 'left' },
  { key: 'd', dx: 1, dy: 0, name: 'right' },
];

const cellKey = (x, y) => `${x},${y}`;

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWalls(seed, blockedCells) {
  const walls = new Set();
  const rng = mulberry32(seed);

  // Border walls
  for (let x = 0; x < COLS; x++) {
    walls.add(cellKey(x, 0));
    walls.add(cellKey(x, ROWS - 1));
  }
  for (let y = 0; y < ROWS; y++) {
    walls.add(cellKey(0, y));
    walls.add(cellKey(COLS - 1, y));
  }

  // Random interior blocks: keeps the board changing each game.
  const desiredInteriorWallCells = 44 + Math.floor(rng() * 26); // ~44-69
  let interiorWallCells = 0;
  let attempts = 0;

  while (interiorWallCells < desiredInteriorWallCells && attempts < 600) {
    attempts += 1;

    const w = rng() < 0.65 ? 2 : 3;
    const h = rng() < 0.65 ? 2 : 3;

    // Keep away from the border.
    const x = 2 + Math.floor(rng() * (COLS - 4 - w));
    const y = 2 + Math.floor(rng() * (ROWS - 4 - h));

    // Skip if any cell would overlap blocked cells.
    let overlapsBlocked = false;
    for (let cx = x; cx < x + w; cx++) {
      for (let cy = y; cy < y + h; cy++) {
        const k = cellKey(cx, cy);
        if (blockedCells.has(k)) {
          overlapsBlocked = true;
          break;
        }
      }
      if (overlapsBlocked) break;
    }
    if (overlapsBlocked) continue;

    // Add the block if it doesn't overfill or overlap too much.
    for (let cx = x; cx < x + w; cx++) {
      for (let cy = y; cy < y + h; cy++) {
        const k = cellKey(cx, cy);
        if (!walls.has(k) && !blockedCells.has(k)) {
          walls.add(k);
          interiorWallCells += 1;
        }
      }
    }
  }

  return walls;
}

function isWalkable(walls, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  return !walls.has(cellKey(x, y));
}

function dirFromName(name) {
  if (name === 'up') return { dx: 0, dy: -1 };
  if (name === 'down') return { dx: 0, dy: 1 };
  if (name === 'left') return { dx: -1, dy: 0 };
  return { dx: 1, dy: 0 };
}

function nextPos(x, y, dirName) {
  const { dx, dy } = dirFromName(dirName);
  return { x: x + dx, y: y + dy };
}

function reverseDirName(dirName) {
  if (dirName === 'up') return 'down';
  if (dirName === 'down') return 'up';
  if (dirName === 'left') return 'right';
  return 'left';
}

function advanceFrom(walls, x, y, dirName, steps) {
  let cx = x;
  let cy = y;
  for (let i = 0; i < steps; i++) {
    const n = nextPos(cx, cy, dirName);
    if (!isWalkable(walls, n.x, n.y)) break;
    cx = n.x;
    cy = n.y;
  }
  return { x: cx, y: cy };
}

const GHOST_SCATTER_CORNERS = {
  blinky: { x: 1, y: 1 },
  pinky: { x: 13, y: 1 },
  inky: { x: 13, y: 13 },
  clyde: { x: 1, y: 13 },
};

function getChaseTarget({ walls, ghost, pac, game }) {
  if (ghost.type === 'blinky') return { x: pac.x, y: pac.y };

  if (ghost.type === 'pinky') {
    return advanceFrom(walls, pac.x, pac.y, pac.dir, 4);
  }

  if (ghost.type === 'inky') {
    const blinky = game.ghosts.find((g) => g.type === 'blinky');
    const twoAhead = advanceFrom(walls, pac.x, pac.y, pac.dir, 2);
    if (!blinky) return { x: pac.x, y: pac.y };

    // Classic-ish: vector from blinky to 2-ahead, doubled.
    const vx = twoAhead.x - blinky.x;
    const vy = twoAhead.y - blinky.y;
    const tx = blinky.x + vx;
    const ty = blinky.y + vy;

    // If the target cell is blocked/out of bounds, fall back.
    if (!isWalkable(walls, tx, ty)) return { x: twoAhead.x, y: twoAhead.y };
    return { x: tx, y: ty };
  }

  // Clyde: chase unless close, then scatter.
  if (ghost.type === 'clyde') {
    const closeEnough = manhattan(ghost.x, ghost.y, pac.x, pac.y) <= 6;
    if (closeEnough) return GHOST_SCATTER_CORNERS.clyde;
    return { x: pac.x, y: pac.y };
  }

  return { x: pac.x, y: pac.y };
}

function chooseGhostDir({ walls, ghost, pac, game, now }) {
  const frightened = now < game.frightenedUntil;

  const valid = [];
  for (const d of DIRS.slice(0, 4)) {
    const nx = ghost.x + d.dx;
    const ny = ghost.y + d.dy;
    if (isWalkable(walls, nx, ny)) valid.push({ name: d.name, nx, ny });
  }

  // If there's nowhere to go, let movement code respawn the ghost.
  if (valid.length === 0) return ghost.dir;

  if (frightened) {
    // Frightened mode: wander (always pick from valid exits).
    return valid[Math.floor(Math.random() * valid.length)].name;
  }

  // Scatter/chase cycle (simplified).
  const SCATTER_MS = 3500;
  const CHASE_MS = 7000;
  const cycleLen = SCATTER_MS + CHASE_MS;
  const elapsed = now - game.cycleStartMs;
  const inChase = (elapsed % cycleLen) >= SCATTER_MS;

  const mode = inChase ? 'chase' : 'scatter';
  const target =
    mode === 'scatter' ? GHOST_SCATTER_CORNERS[ghost.type] : getChaseTarget({ walls, ghost, pac, game });

  // Pick the candidate that minimizes Manhattan distance to target.
  const bestDist = Math.min(
    ...valid.map((c) => manhattan(c.nx, c.ny, target.x, target.y))
  );
  const bestCandidates = valid.filter(
    (c) => manhattan(c.nx, c.ny, target.x, target.y) === bestDist
  );

  // Slight randomness for more "alive" behavior.
  if (bestCandidates.length > 1 && Math.random() < 0.5) {
    return bestCandidates[Math.floor(Math.random() * bestCandidates.length)].name;
  }
  return bestCandidates[0].name;
}

export default function PacmanMiniGame({
  open = false,
  onClose,
  position = 'right',
  variant = 'panel', // 'panel' | 'embedded'
}) {
  const isEmbedded = variant === 'embedded';
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const pendingDirRef = useRef('right');

  const [status, setStatus] = useState('ready'); // ready | playing | won | lost
  const statusRef = useRef(status);
  const tickRef = useRef(0); // used for subtle mouth animation
  statusRef.current = status;

  const wallsRef = useRef(new Set());

  const reset = (nextStatus = 'ready') => {
    const pacStart = { x: 7, y: 11 };
    const ghostsStart = [
      { type: 'blinky', x: 7, y: 7, dir: 'right', color: '#e85b5b' },
      { type: 'pinky', x: 6, y: 7, dir: 'left', color: '#ff8bd6' },
      { type: 'inky', x: 8, y: 7, dir: 'right', color: '#66a3ff' },
      { type: 'clyde', x: 7, y: 6, dir: 'down', color: '#f5a623' },
    ];

    // Scatter corners / power corners should remain open so ghost logic doesn't dead-end.
    const protectedCorners = [
      { x: 1, y: 1 },
      { x: 13, y: 1 },
      { x: 1, y: 13 },
      { x: 13, y: 13 },
    ];

    const blockedCells = new Set();
    blockedCells.add(cellKey(pacStart.x, pacStart.y));
    ghostsStart.forEach((g) => blockedCells.add(cellKey(g.x, g.y)));
    protectedCorners.forEach((p) => blockedCells.add(cellKey(p.x, p.y)));

    const seed = Date.now();
    wallsRef.current = buildWalls(seed, blockedCells);

    const powerPositions = [
      { x: 1, y: 1 },
      { x: 13, y: 1 },
      { x: 1, y: 13 },
      { x: 13, y: 13 },
    ];

    const pellets = new Set();
    const powerPellets = new Set();

    const countWalkableNeighbors = (wset, x, y) => {
      let n = 0;
      for (const d of DIRS.slice(0, 4)) {
        if (isWalkable(wset, x + d.dx, y + d.dy)) n += 1;
      }
      return n;
    };

    // Regenerate walls until spawn cells have at least one exit.
    const spawnCells = [
      pacStart,
      ...ghostsStart.map((g) => ({ x: g.x, y: g.y })),
      ...protectedCorners,
    ];
    let walls = wallsRef.current;
    let built = false;
    const attemptLimit = 18;
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const seed = Date.now() + attempt * 99991;
      const candidateWalls = buildWalls(seed, blockedCells);
      const okSpawns = spawnCells.every((c) => countWalkableNeighbors(candidateWalls, c.x, c.y) > 0);

      // Ensure there are no isolated walkable tiles (would cause ghosts to "freeze").
      let okConnectivity = true;
      for (let y = 1; y < ROWS - 1 && okConnectivity; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (isWalkable(candidateWalls, x, y)) {
            if (countWalkableNeighbors(candidateWalls, x, y) === 0) {
              okConnectivity = false;
              break;
            }
          }
        }
      }

      const ok = okSpawns && okConnectivity;
      if (ok) {
        walls = candidateWalls;
        wallsRef.current = candidateWalls;
        built = true;
        break;
      }
    }

    if (!built) {
      // Fallback: use whatever map we generated last.
      walls = wallsRef.current;
    }

    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (isWalkable(walls, x, y)) {
          const isSpawn =
            (x === pacStart.x && y === pacStart.y) ||
            ghostsStart.some((g) => g.x === x && g.y === y);
          if (!isSpawn) pellets.add(cellKey(x, y));
        }
      }
    }

    // Move some pellets into power pellets for more classic gameplay.
    powerPositions.forEach((p) => {
      const k = cellKey(p.x, p.y);
      if (pellets.has(k)) {
        pellets.delete(k);
        powerPellets.add(k);
      }
    });

    const now = Date.now();
    gameRef.current = {
      pac: { ...pacStart, dir: 'right' },
      ghosts: ghostsStart.map((g) => ({
        ...g,
        startX: g.x,
        startY: g.y,
        startDir: g.dir,
      })),
      pellets,
      powerPellets,
      gameOver: false,
      score: 0,
      frightenedUntil: 0,
      frightenedEatStreak: 0,
      cycleStartMs: now,
    };
    pendingDirRef.current = 'right';
    tickRef.current += 1;
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const g = gameRef.current;
    if (!canvas || !g) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = canvas.width / COLS;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Walls
    ctx.fillStyle = '#0f3f8a';
    const walls = wallsRef.current;
    walls.forEach((k) => {
      const [xs, ys] = k.split(',');
      const x = Number(xs);
      const y = Number(ys);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    });

    // Normal pellets
    ctx.fillStyle = '#fff';
    g.pellets.forEach((k) => {
      const [xs, ys] = k.split(',');
      const x = Number(xs);
      const y = Number(ys);
      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.3, cellSize * 0.12), 0, Math.PI * 2);
      ctx.fill();
    });

    // Power pellets (classic "energizer" dots)
    ctx.fillStyle = '#fff7c2';
    g.powerPellets.forEach((k) => {
      const [xs, ys] = k.split(',');
      const x = Number(xs);
      const y = Number(ys);
      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.9, cellSize * 0.18), 0, Math.PI * 2);
      ctx.fill();
    });

    // Pacman
    const { x: px, y: py, dir } = g.pac;
    const { dx, dy } = dirFromName(dir);
    const cx = px * cellSize + cellSize / 2;
    const cy = py * cellSize + cellSize / 2;
    const r = cellSize * 0.42;

    const mouthAnim = (tickRef.current % 20) / 20; // 0..1
    const mouth =
      statusRef.current === 'playing' ? 0.25 + mouthAnim * 0.18 : 0.28;
    const baseAngle =
      dir === 'right'
        ? 0
        : dir === 'left'
          ? Math.PI
          : dir === 'up'
            ? -Math.PI / 2
            : Math.PI / 2;
    const startAngle = baseAngle + mouth;
    const endAngle = baseAngle + Math.PI * 2 - mouth;

    // Yellow pacman
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle, false);
    ctx.closePath();
    ctx.fill();

    // Ghosts
    g.ghosts.forEach((ghost) => {
      const gx = ghost.x * cellSize + cellSize / 2;
      const gy = ghost.y * cellSize + cellSize / 2;
      const gr = cellSize * 0.36;

      if (ghost.returning) {
        ctx.globalAlpha = 0.55;
      } else {
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = ghost.color;
      ctx.beginPath();
      // body
      ctx.arc(gx, gy - gr * 0.05, gr * 1.0, Math.PI, 0);
      ctx.lineTo(gx + gr, gy + gr * 0.8);
      ctx.lineTo(gx + gr * 0.6, gy + gr * 0.55);
      ctx.lineTo(gx + gr * 0.2, gy + gr * 0.85);
      ctx.lineTo(gx - gr * 0.2, gy + gr * 0.85);
      ctx.lineTo(gx - gr * 0.6, gy + gr * 0.55);
      ctx.lineTo(gx - gr, gy + gr * 0.8);
      ctx.closePath();
      ctx.fill();

      // eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx - gr * 0.35, gy - gr * 0.1, gr * 0.18, 0, Math.PI * 2);
      ctx.arc(gx + gr * 0.35, gy - gr * 0.1, gr * 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.arc(gx - gr * 0.35, gy - gr * 0.1, gr * 0.07, 0, Math.PI * 2);
      ctx.arc(gx + gr * 0.35, gy - gr * 0.1, gr * 0.07, 0, Math.PI * 2);
      ctx.fill();
    });

    // Reset alpha after ghost rendering.
    ctx.globalAlpha = 1;

    // HUD text (small + inside canvas)
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${Math.max(10, cellSize * 0.3)}px Tahoma, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${g.score}`, 6, 14);

    if (statusRef.current === 'won' || statusRef.current === 'lost') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(12, cellSize * 0.35)}px Tahoma, sans-serif`;
      ctx.fillText(
        statusRef.current === 'won' ? 'YOU WIN!' : 'GAME OVER',
        canvas.width / 2,
        canvas.height / 2 - 6
      );
    }
  };

  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Enter'].includes(e.key)) return;

      // Prevent arrow keys scrolling the page
      if (e.key.startsWith('Arrow') || e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd') {
        e.preventDefault();
      }

      if (e.key === 'Enter') {
        if (status !== 'playing') {
          if (status === 'ready') setStatus('playing');
          else reset('playing');
        }
        return;
      }

      const found = DIRS.find((d) => d.key === e.key);
      if (!found) return;
      if (status !== 'playing') {
        // Let users "pre-buffer" movement and start with Enter.
        pendingDirRef.current = found.name;
        return;
      }
      pendingDirRef.current = found.name;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, status]);

  useEffect(() => {
    if (!open || status !== 'playing') return;

    const stepMs = 200; // slower movement so it feels more playable
    const ghostEverySteps = 2; // ghosts move half the speed of Pac-Man
    let stepCounter = 0;
    const id = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      if (g.gameOver) return;

      const now = Date.now();
      let frightened = now < g.frightenedUntil;
      const walls = wallsRef.current;

      // Move Pacman
      const pac = g.pac;
      const desired = pendingDirRef.current;
      const desiredNext = nextPos(pac.x, pac.y, desired);
      if (isWalkable(walls, desiredNext.x, desiredNext.y)) pac.dir = desired;
      const pacNext = nextPos(pac.x, pac.y, pac.dir);
      if (isWalkable(walls, pacNext.x, pacNext.y)) {
        pac.x = pacNext.x;
        pac.y = pacNext.y;
      }

      // Eat pellets
      const pk = cellKey(pac.x, pac.y);
      if (g.pellets.has(pk)) {
        g.pellets.delete(pk);
        g.score += 10;
      }
      if (g.powerPellets.has(pk)) {
        g.powerPellets.delete(pk);
        g.score += 50;
        g.frightenedUntil = now + 6500;
        g.frightenedEatStreak = 0;
        frightened = true;
      }

      if (g.pellets.size === 0 && g.powerPellets.size === 0) {
          g.gameOver = true;
          statusRef.current = 'won';
          setStatus('won');
          tickRef.current += 1;
          draw();
          return;
      }

      // Move ghosts (slower)
      stepCounter += 1;
      if (stepCounter % ghostEverySteps === 0) {
        const pacPos = { x: pac.x, y: pac.y, dir: pac.dir };
        g.ghosts.forEach((ghost) => {
          // If the ghost was "eaten", it must travel back to spawn
          // (no teleporting; move tile-by-tile like normal ghosts).
          if (ghost.returning) {
            const target = { x: ghost.startX, y: ghost.startY };

            const valid = [];
            for (const d of DIRS.slice(0, 4)) {
              const nx = ghost.x + d.dx;
              const ny = ghost.y + d.dy;
              if (isWalkable(walls, nx, ny)) valid.push({ name: d.name, nx, ny });
            }

            if (valid.length > 0) {
              const bestDist = Math.min(
                ...valid.map((c) => manhattan(c.nx, c.ny, target.x, target.y))
              );
              const best = valid.filter(
                (c) => manhattan(c.nx, c.ny, target.x, target.y) === bestDist
              );
              ghost.dir = best[Math.floor(Math.random() * best.length)].name;
            }

            const n = nextPos(ghost.x, ghost.y, ghost.dir);
            if (isWalkable(walls, n.x, n.y)) {
              ghost.x = n.x;
              ghost.y = n.y;
            }

            // Once it reaches spawn, resume normal behavior.
            if (ghost.x === ghost.startX && ghost.y === ghost.startY) {
              ghost.returning = false;
              ghost.dir = ghost.startDir;
            }
            return;
          }

          ghost.dir = chooseGhostDir({ walls, ghost, pac: pacPos, game: g, now });
          const n = nextPos(ghost.x, ghost.y, ghost.dir);
          if (isWalkable(walls, n.x, n.y)) {
            ghost.x = n.x;
            ghost.y = n.y;
          }
        });
      }

      // Collision (after ghost movement step)
      g.ghosts.forEach((ghost) => {
        if (ghost.x !== pac.x || ghost.y !== pac.y) return;

        if (ghost.returning) {
          // Returning ghosts are safe only while frightened is active.
          if (!frightened) {
            g.gameOver = true;
            statusRef.current = 'lost';
            setStatus('lost');
            tickRef.current += 1;
            draw();
          }
          return;
        }

        if (frightened) {
          // Eat ghost and send it back to spawn (move there tile-by-tile).
          g.frightenedEatStreak += 1;
          const bonus = 200 * g.frightenedEatStreak;
          ghost.returning = true;
          g.score += bonus;
          return;
        }

        // Not frightened and not returning: Pacman loses.
        g.gameOver = true;
        statusRef.current = 'lost';
        setStatus('lost');
        tickRef.current += 1;
        draw();
      });

      // Draw each tick without React state churn
      tickRef.current += 1;
      draw();
    }, stepMs);

    return () => {
      window.clearInterval(id);
    };
  }, [open, status]);

  if (!open) return null;

  return (
    <div
      style={{
        position: isEmbedded ? 'relative' : 'fixed',
        right: isEmbedded ? undefined : position === 'right' ? 8 : undefined,
        left: isEmbedded ? undefined : position === 'left' ? 8 : undefined,
        bottom: isEmbedded ? undefined : 44, // above taskbar height
        width: isEmbedded ? '100%' : 240,
        height: isEmbedded ? '100%' : undefined,
        zIndex: isEmbedded ? undefined : 9000,
        background: isEmbedded ? '#ece9d8' : 'rgba(255,255,255,0.92)',
        border: isEmbedded ? 'none' : '1px solid #0c59cb',
        borderRadius: isEmbedded ? 0 : 6,
        boxShadow: isEmbedded ? 'none' : '0 10px 24px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      {!isEmbedded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            background: 'linear-gradient(180deg, #3b6ea5 0%, #24518b 100%)',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: 12,
          }}
        >
          <span>Pac-Man</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 22,
              height: 22,
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.16)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            X
          </button>
        </div>
      )}

      <div
        style={{
          padding: isEmbedded ? 10 : 8,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <canvas
          ref={canvasRef}
          width={210}
          height={210}
          style={{
            width: 210,
            height: 210,
            borderRadius: 4,
            background: '#000',
            display: 'block',
            margin: '0 auto',
          }}
        />

        <div style={{ fontSize: 11, marginTop: 6, color: '#1b1b1b' }}>
          {status === 'ready' && (
            <span>
              Press <b>Enter</b> or click play. Use arrows to move.
            </span>
          )}
          {status === 'playing' && <span>Score increases as you eat pellets.</span>}
          {status === 'won' && <span>All pellets cleared. Click restart.</span>}
          {status === 'lost' && <span>Ghost got you. Click restart.</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {status !== 'playing' ? (
            <button
              type="button"
              onClick={() => {
                if (status === 'ready') {
                  setStatus('playing');
                } else {
                  reset('playing');
                }
              }}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 3,
                border: '1px solid #888',
                cursor: 'pointer',
                background: '#f5f5f3',
                fontSize: 12,
              }}
            >
              {status === 'ready' ? 'Play' : 'Restart'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => reset('ready')}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 3,
                border: '1px solid #888',
                cursor: 'pointer',
                background: '#f5f5f3',
                fontSize: 12,
              }}
            >
              {isEmbedded ? 'Reset' : 'Exit + Reset'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

