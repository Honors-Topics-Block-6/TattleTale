import { useState, useEffect, useRef } from 'react';
import useGameStore from '../../../stores/gameStore';

export default function Clock() {
  const [time, setTime] = useState(new Date());
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const isUrgent = useGameStore((s) => s.isUrgent);
  const phase = useGameStore((s) => s.phase);

  // Urgency pulse animation state
  const [pulseCount, setPulseCount] = useState(0);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Urgency pulse: 2 pulses, 5s pause, max 3 cycles
  useEffect(() => {
    if (!isUrgent) {
      setPulseCount(0);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      return;
    }

    if (pulseCount >= 6) return; // 3 cycles of 2 pulses = 6 total

    const doPulse = () => {
      setPulseCount((c) => c + 1);
    };

    // 2 pulses (0.5s on, 0.5s off each = 2s), then 5s pause
    const inCycle = pulseCount % 2;
    const delay = inCycle === 1 ? 5000 : 1000; // After 2nd pulse, 5s pause

    pulseTimerRef.current = setTimeout(doPulse, delay);
    return () => clearTimeout(pulseTimerRef.current);
  }, [isUrgent, pulseCount]);

  // Format phase timer
  const inGame = phase !== null;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const phaseTimer = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const isPulsing = isUrgent && pulseCount < 6 && pulseCount % 2 === 0;

  return (
    <div className="xp-clock" style={{
      color: isUrgent ? '#f44336' : undefined,
      opacity: isPulsing ? 0.5 : 1,
      transition: 'opacity 0.5s ease, color 0.3s ease',
    }}>
      {inGame ? phaseTimer : formattedTime}
    </div>
  );
}
