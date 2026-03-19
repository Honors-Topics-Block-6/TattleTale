// Piece definitions are intentionally simple (toy-block vibe).
// Rotations are generated from a base matrix; the engine handles basic wall-kicks.

export const PIECE_TYPES = /** @type {const} */ (['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

const BASE_SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export const PIECE_COLORS = {
  // Toy-block inspired palette
  I: '#4aa3ff', // blue
  O: '#ffd84a', // yellow
  T: '#b06cff', // purple
  S: '#59d66b', // green
  Z: '#ff5b5b', // red
  J: '#3f6cff', // deep blue
  L: '#ff9b3f', // orange
};

export function rotateMatrixCW(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const out = Array.from({ length: w }, () => Array.from({ length: h }, () => 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = matrix[y][x];
    }
  }
  return out;
}

function computeRotations(base) {
  const rots = [base];
  for (let i = 1; i < 4; i++) rots.push(rotateMatrixCW(rots[i - 1]));
  return rots;
}

/** @type {Record<string, number[][][]>} */
export const PIECE_ROTATIONS = Object.fromEntries(
  PIECE_TYPES.map((t) => [t, computeRotations(BASE_SHAPES[t])])
);

export function getPieceMatrix(type, rotation) {
  const rots = PIECE_ROTATIONS[type];
  return rots[((rotation % 4) + 4) % 4];
}

