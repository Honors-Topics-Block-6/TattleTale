import useGameStore, { selectIsHacker } from '../../stores/gameStore';
import PhaseHeader from './PhaseHeader';
import PlayerList from './PlayerList';
import ChannelSidebar from './ChannelSidebar';
import ChatPanel from './ChatPanel';
import VotePanel from './VotePanel';
import NightPanel from './NightPanel';
import NightSpectatorView from './NightSpectatorView';
import SystemEventFeed from './SystemEventFeed';

function TattleStationComponent({ windowId, socket }) {
  const phase = useGameStore((s) => s.phase);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const activeChannelId = useGameStore((s) => s.activeChannelId);
  const systemEvents = useGameStore((s) => s.systemEvents);
  const isHacker = useGameStore(selectIsHacker);

  const showVotePanel = phase === 'DAY_VOTE' && selfAlive;
  const showNightUi = phase === 'NIGHT_ACTIONS' && selfAlive;
  const showSystemEvents =
    phase === 'DAY_RESOLVE' ||
    phase === 'NIGHT_RESOLVE' ||
    phase === 'NIGHT_REVEAL';

  const centerPanel = (() => {
    if (showVotePanel) return <VotePanel />;
    if (showNightUi)
      return isHacker ? (
        <NightPanel socket={socket} />
      ) : (
        <NightSpectatorView />
      );
    if (showSystemEvents) return <SystemEventFeed events={systemEvents} />;
    if (activeChannelId) return <ChatPanel channelId={activeChannelId} />;
    return (
      <div style={{ padding: 12, color: '#999' }}>
        Waiting for game to start...
      </div>
    );
  })();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'Tahoma, sans-serif',
      }}
    >
      <PhaseHeader />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <PlayerList />
        <ChannelSidebar />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {centerPanel}
        </div>
      </div>
    </div>
  );
}

const tattleStationIcon =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="2" width="28" height="24" rx="2" fill="#0054e3" stroke="#003d99" stroke-width="1"/>
    <rect x="4" y="4" width="24" height="18" fill="#fff"/>
    <rect x="6" y="6" width="8" height="14" fill="#e8f0fe"/>
    <rect x="16" y="6" width="10" height="6" fill="#f5f5f5" stroke="#ccc" stroke-width="0.5"/>
    <rect x="16" y="14" width="10" height="6" fill="#f5f5f5" stroke="#ccc" stroke-width="0.5"/>
    <rect x="10" y="26" width="12" height="4" fill="#c0c0c0"/>
    <rect x="8" y="30" width="16" height="1" fill="#999"/>
  </svg>
`);

const TattleStation = {
  id: 'tattle-station',
  name: 'TattleStation',
  icon: tattleStationIcon,
  component: TattleStationComponent,
  defaultWindow: {
    width: 700,
    height: 500,
    resizable: true,
    minWidth: 500,
    minHeight: 400,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default TattleStation;
