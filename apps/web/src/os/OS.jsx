import { useEffect, useMemo, useState } from 'react';
import useWindowStore from './store/windowStore';
import { getAppConfig } from './config/apps.config';
import Desktop from './components/Desktop/Desktop';
import Taskbar from './components/Taskbar/Taskbar';
import StartMenu from './components/StartMenu/StartMenu';
import ContextMenu from './components/ContextMenu/ContextMenu';
import Window from './components/Window/Window';
import SideTaskModal from './components/SideTaskModal';
import useGameStore from '../stores/gameStore';
import useThemeEffect from '../hooks/useThemeEffect';
import EliminationSequence from '../components/EliminationSequence/index';
import WinScreen from '../components/WinScreen/index';

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

export default function OS({ wallpaper = defaultWallpaper, onReturnToLobby }) {
  const windows = useWindowStore((state) => state.windows);
  const createWindow = useWindowStore((state) => state.createWindow);

  const windowList = Object.values(windows);

  // Auto-open TattleStation when the OS mounts — it's the main game window
  // and has no desktop/start-menu entry, so the user can't open it manually.
  // Guard against StrictMode double-invocation and user re-opens.
  useEffect(() => {
    const existing = Object.values(useWindowStore.getState().windows).some(
      (w) => w.appId === 'tattle-station',
    );
    if (existing) return;
    const appConfig = getAppConfig('tattle-station');
    if (appConfig) createWindow('tattle-station', appConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Game state hooks
  useThemeEffect();
  const eliminationCause = useGameStore((s) => s.eliminationCause);
  const eliminationCycle = useGameStore((s) => s.eliminationCycle);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const status = useGameStore((s) => s.status);
  const [eliminationPlayed, setEliminationPlayed] = useState(null);

  const showElimination =
    eliminationCause !== null &&
    !selfAlive &&
    eliminationCycle !== null &&
    eliminationPlayed !== eliminationCycle;

  const handleEliminationComplete = () => {
    setEliminationPlayed(eliminationCycle);
  };

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

      {showElimination && (
        <EliminationSequence
          cause={eliminationCause}
          onComplete={handleEliminationComplete}
        />
      )}

      {(status === 'FRIENDS_WIN' || status === 'HACKERS_WIN') && (
        <WinScreen onReturnToLobby={onReturnToLobby} />
      )}
    </div>
  );
}