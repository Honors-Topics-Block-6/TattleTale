import { useEffect, useRef, useState } from 'react';
import useGameStore from '../store/gameStore';

const TASK_MESSAGES = [
  'Take a moment to check your email inbox.',
  'Review your calendar and upcoming meetings.',
  'Respond to one work chat or message.',
  'Look over your to‑do list and prioritize one task.',
  'Stand up, stretch, and glance at your real desktop.',
  'File or organize one document on your computer.',
  'Close a tab or app you are not actively using.',
];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function RealLifeTaskPrompts() {
  const isInGame = useGameStore((state) => state.isInGame);
  const [task, setTask] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [canDismiss, setCanDismiss] = useState(false);

  const nextPromptTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const clearTimers = () => {
    if (nextPromptTimeoutRef.current) {
      clearTimeout(nextPromptTimeoutRef.current);
      nextPromptTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const scheduleNextPrompt = () => {
    // Wait a random amount of time before the next prompt
    const delayMs = getRandomInt(100, 200) * 1000;
    nextPromptTimeoutRef.current = setTimeout(() => {
      const durationSeconds = getRandomInt(10, 20);
      const message =
        TASK_MESSAGES[getRandomInt(0, TASK_MESSAGES.length - 1)];

      setTask({ message, durationSeconds });
      setRemainingSeconds(durationSeconds);
      setCanDismiss(false);

      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
            setCanDismiss(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, delayMs);
  };

  useEffect(() => {
    // Only run prompts while actively in a game session
    if (!isInGame) {
      clearTimers();
      setTask(null);
      setRemainingSeconds(0);
      setCanDismiss(false);
      return;
    }

    // If entering game state, schedule prompts
    if (!nextPromptTimeoutRef.current && !countdownIntervalRef.current) {
      scheduleNextPrompt();
    }

    return () => {
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInGame]);

  const handleDismiss = () => {
    if (!canDismiss) return;
    setTask(null);
    setRemainingSeconds(0);
    setCanDismiss(false);
    scheduleNextPrompt();
  };

  if (!task) return null;

  return (
    <div
      className="xp-overlay-prompt"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        className="xp-window real-life-task-prompt"
        style={{
          width: 420,
          maxWidth: '90vw',
          backgroundColor: '#ece9d8',
          border: '2px solid #3b6ea5',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          fontFamily: 'Tahoma, sans-serif',
        }}
      >
        <div
          style={{
            background:
              'linear-gradient(180deg, #3b6ea5 0%, #24518b 100%)',
            color: 'white',
            padding: '4px 8px',
            fontSize: 12,
            fontWeight: 'bold',
          }}
        >
          Real‑Life Task Reminder
        </div>

        <div style={{ padding: '12px 14px', fontSize: 13 }}>
          <p style={{ marginTop: 0, marginBottom: 8 }}>{task.message}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#444' }}>
            Stay on this for{' '}
            <strong>
              {remainingSeconds > 0
                ? `${remainingSeconds} second${
                    remainingSeconds === 1 ? '' : 's'
                  }`
                : 'a moment'}
            </strong>{' '}
            before returning to the game.
          </p>
        </div>

        <div
          style={{
            padding: '8px 14px 10px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleDismiss}
            disabled={!canDismiss}
            style={{
              minWidth: 90,
              padding: '2px 10px',
              fontSize: 12,
              cursor: canDismiss ? 'pointer' : 'default',
              backgroundColor: canDismiss ? '#e1e1e1' : '#f5f5f5',
              border: '1px solid #888',
            }}
          >
            {canDismiss ? 'Done, back to game' : 'Finish task...'}
          </button>
        </div>
      </div>
    </div>
  );
}

