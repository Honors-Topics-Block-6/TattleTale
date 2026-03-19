import { useRef, useEffect, useState, useCallback } from 'react';

const GAME_W = 750;
const GAME_H = 460;
const GRAVITY = 0.22;
const GROUND_Y_RATIO = 0.85;
const SLING_X_RATIO = 0.15;
const SLING_Y_RATIO = 0.65;
const MAX_PULL = 80;
const BIRD_RADIUS = 12;
const TRAIL_LENGTH = 40;
const SETTLE_FRAMES = 50;
const LAUNCH_POWER = 0.12;

const BIRD_TYPES = {
  red:    { body: '#E53935', outline: '#B71C1C', crest: '#C62828', belly: '#EF5350', trail: [200, 60, 60], flame: 'rgba(255,150,0,0.4)' },
  blue:   { body: '#2196F3', outline: '#1565C0', crest: '#1976D2', belly: '#64B5F6', trail: [60, 130, 220], flame: 'rgba(100,180,255,0.4)' },
  yellow: { body: '#FFC107', outline: '#F57F17', crest: '#FF8F00', belly: '#FFD54F', trail: [220, 180, 40], flame: 'rgba(255,230,100,0.4)' },
  black:  { body: '#424242', outline: '#212121', crest: '#333333', belly: '#616161', trail: [100, 100, 100], flame: 'rgba(180,80,30,0.5)' },
  white:  { body: '#ECEFF1', outline: '#90A4AE', crest: '#CFD8DC', belly: '#FFFFFF', trail: [190, 200, 210], flame: 'rgba(200,220,255,0.35)' },
  green:  { body: '#4CAF50', outline: '#2E7D32', crest: '#388E3C', belly: '#81C784', trail: [70, 180, 70], flame: 'rgba(100,255,120,0.4)' },
  pink:   { body: '#E91E90', outline: '#AD1457', crest: '#C2185B', belly: '#F48FB1', trail: [220, 80, 160], flame: 'rgba(255,130,200,0.4)' },
};

const PIG_TYPES = {
  green:  { body: '#6BBF47', outline: '#3A7A1E', nose: '#4A9E2B', spots: '#3A7A1E' },
  blue:   { body: '#5B9BD5', outline: '#2A6BA0', nose: '#4A8DC0', spots: '#2A6BA0' },
  purple: { body: '#AB47BC', outline: '#7B1FA2', nose: '#8E24AA', spots: '#7B1FA2' },
  gold:   { body: '#FFD740', outline: '#F9A825', nose: '#FFC107', spots: '#F9A825' },
  pink:   { body: '#F06292', outline: '#C2185B', nose: '#E91E63', spots: '#C2185B' },
};

function createLevels(w, h) {
  const gnd = h * GROUND_Y_RATIO;
  const bw = 20;
  const bh = 50;
  const bs = 20;
  const pigR = 14;
  const baseX = w * 0.55;

  return [
    // --- LEVEL 1: open arch, all wood, 1 easy pig ---
    {
      name: 'Level 1 — First Shot',
      birds: ['red', 'yellow', 'blue'],
      minScore: 1000,
      blocks: [
        { x: baseX, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 80, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 40, y: gnd - bh - bs, w: 100, h: bs, type: 'wood', hp: 2 },
      ],
      pigs: [
        { x: baseX + 40, y: gnd - pigR, r: pigR, hp: 1, color: 'green' },
      ],
    },

    // --- LEVEL 2: two-story wood tower, 2 pigs stacked ---
    {
      name: 'Level 2 — Double Trouble',
      birds: ['red', 'blue', 'yellow'],
      minScore: 2000,
      blocks: [
        { x: baseX, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 90, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 45, y: gnd - bh - bs, w: 110, h: bs, type: 'wood', hp: 2 },
        // second story
        { x: baseX + 15, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 75, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 45, y: gnd - bh - bs - bh - bs, w: 80, h: bs, type: 'wood', hp: 2 },
      ],
      pigs: [
        { x: baseX + 45, y: gnd - pigR, r: pigR, hp: 1, color: 'green' },
        { x: baseX + 45, y: gnd - bh - bs - pigR, r: pigR, hp: 1, color: 'blue' },
      ],
    },

    // --- LEVEL 3: stone-reinforced shelter, pig tucked inside, 2 pigs spread apart ---
    {
      name: 'Level 3 — Stone Shelter',
      birds: ['red', 'pink', 'blue'],
      minScore: 3500,
      blocks: [
        // main shelter — stone walls, wood roof
        { x: baseX, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 80, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 40, y: gnd - bh - bs, w: 100, h: bs, type: 'wood', hp: 2 },
        // outer shield wall
        { x: baseX - 30, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        // distant second pig behind small wall
        { x: baseX + 180, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 220, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 200, y: gnd - bh - bs, w: 60, h: bs, type: 'stone', hp: 3 },
      ],
      pigs: [
        { x: baseX + 40, y: gnd - pigR, r: pigR, hp: 2, color: 'blue' },
        { x: baseX + 200, y: gnd - pigR, r: pigR, hp: 1, color: 'purple' },
      ],
    },

    // --- LEVEL 4: fortress with enclosed pigs, heavy stone, 3 tough pigs ---
    {
      name: 'Level 4 — Fortress',
      birds: ['red', 'black', 'yellow'],
      minScore: 5000,
      blocks: [
        // main fortress — thick stone box enclosure
        { x: baseX - 10, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 100, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 45, y: gnd - bh - bs, w: 130, h: bs, type: 'stone', hp: 3 },
        // inner walls splitting the fortress
        { x: baseX + 45, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        // second story fortification
        { x: baseX + 10, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 80, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 45, y: gnd - bh - bs - bh - bs, w: 90, h: bs, type: 'stone', hp: 3 },
        // outpost to the right
        { x: baseX + 170, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 230, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 200, y: gnd - bh - bs, w: 80, h: bs, type: 'wood', hp: 2 },
        // outpost second story
        { x: baseX + 185, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 215, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 200, y: gnd - bh - bs - bh - bs, w: 50, h: bs, type: 'wood', hp: 2 },
      ],
      pigs: [
        { x: baseX + 22, y: gnd - pigR, r: pigR, hp: 2, color: 'green' },
        { x: baseX + 70, y: gnd - pigR, r: pigR, hp: 2, color: 'blue' },
        { x: baseX + 200, y: gnd - bh - bs - pigR, r: pigR, hp: 1, color: 'purple' },
      ],
    },

    // --- LEVEL 5: the citadel — massive multi-layer stone, 4 pigs, king pig inside ---
    {
      name: 'Level 5 — The Citadel',
      birds: ['black', 'red', 'yellow'],
      minScore: 7000,
      blocks: [
        // outer curtain wall
        { x: baseX - 30, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 140, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 55, y: gnd - bh - bs, w: 190, h: bs, type: 'stone', hp: 3 },
        // inner keep walls
        { x: baseX + 20, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 90, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 55, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        // keep roof
        { x: baseX + 55, y: gnd - bh - bs - bh - bs, w: 90, h: bs, type: 'stone', hp: 3 },
        // tower pillars (third story)
        { x: baseX + 30, y: gnd - bh - bs - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 80, y: gnd - bh - bs - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 55, y: gnd - bh - bs - bh - bs - bh - bs, w: 70, h: bs, type: 'stone', hp: 3 },
        // far-right bunker
        { x: baseX + 200, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 260, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 230, y: gnd - bh - bs, w: 80, h: bs, type: 'stone', hp: 3 },
        { x: baseX + 215, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 245, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 230, y: gnd - bh - bs - bh - bs, w: 50, h: bs, type: 'wood', hp: 2 },
      ],
      pigs: [
        { x: baseX + 55, y: gnd - pigR, r: pigR, hp: 3, color: 'gold' },
        { x: baseX - 5, y: gnd - pigR, r: pigR, hp: 2, color: 'purple' },
        { x: baseX + 115, y: gnd - pigR, r: pigR, hp: 2, color: 'blue' },
        { x: baseX + 230, y: gnd - pigR, r: pigR, hp: 2, color: 'pink' },
      ],
    },

    // --- LEVEL 6: pyramid — stacked wood steps with pigs on each tier ---
    {
      name: 'Level 6 — Pyramid',
      birds: ['yellow', 'red', 'blue', 'yellow'],
      minScore: 8000,
      blocks: [
        // base row
        { x: baseX,       y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 40,  y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 80,  y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 120, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 160, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        // second row
        { x: baseX + 20,  y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 80,  y: gnd - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 140, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        // shelves
        { x: baseX + 10,  y: gnd - bh - bs,       w: 60, h: bs, type: 'wood', hp: 2 },
        { x: baseX + 100, y: gnd - bh - bs,       w: 80, h: bs, type: 'wood', hp: 2 },
        // top
        { x: baseX + 80,  y: gnd - bh - bs - bh - bs - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 80,  y: gnd - bh - bs - bh - bs - bh - bs, w: 40, h: bs, type: 'stone', hp: 3 },
      ],
      pigs: [
        { x: baseX + 40,  y: gnd - pigR, r: pigR, hp: 1, color: 'green' },
        { x: baseX + 120, y: gnd - pigR, r: pigR, hp: 1, color: 'green' },
        { x: baseX + 80,  y: gnd - bh - bs - pigR, r: pigR, hp: 2, color: 'gold' },
        { x: baseX + 80,  y: gnd - bh - bs - bh - bs - bh - pigR, r: pigR, hp: 2, color: 'purple' },
      ],
    },

    // --- LEVEL 7: scattered outposts — five separate small structures spread wide ---
    {
      name: 'Level 7 — Scattered',
      birds: ['red', 'blue', 'yellow', 'pink', 'red'],
      minScore: 10000,
      blocks: [
        // post 1
        { x: baseX - 20,  y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 20,  y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX,       y: gnd - bh - bs, w: 60, h: bs, type: 'wood', hp: 2 },
        // post 2
        { x: baseX + 75,  y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 115, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 95,  y: gnd - bh - bs, w: 60, h: bs, type: 'stone', hp: 3 },
        // post 3
        { x: baseX + 155, y: gnd - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        { x: baseX + 155, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
        // post 4
        { x: baseX + 210, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 250, y: gnd - bh, w: bw, h: bh, type: 'stone', hp: 3 },
        { x: baseX + 230, y: gnd - bh - bs, w: 60, h: bs, type: 'wood', hp: 2 },
        { x: baseX + 230, y: gnd - bh - bs - bh, w: bw, h: bh, type: 'wood', hp: 2 },
      ],
      pigs: [
        { x: baseX,       y: gnd - bh - bs - pigR, r: pigR, hp: 1, color: 'green' },
        { x: baseX + 95,  y: gnd - bh - bs - pigR, r: pigR, hp: 2, color: 'blue' },
        { x: baseX + 155, y: gnd - bh - bs - bh - pigR, r: pigR, hp: 1, color: 'pink' },
        { x: baseX + 230, y: gnd - bh - bs - pigR, r: pigR, hp: 2, color: 'purple' },
        { x: baseX + 230, y: gnd - bh - bs - bh - pigR, r: pigR, hp: 1, color: 'gold' },
      ],
    },
  ];
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx - rw / 2, rx + rw / 2);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

function circleCircle(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy < (r1 + r2) * (r1 + r2);
}

function blocksOverlapX(a, b) {
  return (a.x + a.w / 2) > (b.x - b.w / 2) && (a.x - a.w / 2) < (b.x + b.w / 2);
}

function drawStarShape(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
}

function AngryBirdsComponent({ windowId, onLevelComplete }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const animRef = useRef(null);
  const [score, setScore] = useState(0);
  const [levelIdx, setLevelIdx] = useState(0);
  const [birdsLeft, setBirdsLeft] = useState(3);
  const [phase, setPhase] = useState('aiming');
  const [message, setMessage] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const initLevel = useCallback((lvlIndex, w, h) => {
    const levels = createLevels(w, h);
    const lvl = levels[clamp(lvlIndex, 0, levels.length - 1)];
    const slingX = w * SLING_X_RATIO;
    const slingY = h * SLING_Y_RATIO;

    const birdCount = lvl.birds.length;
    gameRef.current = {
      w, h,
      ground: h * GROUND_Y_RATIO,
      slingX, slingY,
      bird: { x: slingX, y: slingY, vx: 0, vy: 0, r: BIRD_RADIUS, active: false, landed: false, color: 'red' },
      blocks: lvl.blocks.map(b => ({ ...b, vx: 0, vy: 0, destroyed: false })),
      pigs: lvl.pigs.map(p => ({ ...p, vx: 0, vy: 0, destroyed: false })),
      totalBirds: birdCount,
      birdsLeft: birdCount,
      minScore: lvl.minScore || 0,
      trail: [],
      particles: [],
      shockwaves: [],
      scorePopups: [],
      dustClouds: [],
      confetti: [],
      dragging: false,
      dragX: slingX,
      dragY: slingY,
      settleTimer: 0,
      phase: 'aiming',
      score: 0,
      levelIdx: lvlIndex,
      totalLevels: levels.length,
      failReason: null,
      shakeX: 0,
      shakeY: 0,
      shakeTimer: 0,
      frameCount: 0,
      overlayAlpha: 0,
      slowMo: 0,
    };

    setBirdsLeft(birdCount);
    setPhase('aiming');
    setScore(0);
    setMessage(lvl.name);
    setTimeout(() => setMessage(''), 1500);
  }, []);

  // Fix canvas to a constant resolution and CSS-scale it to fit without stretching.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = GAME_W;
    canvas.height = GAME_H;

    function updateScale() {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const scale = Math.min(cw / GAME_W, ch / GAME_H);
      const sw = Math.floor(GAME_W * scale);
      const sh = Math.floor(GAME_H * scale);
      canvas.style.width = `${sw}px`;
      canvas.style.height = `${sh}px`;
      canvas.style.left = `${Math.floor((cw - sw) / 2)}px`;
      canvas.style.top = `${Math.floor((ch - sh) / 2)}px`;
    }

    const ro = new ResizeObserver(updateScale);
    ro.observe(container);
    updateScale();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    initLevel(levelIdx, GAME_W, GAME_H);
  }, [levelIdx, resetKey, initLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function addShake(g, intensity) {
      g.shakeTimer = Math.max(g.shakeTimer, 8);
      g.shakeX = (Math.random() - 0.5) * intensity;
      g.shakeY = (Math.random() - 0.5) * intensity;
    }

    function addShockwave(g, x, y, maxR, color) {
      g.shockwaves.push({ x, y, r: 5, maxR, life: 1.0, color: color || 'rgba(255,255,255,0.6)' });
    }

    function addScorePopup(g, x, y, text, color) {
      g.scorePopups.push({ x, y, text, color: color || '#FFD600', life: 60, vy: -1.2 });
    }

    function addDustCloud(g, x, y, count) {
      for (let i = 0; i < count; i++) {
        g.dustClouds.push({
          x: x + (Math.random() - 0.5) * 20,
          y,
          r: 4 + Math.random() * 8,
          vx: (Math.random() - 0.5) * 2,
          vy: -0.5 - Math.random() * 1.5,
          life: 25 + Math.random() * 15,
        });
      }
    }

    function spawnParticles(g, x, y, color, count, speed) {
      const spd = speed || 3;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const s = 0.5 + Math.random() * spd;
        const shape = Math.random() > 0.5 ? 'square' : 'circle';
        g.particles.push({
          x, y,
          vx: Math.cos(angle) * s,
          vy: Math.sin(angle) * s - 2,
          life: 30 + Math.random() * 30,
          color,
          r: 1.5 + Math.random() * 4,
          shape,
          rot: Math.random() * Math.PI * 2,
          rotV: (Math.random() - 0.5) * 0.3,
        });
      }
    }

    function spawnConfetti(g) {
      for (let i = 0; i < 60; i++) {
        g.confetti.push({
          x: g.w * 0.2 + Math.random() * g.w * 0.6,
          y: -10 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 3,
          vy: 1 + Math.random() * 2,
          r: 3 + Math.random() * 4,
          color: ['#E53935', '#FFD600', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'][Math.floor(Math.random() * 6)],
          rot: Math.random() * Math.PI * 2,
          rotV: (Math.random() - 0.5) * 0.2,
          life: 120 + Math.random() * 60,
          shape: Math.random() > 0.4 ? 'rect' : 'circle',
        });
      }
    }

    function update() {
      const g = gameRef.current;
      if (!g) return;
      g.frameCount++;

      if (g.slowMo > 0) {
        g.slowMo--;
        if (g.frameCount % 3 !== 0) return;
      }

      const bird = g.bird;

      if (bird.active && !bird.landed) {
        bird.vy += GRAVITY;
        bird.x += bird.vx;
        bird.y += bird.vy;

        g.trail.push({ x: bird.x, y: bird.y, age: 0 });
        if (g.trail.length > TRAIL_LENGTH) g.trail.shift();

        if (bird.y + bird.r >= g.ground) {
          bird.y = g.ground - bird.r;
          if (Math.abs(bird.vy) > 1.5) {
            addDustCloud(g, bird.x, g.ground, 5);
            addShake(g, 3);
          }
          bird.vy = 0;
          bird.vx *= 0.6;
          if (Math.abs(bird.vx) < 0.3) {
            bird.vx = 0;
            bird.landed = true;
          }
        }
        if (bird.x - bird.r > g.w || bird.x + bird.r < 0) {
          bird.landed = true;
        }

        for (const block of g.blocks) {
          if (block.destroyed) continue;
          if (circleRect(bird.x, bird.y, bird.r, block.x, block.y, block.w, block.h)) {
            const speed = Math.sqrt(bird.vx * bird.vx + bird.vy * bird.vy);
            const damage = Math.max(1, Math.ceil(speed / 3));
            block.hp -= damage;

            // Transfer momentum proportional to impact speed — no artificial upward kick
            const impactFactor = block.type === 'stone' ? 0.22 : 0.38;
            block.vx += bird.vx * impactFactor;
            block.vy += bird.vy * impactFactor;

            // Bird deflects off the block surface but keeps ~40% speed to punch through structures
            const bCenterX = block.x;
            const bCenterY = block.y + block.h / 2;
            const nx = bird.x - bCenterX;
            const ny = bird.y - bCenterY;
            const len = Math.sqrt(nx * nx + ny * ny) || 1;
            bird.vx = (nx / len) * speed * 0.4;
            bird.vy = (ny / len) * speed * 0.4;

            addShake(g, Math.min(speed * 0.8, 8));
            addShockwave(g, bird.x, bird.y, 30 + speed * 2, 'rgba(255,200,100,0.5)');

            if (block.hp <= 0) {
              block.destroyed = true;
              const pts = block.type === 'stone' ? 500 : 300;
              g.score += pts;
              spawnParticles(g, block.x, block.y + block.h / 2, block.type === 'stone' ? '#888' : '#c8a050', 14, 4);
              spawnParticles(g, block.x, block.y + block.h / 2, '#fff', 4, 2);
              addScorePopup(g, block.x, block.y, `+${pts}`, block.type === 'stone' ? '#ccc' : '#e8c070');
              addDustCloud(g, block.x, block.y + block.h, 4);
              if (speed > 5) g.slowMo = 6;
            }
          }
        }

        for (const pig of g.pigs) {
          if (pig.destroyed) continue;
          if (circleCircle(bird.x, bird.y, bird.r, pig.x, pig.y, pig.r)) {
            const speed = Math.sqrt(bird.vx * bird.vx + bird.vy * bird.vy);
            pig.hp -= Math.max(1, Math.ceil(speed / 2));
            pig.vx += bird.vx * 0.5;
            pig.vy += bird.vy * 0.4 - 2;

            const nx = bird.x - pig.x;
            const ny = bird.y - pig.y;
            const len = Math.sqrt(nx * nx + ny * ny) || 1;
            bird.vx = (nx / len) * speed * 0.1;
            bird.vy = (ny / len) * speed * 0.1;

            addShake(g, 6);
            addShockwave(g, pig.x, pig.y, 40, 'rgba(100,255,100,0.5)');

            if (pig.hp <= 0) {
              pig.destroyed = true;
              g.score += 1000;
              spawnParticles(g, pig.x, pig.y, '#6BBF47', 16, 4);
              spawnParticles(g, pig.x, pig.y, '#fff', 6, 2);
              addScorePopup(g, pig.x, pig.y - 15, '+1000', '#4f4');
              addShockwave(g, pig.x, pig.y, 60, 'rgba(100,255,100,0.4)');
              g.slowMo = 8;
            }
          }
        }
      }

      for (const block of g.blocks) {
        if (block.destroyed) continue;
        block.vy += GRAVITY * 0.6;
        block.x += block.vx;
        block.y += block.vy;
        block.vx *= 0.94;

        if (block.y + block.h >= g.ground) {
          block.y = g.ground - block.h;
          if (block.vy > 2) {
            block.hp -= 1;
            addDustCloud(g, block.x, g.ground, 3);
            addShake(g, 2);
            if (block.hp <= 0) {
              block.destroyed = true;
              const pts = block.type === 'stone' ? 500 : 300;
              g.score += pts;
              spawnParticles(g, block.x, block.y + block.h / 2, block.type === 'stone' ? '#888' : '#c8a050', 10, 3);
              addScorePopup(g, block.x, block.y, `+${pts}`);
              continue;
            }
          }
          block.vy = 0;
          block.vx *= 0.7;
          if (Math.abs(block.vx) < 0.2) block.vx = 0;
        }
      }

      // AABB block-block collision with minimum-translation-vector resolution
      for (let bi = 0; bi < g.blocks.length; bi++) {
        const a = g.blocks[bi];
        if (a.destroyed) continue;
        for (let bj = bi + 1; bj < g.blocks.length; bj++) {
          const b = g.blocks[bj];
          if (b.destroyed) continue;

          const ax1 = a.x - a.w / 2, ax2 = a.x + a.w / 2;
          const ay1 = a.y,           ay2 = a.y + a.h;
          const bx1 = b.x - b.w / 2, bx2 = b.x + b.w / 2;
          const by1 = b.y,           by2 = b.y + b.h;

          const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
          const overlapY = Math.min(ay2 - by1, by2 - ay1);
          if (overlapX <= 0 || overlapY <= 0) continue;

          if (overlapX < overlapY) {
            // Separate horizontally
            const dir = a.x < b.x ? 1 : -1;
            const push = overlapX * 0.5;
            a.x -= dir * push;
            b.x += dir * push;
            const avgVx = (a.vx + b.vx) * 0.5;
            a.vx = avgVx * 0.85;
            b.vx = avgVx * 0.85;
          } else {
            // Separate vertically
            if (a.y < b.y) {
              // a is above b
              a.y = by1 - a.h;
              if (a.vy > 0.5) {
                b.vy += a.vy * 0.25;
                b.vx += a.vx * 0.08;
              }
              a.vy = 0;
              a.vx *= 0.85;
            } else {
              // b is above a
              b.y = ay1 - b.h;
              if (b.vy > 0.5) {
                a.vy += b.vy * 0.25;
                a.vx += b.vx * 0.08;
              }
              b.vy = 0;
              b.vx *= 0.85;
            }
          }
        }
      }

      for (const pig of g.pigs) {
        if (pig.destroyed) continue;
        pig.vy += GRAVITY * 0.6;
        pig.x += pig.vx;
        pig.y += pig.vy;
        pig.vx *= 0.94;

        if (pig.y + pig.r >= g.ground) {
          pig.y = g.ground - pig.r;
          pig.vy = 0;
          pig.vx *= 0.7;
          if (Math.abs(pig.vx) < 0.2) pig.vx = 0;
        }

        for (const block of g.blocks) {
          if (block.destroyed) continue;
          if (circleRect(pig.x, pig.y, pig.r, block.x, block.y, block.w, block.h)) {
            const bSpeed = Math.sqrt(block.vx * block.vx + block.vy * block.vy);
            if (bSpeed > 1) {
              pig.hp -= 1;
              addShake(g, 3);
              if (pig.hp <= 0) {
                pig.destroyed = true;
                g.score += 1000;
                spawnParticles(g, pig.x, pig.y, '#6BBF47', 14, 4);
                addScorePopup(g, pig.x, pig.y - 15, '+1000', '#4f4');
                addShockwave(g, pig.x, pig.y, 50, 'rgba(100,255,100,0.4)');
              }
            }
            pig.vx += block.vx * 0.3;
            pig.vy += block.vy * 0.2 - 0.5;
            const bCx = block.x;
            const bCy = block.y + block.h / 2;
            const nx = pig.x - bCx;
            const ny = pig.y - bCy;
            const len = Math.sqrt(nx * nx + ny * ny) || 1;
            pig.x += (nx / len) * 0.5;
            pig.y += (ny / len) * 0.5;
          }
        }

        for (const other of g.blocks) {
          if (other.destroyed) continue;
          if (pig.y + pig.r > other.y && pig.y - pig.r < other.y && blocksOverlapX({ x: pig.x, w: pig.r * 2 }, other)) {
            pig.y = other.y - pig.r;
            pig.vy = 0;
          }
        }
      }

      g.particles = g.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.rot += p.rotV || 0;
        p.life--;
        return p.life > 0;
      });

      g.shockwaves = g.shockwaves.filter(s => {
        s.r += 3;
        s.life -= 0.06;
        return s.life > 0;
      });

      g.scorePopups = g.scorePopups.filter(p => {
        p.y += p.vy;
        p.vy *= 0.98;
        p.life--;
        return p.life > 0;
      });

      g.dustClouds = g.dustClouds.filter(d => {
        d.x += d.vx;
        d.y += d.vy;
        d.r += 0.3;
        d.life--;
        return d.life > 0;
      });

      g.confetti = g.confetti.filter(c => {
        c.x += c.vx + Math.sin(c.rot) * 0.3;
        c.y += c.vy;
        c.rot += c.rotV;
        c.vy += 0.02;
        c.life--;
        return c.life > 0 && c.y < g.h + 20;
      });

      for (const t of g.trail) t.age++;

      if (g.shakeTimer > 0) {
        g.shakeTimer--;
        g.shakeX = (Math.random() - 0.5) * g.shakeTimer * 0.8;
        g.shakeY = (Math.random() - 0.5) * g.shakeTimer * 0.8;
      } else {
        g.shakeX = 0;
        g.shakeY = 0;
      }

      if (g.phase === 'level-complete' || g.phase === 'game-over') {
        g.overlayAlpha = Math.min(1, g.overlayAlpha + 0.04);
      }

      if (bird.active && bird.landed && g.phase !== 'level-complete' && g.phase !== 'game-over') {
        g.settleTimer++;
        if (g.settleTimer >= SETTLE_FRAMES) {
          const allPigsDead = g.pigs.every(p => p.destroyed);
          if (allPigsDead) {
            g.score += g.birdsLeft * 500;
            if (g.score >= g.minScore) {
              g.phase = 'level-complete';
              g.overlayAlpha = 0;
              setPhase('level-complete');
              setScore(g.score);
              spawnConfetti(g);
              if (onLevelComplete) onLevelComplete(g.levelIdx, g.score);
              if (g.levelIdx + 1 >= g.totalLevels) {
                setMessage('You Win! All levels complete!');
              } else {
                setMessage('Level Complete!');
              }
            } else {
              g.phase = 'game-over';
              g.overlayAlpha = 0;
              g.failReason = 'score';
              setPhase('game-over');
              setScore(g.score);
              setMessage(`Need ${g.minScore.toLocaleString()} pts! Try again.`);
            }
          } else if (g.birdsLeft > 0) {
            g.bird = { x: g.slingX, y: g.slingY, vx: 0, vy: 0, r: BIRD_RADIUS, active: false, landed: false, color: 'red' };
            g.trail = [];
            g.settleTimer = 0;
            g.phase = 'aiming';
            setPhase('aiming');
          } else {
            g.phase = 'game-over';
            g.overlayAlpha = 0;
            g.failReason = 'birds';
            setPhase('game-over');
            setMessage('No birds left! Try again.');
          }
          setScore(g.score);
          setBirdsLeft(g.birdsLeft);
        }
      }
    }

    function drawBackground(g) {
      const grad = ctx.createLinearGradient(0, 0, 0, g.h);
      grad.addColorStop(0, '#87CEEB');
      grad.addColorStop(0.6, '#B0E0FF');
      grad.addColorStop(0.85, '#7CCC47');
      grad.addColorStop(1, '#5AA030');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, g.w, g.h);

      ctx.fillStyle = '#5AA030';
      ctx.fillRect(0, g.ground, g.w, g.h - g.ground);

      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.6;
      const drift = Math.sin(g.frameCount * 0.005) * 8;
      for (const [cx, cy, rx, ry] of [[g.w * 0.3, 40, 40, 18], [g.w * 0.35, 35, 30, 15], [g.w * 0.7, 55, 45, 20], [g.w * 0.75, 50, 35, 16]]) {
        ctx.beginPath();
        ctx.ellipse(cx + drift, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawSling(g) {
      ctx.fillStyle = '#5C3A1E';
      ctx.fillRect(g.slingX - 4, g.slingY - 30, 8, 55);
      ctx.fillStyle = '#7A4F2E';
      ctx.fillRect(g.slingX - 14, g.slingY - 35, 10, 12);
      ctx.fillRect(g.slingX + 4, g.slingY - 35, 10, 12);
    }

    function drawBand(g) {
      if (g.phase === 'aiming' && g.dragging) {
        ctx.strokeStyle = '#3a2010';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(g.slingX - 9, g.slingY - 28);
        ctx.lineTo(g.dragX, g.dragY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.slingX + 9, g.slingY - 28);
        ctx.lineTo(g.dragX, g.dragY);
        ctx.stroke();
      }
    }

    function drawPowerIndicator(g) {
      if (g.phase !== 'aiming' || !g.dragging) return;
      const dx = g.slingX - g.dragX;
      const dy = g.slingY - g.dragY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const power = clamp(dist / MAX_PULL, 0, 1);

      const barW = 60;
      const barH = 6;
      const barX = g.slingX - barW / 2;
      const barY = g.slingY - 55;

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#4CAF50');
      grad.addColorStop(0.5, '#FFC107');
      grad.addColorStop(1, '#F44336');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW * power, barH);

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      const numDots = 8;
      const launchVx = dx * power * LAUNCH_POWER;
      const launchVy = dy * power * LAUNCH_POWER;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      let px = g.slingX, py = g.slingY, pvx = launchVx, pvy = launchVy;
      for (let i = 0; i < numDots; i++) {
        for (let step = 0; step < 4; step++) {
          pvx *= 1; pvy += GRAVITY;
          px += pvx; py += pvy;
        }
        const alpha = 0.4 * (1 - i / numDots);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawBird(g, x, y, r, flying) {
      const bt = BIRD_TYPES[g.bird.color] || BIRD_TYPES.red;
      const angle = flying ? Math.atan2(g.bird.vy, g.bird.vx) : 0;

      ctx.save();
      ctx.translate(x, y);
      if (flying) ctx.rotate(angle);

      ctx.fillStyle = bt.body;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = bt.outline;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = bt.belly;
      ctx.beginPath();
      ctx.arc(1, 3, r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      if (flying) ctx.rotate(-angle);

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-3, -3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -3, 4, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#222';
      if (flying) {
        ctx.beginPath(); ctx.arc(-2, -2, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -2, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-1, -5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, -7); ctx.lineTo(3, -5); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -2, 2, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = '#FF9800';
      ctx.beginPath();
      ctx.moveTo(r * 0.6, 2);
      ctx.lineTo(r * 1.1, 0);
      ctx.lineTo(r * 0.6, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = bt.crest;
      ctx.beginPath(); ctx.moveTo(-2, -r); ctx.lineTo(0, -r - 6); ctx.lineTo(2, -r); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1, -r + 1); ctx.lineTo(4, -r - 5); ctx.lineTo(5, -r + 1); ctx.closePath(); ctx.fill();

      ctx.restore();

      if (flying) {
        ctx.fillStyle = bt.flame;
        for (let i = 0; i < 3; i++) {
          const ox = -g.bird.vx * (i + 1) * 0.6 + (Math.random() - 0.5) * 4;
          const oy = -g.bird.vy * (i + 1) * 0.6 + (Math.random() - 0.5) * 4;
          const sr = r * (0.3 - i * 0.08);
          if (sr > 0) {
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    function drawTrail(g) {
      const bt = BIRD_TYPES[g.bird.color] || BIRD_TYPES.red;
      const [tr, tg, tb] = bt.trail;
      for (let i = 0; i < g.trail.length; i++) {
        const t = g.trail[i];
        const frac = i / g.trail.length;
        const alpha = frac * 0.5 * Math.max(0, 1 - t.age * 0.02);
        const r = 1 + frac * 2;
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawBlocks(g) {
      for (const block of g.blocks) {
        if (block.destroyed) continue;
        const x = block.x - block.w / 2;
        const y = block.y;

        const speed = Math.sqrt(block.vx * block.vx + block.vy * block.vy);
        if (speed > 0.5) {
          ctx.save();
          ctx.translate(block.x, block.y + block.h / 2);
          ctx.rotate(block.vx * 0.02);
          ctx.translate(-block.x, -(block.y + block.h / 2));
        }

        if (block.type === 'wood') {
          ctx.fillStyle = '#C8944A';
          ctx.fillRect(x, y, block.w, block.h);
          ctx.strokeStyle = '#8B6914';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, block.w, block.h);
          ctx.strokeStyle = 'rgba(139,105,20,0.3)';
          for (let ly = y + 8; ly < y + block.h; ly += 8) {
            ctx.beginPath();
            ctx.moveTo(x + 2, ly);
            ctx.lineTo(x + block.w - 2, ly);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = '#9E9E9E';
          ctx.fillRect(x, y, block.w, block.h);
          ctx.strokeStyle = '#616161';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, block.w, block.h);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(x + 1, y + 1, block.w / 2, block.h / 3);
        }

        if (block.hp === 1) {
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + block.w * 0.2, y + block.h * 0.1); ctx.lineTo(x + block.w * 0.7, y + block.h * 0.8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + block.w * 0.8, y + block.h * 0.15); ctx.lineTo(x + block.w * 0.3, y + block.h * 0.9); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + block.w * 0.5, y); ctx.lineTo(x + block.w * 0.4, y + block.h * 0.5); ctx.stroke();
        }

        if (speed > 0.5) ctx.restore();
      }
    }

    function drawPigs(g) {
      const birdFlying = g.bird.active && !g.bird.landed;

      for (const pig of g.pigs) {
        if (pig.destroyed) continue;

        const pt = PIG_TYPES[pig.color] || PIG_TYPES.green;
        const wobble = Math.sin(g.frameCount * 0.1 + pig.x) * (birdFlying ? 1.5 : 0.3);

        ctx.save();
        ctx.translate(pig.x, pig.y);
        ctx.rotate(wobble * 0.05);

        ctx.fillStyle = pt.body;
        ctx.beginPath();
        ctx.arc(0, 0, pig.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pt.outline;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        const eyeSpread = birdFlying ? 5 : 4;
        const eyeY = birdFlying ? -3 : -2;
        const eyeR = birdFlying ? 5.5 : 5;
        ctx.beginPath(); ctx.arc(-eyeSpread, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeSpread, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#222';
        const pupilOff = birdFlying ? 1 : 0;
        ctx.beginPath(); ctx.arc(-eyeSpread + 1 + pupilOff, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeSpread + 1 + pupilOff, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill();

        if (birdFlying) {
          ctx.strokeStyle = pt.outline;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-eyeSpread - 4, eyeY - 5); ctx.lineTo(-eyeSpread + 2, eyeY - 3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(eyeSpread + 4, eyeY - 5); ctx.lineTo(eyeSpread - 2, eyeY - 3); ctx.stroke();
        }

        ctx.fillStyle = pt.nose;
        ctx.beginPath();
        ctx.ellipse(1, 5, 5, birdFlying ? 2 : 3, 0, 0, Math.PI);
        ctx.fill();

        ctx.fillStyle = pt.spots;
        ctx.beginPath(); ctx.arc(1, 5, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, 5, 1.5, 0, Math.PI * 2); ctx.fill();

        if (pig.hp <= 1) {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(6, 3, 3, 0, Math.PI * 0.7); ctx.stroke();

          ctx.fillStyle = 'rgba(100,0,0,0.3)';
          ctx.beginPath(); ctx.arc(-4, 2, 2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
      }
    }

    function drawShockwaves(g) {
      for (const s of g.shockwaves) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2 * s.life;
        ctx.globalAlpha = s.life * 0.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawDustClouds(g) {
      for (const d of g.dustClouds) {
        const alpha = (d.life / 40) * 0.4;
        ctx.fillStyle = `rgba(180, 160, 120, ${alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawParticles(g) {
      for (const p of g.particles) {
        const alpha = Math.min(1, p.life / 20);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);

        if (p.shape === 'square') {
          ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawScorePopups(g) {
      for (const p of g.scorePopups) {
        const alpha = Math.min(1, p.life / 20);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 16px Tahoma, sans-serif';
        ctx.textAlign = 'center';

        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }

    function drawConfetti(g) {
      for (const c of g.confetti) {
        const alpha = Math.min(1, c.life / 30);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = c.color;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        if (c.shape === 'rect') {
          ctx.fillRect(-c.r, -c.r / 2, c.r * 2, c.r);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, c.r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawUI(g) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, g.w, 32);

      ctx.font = 'bold 14px Tahoma, sans-serif';
      ctx.textAlign = 'left';
      const scoreMet = g.score >= g.minScore;
      ctx.fillStyle = scoreMet ? '#4CFF4C' : '#FFD600';
      ctx.fillText(`Score: ${g.score}`, 10, 22);

      if (g.minScore > 0) {
        ctx.fillStyle = scoreMet ? 'rgba(100,255,100,0.7)' : 'rgba(255,255,255,0.5)';
        ctx.font = '11px Tahoma, sans-serif';
        ctx.fillText(`Goal: ${g.minScore.toLocaleString()}`, 10 + ctx.measureText(`Score: ${g.score}`).width + 14, 22);
      }

      ctx.font = 'bold 14px Tahoma, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      const pigsAlive = g.pigs.filter(p => !p.destroyed).length;
      ctx.fillText(`${pigsAlive} pig${pigsAlive !== 1 ? 's' : ''} left`, g.w / 2, 22);

      ctx.textAlign = 'right';
      const hudBird = BIRD_TYPES.red;
      for (let i = 0; i < g.birdsLeft; i++) {
        ctx.fillStyle = hudBird.body;
        ctx.beginPath();
        ctx.arc(g.w - 20 - i * 22, 16, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hudBird.outline;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function drawOverlay(g, text, subText) {
      const a = g.overlayAlpha;
      ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`;
      ctx.fillRect(0, 0, g.w, g.h);

      const cx = g.w / 2;
      const cy = g.h / 2;
      const scale = 0.5 + a * 0.5;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      const starPulse = 1 + Math.sin(g.frameCount * 0.08) * 0.15;
      ctx.fillStyle = '#FFD600';
      ctx.globalAlpha = a;
      drawStarShape(ctx, cx - 28, cy - 48, 5, 10 * starPulse, 4 * starPulse); ctx.fill();
      drawStarShape(ctx, cx, cy - 55, 5, 14 * starPulse, 6 * starPulse); ctx.fill();
      drawStarShape(ctx, cx + 28, cy - 48, 5, 10 * starPulse, 4 * starPulse); ctx.fill();

      ctx.globalAlpha = a;
      ctx.fillStyle = '#FFD600';
      ctx.font = 'bold 28px Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      ctx.strokeText(text, cx, cy - 15);
      ctx.fillText(text, cx, cy - 15);

      if (subText) {
        ctx.fillStyle = '#fff';
        ctx.font = '16px Tahoma, sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 3;
        ctx.strokeText(subText, cx, cy + 18);
        ctx.fillText(subText, cx, cy + 18);
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function render() {
      const g = gameRef.current;
      if (!g) return;

      ctx.clearRect(0, 0, g.w, g.h);

      ctx.save();
      ctx.translate(g.shakeX, g.shakeY);

      drawBackground(g);
      drawDustClouds(g);
      drawTrail(g);
      drawShockwaves(g);
      drawBlocks(g);
      drawPigs(g);
      drawSling(g);
      drawBand(g);
      drawPowerIndicator(g);

      if (g.phase === 'aiming' && g.dragging) {
        drawBird(g, g.dragX, g.dragY, g.bird.r, false);
      } else if (g.bird.active && !g.bird.landed) {
        drawBird(g, g.bird.x, g.bird.y, g.bird.r, true);
      } else if (g.phase === 'aiming') {
        drawBird(g, g.slingX, g.slingY, g.bird.r, false);
      }

      drawParticles(g);
      drawScorePopups(g);

      ctx.restore();

      drawUI(g);
      drawConfetti(g);

      if (g.phase === 'level-complete') {
        if (g.levelIdx + 1 >= g.totalLevels) {
          drawOverlay(g, 'You Win!', `Final Score: ${g.score} — Click to play again`);
        } else {
          drawOverlay(g, 'Level Complete!', `Score: ${g.score} — Click for next level`);
        }
      } else if (g.phase === 'game-over') {
        const reason = g.failReason === 'score'
          ? `Score: ${g.score} / ${g.minScore.toLocaleString()} needed — Click to retry`
          : 'Click to retry';
        drawOverlay(g, 'Game Over', reason);
      }
    }

    function gameLoop() {
      if (!gameRef.current) return;
      update();
      render();
      animRef.current = requestAnimationFrame(gameLoop);
    }

    animRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    function onMouseDown(e) {
      const g = gameRef.current;
      if (!g) return;

      if (g.phase === 'level-complete') {
        if (g.levelIdx + 1 >= g.totalLevels) {
          setScore(0);
          setLevelIdx(0);
          setResetKey(k => k + 1);
        } else {
          setLevelIdx(prev => prev + 1);
        }
        return;
      }
      if (g.phase === 'game-over') {
        setResetKey(k => k + 1);
        return;
      }

      if (g.phase !== 'aiming') return;
      const pos = getPos(e);
      const dx = pos.x - g.slingX;
      const dy = pos.y - g.slingY;
      if (Math.sqrt(dx * dx + dy * dy) < 50) {
        g.dragging = true;
        g.dragX = pos.x;
        g.dragY = pos.y;
      }
    }

    function onMouseMove(e) {
      const g = gameRef.current;
      if (!g || !g.dragging) return;
      const pos = getPos(e);
      const dx = pos.x - g.slingX;
      const dy = pos.y - g.slingY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MAX_PULL) {
        g.dragX = g.slingX + (dx / dist) * MAX_PULL;
        g.dragY = g.slingY + (dy / dist) * MAX_PULL;
      } else {
        g.dragX = pos.x;
        g.dragY = pos.y;
      }
    }

    function onMouseUp() {
      const g = gameRef.current;
      if (!g || !g.dragging) return;
      g.dragging = false;

      const dx = g.slingX - g.dragX;
      const dy = g.slingY - g.dragY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 10) return;

      const power = dist / MAX_PULL;
      g.bird.vx = dx * power * LAUNCH_POWER;
      g.bird.vy = dy * power * LAUNCH_POWER;
      g.bird.x = g.slingX;
      g.bird.y = g.slingY;
      g.bird.active = true;
      g.bird.landed = false;
      g.birdsLeft--;
      g.settleTimer = 0;
      g.trail = [];
      g.phase = 'flying';

      setBirdsLeft(g.birdsLeft);
      setPhase('flying');
    }

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#1a2a1a',
        overflow: 'hidden',
        position: 'relative',
        cursor: phase === 'aiming' ? 'crosshair' : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', display: 'block' }}
      />
    </div>
  );
}

const angryBirdsIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="17" r="12" fill="#E53935"/>
    <circle cx="16" cy="17" r="12" fill="none" stroke="#B71C1C" stroke-width="1.5"/>
    <circle cx="12" cy="14" r="3.5" fill="#fff"/>
    <circle cx="20" cy="14" r="3.5" fill="#fff"/>
    <circle cx="13" cy="14.5" r="2" fill="#222"/>
    <circle cx="21" cy="14.5" r="2" fill="#222"/>
    <polygon points="22,18 28,16 22,21" fill="#FF9800"/>
    <polygon points="14,6 16,2 18,6" fill="#E53935"/>
    <polygon points="17,7 20,3 20,7" fill="#E53935"/>
    <path d="M10,13 L8,10" stroke="#E53935" stroke-width="2" stroke-linecap="round"/>
    <path d="M22,13 L24,10" stroke="#E53935" stroke-width="2" stroke-linecap="round"/>
  </svg>
`);

const AngryBirds = {
  id: 'angry-birds',
  name: 'Angry Birds',
  icon: angryBirdsIcon,
  component: AngryBirdsComponent,
  defaultWindow: {
    width: 560,
    height: 400,
    resizable: true,
    minWidth: 320,
    minHeight: 240,
  },
  menuBar: {
    items: [
      {
        id: 'game',
        label: 'Game',
        items: [
          { id: 'new', label: 'New Game', shortcut: 'Ctrl+N', action: 'game.new' },
          { separator: true },
          { id: 'exit', label: 'Exit', action: 'file.exit' },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { id: 'how', label: 'How to Play', action: 'help.how' },
          { id: 'about', label: 'About Angry Birds', action: 'help.about' },
        ],
      },
    ],
  },
  desktopIcon: { show: true },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Launch birds at pigs!',
  },
};

export default AngryBirds;
export { AngryBirdsComponent };
