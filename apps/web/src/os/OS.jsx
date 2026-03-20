import { useEffect, useMemo, useState } from 'react';
import useWindowStore from './store/windowStore';
import { getAppConfig } from './config/apps.config';
import Desktop from './components/Desktop/Desktop';
import Taskbar from './components/Taskbar/Taskbar';
import StartMenu from './components/StartMenu/StartMenu';
import ContextMenu from './components/ContextMenu/ContextMenu';
import Window from './components/Window/Window';
import SideTaskModal from './components/SideTaskModal';

import '../themes/xp/index.css';

// Default XP wallpaper (bliss-like gradient)
const defaultWallpaper =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#4ca6ff"/>
        <stop offset="50%" style="stop-color:#87ceeb"/>
        <stop offset="100%" style="stop-color:#b8e0f7"/>
      </linearGradient>
      <linearGradient id="grass" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#4caf50"/>
        <stop offset="100%" style="stop-color:#2e7d32"/>
      </linearGradient>
    </defs>
    <rect width="1920" height="540" fill="url(#sky)"/>
    <ellipse cx="960" cy="800" rx="1400" ry="500" fill="url(#grass)"/>
    <circle cx="200" cy="150" r="60" fill="#fff" opacity="0.8"/>
    <circle cx="160" cy="140" r="50" fill="#fff" opacity="0.8"/>
    <circle cx="240" cy="140" r="50" fill="#fff" opacity="0.8"/>
    <circle cx="1700" cy="200" r="70" fill="#fff" opacity="0.7"/>
    <circle cx="1650" cy="180" r="55" fill="#fff" opacity="0.7"/>
    <circle cx="1750" cy="190" r="55" fill="#fff" opacity="0.7"/>
  </svg>
`);

// Sentences for the typing mini-game
const TYPING_SENTENCES = [
  'The signal is weak but real.',
  'Trust the pattern, not the noise.',
  'Someone is definitely hiding something.',
  'You are being watched, stay calm.',
  'Every message leaves a trace.',
  'Silence can be louder than words.',
];

// Simple attention-check tasks (odd-one-out style)
const ATTENTION_TASKS = [
  {
    message: 'Tap the item that does NOT belong with the others.',
    prompt: 'One of these is pure distraction.',
    options: ['vote', 'night', 'message', 'banana'],
    correctIndex: 3,
  },
  {
    message: 'Tap the word that does NOT contain the letter "e".',
    prompt: 'Only one of these words is missing the letter "e".',
    options: ['code', 'vote', 'night', 'message'],
    correctIndex: 2,
  },
  {
    message: 'Tap the item that is NOT a phase of the game.',
    prompt: 'Think about the flow of a TattleTale round.',
    options: ['day', 'night', 'weekend', 'vote'],
    correctIndex: 2,
  },
];

function RoleReveal({ role, onDismiss }) {
  const isFriend = role === 'FRIENDS';
  const label = isFriend ? 'Friend' : 'Hacker';
  const icon = isFriend ? '🛡️' : '💀';
  const accent = isFriend ? '#3c9a41' : '#b71c1c';
  const accentLight = isFriend ? '#e8f5e9' : '#ffebee';
  const borderColor = isFriend ? '#2e7d32' : '#7f0000';
  const description = isFriend
    ? 'Work with your fellow Friends to identify and vote out the Hackers before they take over.'
    : 'Blend in with the Friends. Sabotage from the shadows and avoid suspicion.';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'roleRevealFadeIn 0.3s ease-out',
    }}>
      <style>{`
        @keyframes roleRevealFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes roleRevealSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div style={{
        background: '#ece9d8',
        border: `3px solid ${accent}`,
        borderRadius: 8,
        boxShadow: `0 0 0 1px ${borderColor}, 0 12px 40px rgba(0,0,0,0.5)`,
        width: 380,
        overflow: 'hidden',
        animation: 'roleRevealSlideUp 0.4s ease-out 0.1s both',
      }}>
        {/* Title bar */}
        <div style={{
          background: `linear-gradient(180deg, ${accent}, ${borderColor})`,
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{
            color: '#fff', fontWeight: 'bold', fontSize: 13,
            fontFamily: 'Tahoma, "Segoe UI", sans-serif',
            textShadow: '1px 1px 2px rgba(0,0,0,0.4)',
          }}>
            Role Assignment
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: accentLight,
            border: `3px solid ${accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 36,
          }}>
            {icon}
          </div>

          <div style={{
            fontSize: 12, color: '#666',
            fontFamily: 'Tahoma, "Segoe UI", sans-serif',
            textTransform: 'uppercase', letterSpacing: 1,
            marginBottom: 4,
          }}>
            You are a
          </div>

          <div style={{
            fontSize: 32, fontWeight: 'bold',
            color: accent,
            fontFamily: 'Tahoma, "Segoe UI", sans-serif',
            textShadow: `1px 1px 0 ${accentLight}`,
            marginBottom: 12,
          }}>
            {label}
          </div>

          <div style={{
            fontSize: 13, color: '#444',
            fontFamily: 'Tahoma, "Segoe UI", sans-serif',
            lineHeight: 1.5,
            padding: '10px 14px',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 4,
            marginBottom: 20,
          }}>
            {description}
          </div>

          <button
            onClick={onDismiss}
            style={{
              padding: '8px 32px',
              fontSize: 13,
              fontFamily: 'Tahoma, "Segoe UI", sans-serif',
              fontWeight: 'bold',
              color: '#000',
              background: 'linear-gradient(180deg, #fff 0%, #e3dcd0 100%)',
              border: '1px solid #999',
              borderRadius: 3,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OS({ wallpaper = defaultWallpaper, myRole }) {
  const windows = useWindowStore((state) => state.windows);
  const createWindow = useWindowStore((state) => state.createWindow);

  const windowList = Object.values(windows);

  const [roleRevealed, setRoleRevealed] = useState(!!myRole);

  // Side tasks: typing + attention-check + open-2048
  const [sideTask, setSideTask] = useState(null);

  // Randomly schedule notification pings for side tasks
  useEffect(() => {
    // Do not schedule a new ping while a task is active
    if (sideTask) return;

    // Wait between 20s and 40s before next ping
    const minDelay = 20000;
    const maxDelay = 40000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

    const timeoutId = setTimeout(() => {
      const roll = Math.random();

      if (roll < 0.45) {
        const sentence =
          TYPING_SENTENCES[
            Math.floor(Math.random() * TYPING_SENTENCES.length)
          ];

        setSideTask({
          id: String(Date.now()),
          type: 'TYPING_SENTENCE',
          title: 'System ping',
          message:
            'Type this sentence exactly to clear the interference and continue working.',
          sentence,
        });
      } else if (roll < 0.85) {
        const taskDef =
          ATTENTION_TASKS[
            Math.floor(Math.random() * ATTENTION_TASKS.length)
          ];

        setSideTask({
          id: String(Date.now()),
          type: 'ATTENTION_CHECK',
          title: 'Focus check',
          message: taskDef.message,
          prompt: taskDef.prompt,
          options: taskDef.options,
          correctIndex: taskDef.correctIndex,
        });
      } else {
        setSideTask({
          id: String(Date.now()),
          type: 'OPEN_2048',
          title: 'Side distraction',
          message: 'Open 2048 and play until you reach the next milestone.',
        });
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [sideTask]);

  const handleSideTaskSubmit = (payload) => {
    if (!sideTask) return 'FAIL';

    if (sideTask.type === 'OPEN_2048') {
      const appId = 'milestone-2048';
      const appConfig = getAppConfig(appId);
      if (appConfig) createWindow(appId, appConfig);
      return 'SUCCESS';
    }

    // Typing mini-game
    if (sideTask.type === 'TYPING_SENTENCE') {
      const target = sideTask.sentence.trim();
      const answer = (payload || '').trim();
      const success = target === answer;

      setSideTask((prev) =>
        prev
          ? {
              ...prev,
              result: success ? 'SUCCESS' : 'FAIL',
            }
          : prev
      );

      return success ? 'SUCCESS' : 'FAIL';
    }

    // Attention-check mini-game
    if (sideTask.type === 'ATTENTION_CHECK') {
      const index =
        typeof payload === 'number'
          ? payload
          : payload && typeof payload.index === 'number'
          ? payload.index
          : -1;

      const success = index === sideTask.correctIndex;

      setSideTask((prev) =>
        prev
          ? {
              ...prev,
              result: success ? 'SUCCESS' : 'FAIL',
            }
          : prev
      );

      return success ? 'SUCCESS' : 'FAIL';
    }

    return 'FAIL';
  };

  const handleSideTaskDismiss = () => {
    setSideTask(null);
  };

  const activeSideTask = useMemo(() => sideTask, [sideTask]);

  return (
    <div className="xp-os">
      <Desktop wallpaper={wallpaper} />

      {windowList.map((win) => {
        const appConfig = getAppConfig(win.appId);
        if (!appConfig) return null;

        return (
          <Window
            key={win.id}
            windowId={win.id}
            appConfig={appConfig}
          />
        );
      })}

      <Taskbar />
      <StartMenu />
      <ContextMenu />

      {activeSideTask && (
        <SideTaskModal
          task={activeSideTask}
          onSubmit={handleSideTaskSubmit}
          onDismiss={handleSideTaskDismiss}
        />
      )}

      {roleRevealed && myRole && (
        <RoleReveal
          role={myRole}
          onDismiss={() => setRoleRevealed(false)}
        />
      )}
    </div>
  );
}