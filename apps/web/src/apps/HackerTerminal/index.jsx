import useGameStore from '../../stores/gameStore';
import ChatPanel from '../TattleStation/ChatPanel';

function HackerTerminalComponent() {
  const channels = useGameStore((s) => s.channels);
  const hackerChannelId = Object.keys(channels).find(
    (id) => channels[id].type === 'HACKER'
  );

  if (!hackerChannelId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: 'Tahoma, sans-serif',
          fontSize: 11,
          color: '#999',
          padding: 24,
          textAlign: 'center',
        }}
      >
        Hacker terminal not available.
      </div>
    );
  }

  return <ChatPanel channelId={hackerChannelId} />;
}

const terminalIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="4" width="28" height="22" rx="1" fill="#000" stroke="#16a34a" stroke-width="2"/>
    <rect x="6" y="28" width="20" height="2" fill="#16a34a"/>
    <text x="6" y="16" font-family="monospace" font-size="8" fill="#16a34a">&gt;_</text>
    <text x="6" y="22" font-family="monospace" font-size="6" fill="#16a34a">hacker</text>
  </svg>
`);

const HackerTerminal = {
  id: 'hacker-terminal',
  name: 'Hacker Terminal',
  icon: terminalIcon,
  component: HackerTerminalComponent,
  defaultWindow: {
    width: 400,
    height: 450,
    resizable: true,
    minWidth: 320,
    minHeight: 300,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default HackerTerminal;
