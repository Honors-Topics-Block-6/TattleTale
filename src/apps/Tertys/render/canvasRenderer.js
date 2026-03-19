import { getPieceMatrix } from '../game/pieces';

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 128, g: 128, b: 128 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex({ r, g, b }) {
  const to = (v) => v.toString(16).padStart(2, '0');
  return `#${to(clamp(r))}${to(clamp(g))}${to(clamp(b))}`;
}

function tint(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r + amt, g: g + amt, b: b + amt });
}

function drawBevelBlock(ctx, x, y, size, color) {
  const base = color;
  const light = tint(color, 60);
  const dark = tint(color, -70);

  ctx.fillStyle = base;
  ctx.fillRect(x, y, size, size);

  // highlight edge
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, 2);
  ctx.fillRect(x, y, 2, size);

  // shadow edge
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + size - 2, size, 2);
  ctx.fillRect(x + size - 2, y, 2, size);

  // inner pixel-ish detail
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 3, y + 3, Math.max(0, size - 10), Math.max(0, size - 10));

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

export function renderBoardCanvas({
  canvas,
  snapshot,
  cellSize = 20,
  background = '#0b1a2e',
  gridColor = 'rgba(255,255,255,0.06)',
  getCellColor,
}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const { cols, rows, hiddenRows } = snapshot.dims || { cols: 10, rows: snapshot.board.length, hiddenRows: 2 };
  const visibleRows = rows - hiddenRows;

  const w = cols * cellSize;
  const h = visibleRows * cellSize;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  clearCanvas(ctx, w, h);

  // board background
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  // subtle grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize + 0.5, 0);
    ctx.lineTo(x * cellSize + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= visibleRows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize + 0.5);
    ctx.lineTo(w, y * cellSize + 0.5);
    ctx.stroke();
  }

  // locked cells
  for (let by = hiddenRows; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const t = snapshot.board[by]?.[bx];
      if (!t) continue;
      const px = bx * cellSize;
      const py = (by - hiddenRows) * cellSize;
      drawBevelBlock(ctx, px, py, cellSize, getCellColor(t));
    }
  }

  // active piece
  if (snapshot.active) {
    const m = getPieceMatrix(snapshot.active.type, snapshot.active.rotation);
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const bx = snapshot.active.x + x;
        const by = snapshot.active.y + y;
        if (by < hiddenRows) continue;
        const px = bx * cellSize;
        const py = (by - hiddenRows) * cellSize;
        drawBevelBlock(ctx, px, py, cellSize, getCellColor(snapshot.active.type));
      }
    }
  }
}

export function renderNextCanvas({ canvas, nextType, cellSize = 16, getCellColor }) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const w = 6 * cellSize;
  const h = 6 * cellSize;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  clearCanvas(ctx, w, h);
  ctx.fillStyle = '#0b1a2e';
  ctx.fillRect(0, 0, w, h);

  if (!nextType) return;

  const m = getPieceMatrix(nextType, 0);
  const mw = m[0].length;
  const mh = m.length;
  const ox = Math.floor((6 - mw) / 2);
  const oy = Math.floor((6 - mh) / 2);

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!m[y][x]) continue;
      drawBevelBlock(
        ctx,
        (ox + x) * cellSize,
        (oy + y) * cellSize,
        cellSize,
        getCellColor(nextType)
      );
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

