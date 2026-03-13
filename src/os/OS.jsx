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
const defaultWallpaper = 'data:image/svg+xml,' + encodeURIComponent(`
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

export default function OS({ wallpaper = defaultWallpaper }) {
  const windows = useWindowStore((state) => state.windows);
  const windowList = Object.values(windows);

  // Side task: typing mini-game
  const [sideTask, setSideTask] = useState(null);

  // Randomly schedule notification pings for the typing task
  useEffect(() => {
    // Do not schedule a new ping while a task is active
    if (sideTask) return;

    // Wait between 20s and 40s before next ping
    const minDelay = 20000;
    const maxDelay = 40000;
    const delay =
      Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

    const timeoutId = setTimeout(() => {
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
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [sideTask]);

  const handleSideTaskSubmit = (value) => {
    if (!sideTask || sideTask.type !== 'TYPING_SENTENCE') return 'FAIL';

    const target = sideTask.sentence.trim();
    const answer = (value || '').trim();

    // Case-sensitive comparison to make it feel precise
    const success = target === answer;

    // We keep the task around so the modal can show success/fail,
    // and let the user close it.
    setSideTask((prev) =>
      prev
        ? {
            ...prev,
            result: success ? 'SUCCESS' : 'FAIL',
          }
        : prev
    );

    return success ? 'SUCCESS' : 'FAIL';
  };

  const handleSideTaskDismiss = () => {
    setSideTask(null);
  };

  const activeSideTask = useMemo(
    () => (sideTask && sideTask.type === 'TYPING_SENTENCE' ? sideTask : null),
    [sideTask]
  );

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
    </div>
  );
}

