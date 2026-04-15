import { useEffect } from 'react';
import useGameStore from '../stores/gameStore';

const PHASE_CLASSES = [
  'phase-day-open',
  'phase-day-vote',
  'phase-day-resolve',
  'phase-night-actions',
  'phase-night-resolve',
  'phase-night-reveal',
];

const PHASE_TO_CLASS = {
  DAY_OPEN: 'phase-day-open',
  DAY_VOTE: 'phase-day-vote',
  DAY_RESOLVE: 'phase-day-resolve',
  NIGHT_ACTIONS: 'phase-night-actions',
  NIGHT_RESOLVE: 'phase-night-resolve',
  NIGHT_REVEAL: 'phase-night-reveal',
};

export default function useThemeEffect() {
  const phase = useGameStore((s) => s.phase);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const status = useGameStore((s) => s.status);

  useEffect(() => {
    const osEl = document.querySelector('.xp-os');
    if (!osEl) return;

    // Remove all phase classes
    PHASE_CLASSES.forEach((cls) => osEl.classList.remove(cls));

    // Apply current phase class
    const cls = PHASE_TO_CLASS[phase];
    if (cls) osEl.classList.add(cls);

    return () => {
      PHASE_CLASSES.forEach((c) => osEl.classList.remove(c));
    };
  }, [phase]);

  // Spectator mode
  useEffect(() => {
    const osEl = document.querySelector('.xp-os');
    if (!osEl) return;

    if (!selfAlive && status === 'ACTIVE') {
      osEl.classList.add('spectator-mode');
    } else {
      osEl.classList.remove('spectator-mode');
    }

    return () => osEl.classList.remove('spectator-mode');
  }, [selfAlive, status]);

  // Game frozen (win screen)
  useEffect(() => {
    const osEl = document.querySelector('.xp-os');
    if (!osEl) return;

    if (status === 'FRIENDS_WIN' || status === 'HACKERS_WIN') {
      osEl.classList.add('game-frozen');
    } else {
      osEl.classList.remove('game-frozen');
    }

    return () => osEl.classList.remove('game-frozen');
  }, [status]);
}
