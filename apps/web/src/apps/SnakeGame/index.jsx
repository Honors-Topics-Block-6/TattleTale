import SnakeGameView from '../Snake/SnakeGameView';

export const snake_icon =
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
      <rect x="8" y="8" width="1" height="1" fill="#ffffff"/>
      <rect x="9" y="8" width="1" height="1" fill="#ffffff"/>
      <rect x="8" y="9" width="1" height="1" fill="#ffffff"/>
    </svg>
  `);

function SnakeGameComponent() {
  return <SnakeGameView title="Snake" cols={20} rows={20} tickMs={120} autoStart />;
}

const SnakeGame = {
  id: 'snake',
  name: 'Snake',
  icon: snake_icon,
  component: SnakeGameComponent,
  defaultWindow: {
    width: 520,
    height: 560,
    resizable: false,
    minWidth: 520,
    minHeight: 560,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    // Keep launch desktop-only after install.
    show: false,
    section: 'programs',
    description: 'Eat food, grow longer, and avoid crashing!',
  },
  install: {
    requiresUnlock: true,
  },
};

export default SnakeGame;

