import { useEffect, useRef } from 'react';
import useGameStore from '../stores/gameStore';

export default function usePhaseTimer() {
  const phaseEndsAt = useGameStore((s) => s.phaseEndsAt);
  const setTimeRemaining = useGameStore((s) => s.setTimeRemaining);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!phaseEndsAt) {
      setTimeRemaining(0);
      return;
    }

    const endMs = Date.parse(phaseEndsAt);

    const tick = () => {
      const remaining = Math.max(0, (endMs - Date.now()) / 1000);
      setTimeRemaining(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [phaseEndsAt, setTimeRemaining]);
}
