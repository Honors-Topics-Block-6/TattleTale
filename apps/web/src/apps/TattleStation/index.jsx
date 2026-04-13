import useGameStore from '../../stores/gameStore';
import PhaseHeader from './PhaseHeader';
import PlayerList from './PlayerList';
import ChatPanel from './ChatPanel';
import VotePanel from './VotePanel';

function TattleStationComponent({ windowId }) {
  const phase = useGameStore((s) => s.phase);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const channels = useGameStore((s) => s.channels);
  const systemEvents = useGameStore((s) => s.systemEvents);

  // Find the GLOBAL channel id
  const globalChannelId = Object.keys(channels).find(
    (id) => channels[id].type === 'GLOBAL'
  );

  const showVotePanel = phase === 'DAY_VOTE' && selfAlive;
  const showSystemEvents =
    phase === 'DAY_RESOLVE' ||
    phase === 'NIGHT_RESOLVE' ||
    phase === 'NIGHT_REVEAL';

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
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {showVotePanel ? (
            <VotePanel />
          ) : showSystemEvents ? (
            <SystemEventFeed events={systemEvents} />
          ) : globalChannelId ? (
            <ChatPanel channelId={globalChannelId} />
          ) : (
            <div style={{ padding: 12, color: '#999' }}>
              Waiting for game to start...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemEventFeed({ events }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 8,
        background: '#fff',
        border: '1px inset #aca899',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      {events.length === 0 && (
        <div style={{ color: '#999', fontStyle: 'italic' }}>
          Waiting for results...
        </div>
      )}
      {events.map((event) => (
        <div
          key={event.id}
          style={{
            padding: '4px 0',
            borderBottom: '1px solid #f0f0f0',
            color: '#555',
          }}
        >
          <span style={{ color: '#999', marginRight: 6, fontSize: 10 }}>
            {new Date(event.createdAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {event.type.replace(/_/g, ' ').toLowerCase()}
        </div>
      ))}
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
