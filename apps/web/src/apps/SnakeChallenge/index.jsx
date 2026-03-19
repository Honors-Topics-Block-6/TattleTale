import { useRef } from 'react';
import useWindowStore from '../../os/store/windowStore';
import useInstallStore from '../../os/store/installStore';
import SnakeGameView from '../Snake/SnakeGameView';
import { runSnakePurchaseFlow, showSnakePurchaseFailed, SNAKE_CHALLENGE_CONFIG } from '../Snake/snakeChallenge';

const snakeChallengeIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="3" y="3" width="26" height="26" rx="2" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
      <rect x="5" y="5" width="22" height="22" fill="#000"/>
      <rect x="7" y="7" width="4" height="4" fill="#00c000"/>
      <rect x="11" y="7" width="4" height="4" fill="#00a000"/>
      <rect x="15" y="7" width="4" height="4" fill="#00a000"/>
      <rect x="15" y="11" width="4" height="4" fill="#00a000"/>
      <rect x="15" y="15" width="4" height="4" fill="#00a000"/>
      <rect x="19" y="15" width="4" height="4" fill="#00a000"/>
      <rect x="23" y="15" width="2" height="2" fill="#ff2a2a"/>
      <rect x="19" y="2" width="11" height="11" rx="2" fill="#ffd600" stroke="#0a246a" stroke-width="1"/>
      <text x="24.5" y="11" text-anchor="middle" font-size="10" font-family="Tahoma" fill="#0a246a" font-weight="bold">!</text>
    </svg>
  `);

const SnakeChallenge = {
  id: 'snake-challenge',
  name: 'Snake Challenge',
  icon: snakeChallengeIcon,
  component: SnakeChallengeComponent,
  defaultWindow: {
    width: 480,
    height: 520,
    resizable: false,
    minWidth: 480,
    minHeight: 520,
  },
  desktopIcon: { show: false },
  startMenu: { show: false, section: 'programs' },
};

export default SnakeChallenge;

function SnakeChallengeComponent({ windowId }) {
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const installLocal = useInstallStore((state) => state.install);
  const installViaServer = useInstallStore((state) => state.installViaServer);

  const failedRef = useRef(false);
  const wonRef = useRef(false);

  const handleLose = () => {
    if (failedRef.current || wonRef.current) return;
    failedRef.current = true;
    showSnakePurchaseFailed();
  };

  const handleWin = () => {
    if (wonRef.current) return;
    wonRef.current = true;
    runSnakePurchaseFlow({ windowId, closeWindow, installLocal, installViaServer });
  };

  return (
    <SnakeGameView
      title="Snake — Unlock Challenge"
      cols={SNAKE_CHALLENGE_CONFIG.cols}
      rows={SNAKE_CHALLENGE_CONFIG.rows}
      tickMs={SNAKE_CHALLENGE_CONFIG.tickMs}
      targetFood={SNAKE_CHALLENGE_CONFIG.targetFood}
      timeLimitMs={SNAKE_CHALLENGE_CONFIG.timeLimitMs}
      showGoal
      showTime
      autoStart
      onWin={handleWin}
      onLose={handleLose}
    />
  );
}

