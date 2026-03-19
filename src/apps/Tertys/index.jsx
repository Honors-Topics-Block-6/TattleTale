import TertysApp from './ui/TertysApp';

// Pixel-toy-brick icon (Windows-ish, crisp edges)
const tertysIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
    <rect x="3" y="8" width="26" height="20" fill="#d94841" stroke="#3b0a09" stroke-width="1"/>
    <rect x="4" y="9" width="24" height="7" fill="#ff6b64" opacity="0.55"/>
    <rect x="4" y="16" width="24" height="11" fill="#b7332d" opacity="0.35"/>

    <!-- studs -->
    <rect x="7" y="5" width="6" height="4" fill="#d94841" stroke="#3b0a09" stroke-width="1"/>
    <rect x="19" y="5" width="6" height="4" fill="#d94841" stroke="#3b0a09" stroke-width="1"/>
    <rect x="8" y="6" width="4" height="2" fill="#ff6b64" opacity="0.55"/>
    <rect x="20" y="6" width="4" height="2" fill="#ff6b64" opacity="0.55"/>

    <!-- tiny highlight pixel -->
    <rect x="6" y="11" width="2" height="2" fill="#fff" opacity="0.7"/>
  </svg>
`);

const Tetris = {
  id: 'tetris',
  name: 'Tetris',
  icon: tertysIcon,
  component: TertysApp,
  defaultWindow: {
    width: 560,
    height: 500,
    resizable: true,
    minWidth: 520,
    minHeight: 460,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Stack toy blocks. Clear lines. Beat your high score.',
  },
};

export default Tetris;

