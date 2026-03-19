import PacmanMiniGame from '../../os/components/PacmanMiniGame/PacmanMiniGame';

const pacmanIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M16 4a12 12 0 1 0 10.6 6.5H16V4Z" fill="#FFD34D" stroke="#000814" stroke-width="1"/>
    <path d="M6.2 11.3c-.6 1.6-.8 3.3-.5 5.1.3 2 1.2 3.6 2.5 5L16 16l-9.8-4.7Z" fill="#000814"/>
  </svg>
`);

function PacmanComponent() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <PacmanMiniGame open={true} variant="embedded" />
    </div>
  );
}

const Pacman = {
  id: 'pacman',
  name: 'Pacman',
  icon: pacmanIcon,
  component: PacmanComponent,
  defaultWindow: {
    width: 360,
    height: 420,
    resizable: false,
    minWidth: 360,
    minHeight: 420,
  },
  desktopIcon: {
    show: true,
  },
};

export default Pacman;

