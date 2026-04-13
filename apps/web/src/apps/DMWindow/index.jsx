import useGameStore from '../../stores/gameStore';
import ChatPanel from '../TattleStation/ChatPanel';

function DMWindowComponent({ windowId, channelId }) {
  const channel = useGameStore((s) => s.channels[channelId]);

  if (!channel) {
    // Channel was removed from server state
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
        This channel is no longer available.
      </div>
    );
  }

  return <ChatPanel channelId={channelId} />;
}

const dmIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="4" width="28" height="20" rx="3" fill="#fff" stroke="#8b5cf6" stroke-width="2"/>
    <path d="M6 28 L16 24 L10 24 Z" fill="#8b5cf6"/>
    <rect x="6" y="10" width="12" height="2" rx="1" fill="#ddd"/>
    <rect x="6" y="14" width="18" height="2" rx="1" fill="#ddd"/>
    <rect x="6" y="18" width="8" height="2" rx="1" fill="#ddd"/>
  </svg>
`);

const DMWindow = {
  id: 'dm-window',
  name: 'Direct Message',
  icon: dmIcon,
  component: DMWindowComponent,
  defaultWindow: {
    width: 350,
    height: 400,
    resizable: true,
    minWidth: 280,
    minHeight: 300,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default DMWindow;
