import useGameStore from '../../stores/gameStore';

// Text glyphs per channel type — retro messenger aesthetic
const CHANNEL_ICONS = {
  GLOBAL: '#',
  PRIVATE: '@',
  ROLE: '[R]',
  HACKER: '[H]',
  TEMP: '~',
  SYSTEM: '!',
};

function getChannelLabel(channel, players, selfId) {
  switch (channel.type) {
    case 'GLOBAL':
      return 'Global';
    case 'HACKER':
      return 'Hacker Chat';
    case 'ROLE':
      return 'Role Chat';
    case 'TEMP':
      return 'Temp Chat';
    case 'SYSTEM':
      return 'System';
    case 'PRIVATE': {
      const otherId = channel.members.find((m) => m !== selfId);
      if (!otherId) return 'Private';
      const other = players[otherId];
      return other?.displayName ?? 'Private';
    }
    default:
      return channel.type;
  }
}

function getLastMessageTimestamp(channel) {
  const msgs = channel.messages;
  if (!msgs || msgs.length === 0) return 0;
  const last = msgs[msgs.length - 1];
  return last?.timestamp ? Date.parse(last.timestamp) : 0;
}

function isPrivatePartnerEliminated(channel, players, selfId) {
  if (channel.type !== 'PRIVATE') return false;
  const otherId = channel.members.find((m) => m !== selfId);
  if (!otherId) return false;
  const other = players[otherId];
  return other ? !other.alive : false;
}

export default function ChannelSidebar() {
  const channels = useGameStore((s) => s.channels);
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const unreadCounts = useGameStore((s) => s.unreadCounts);
  const activeChannelId = useGameStore((s) => s.activeChannelId);
  const setActiveChannel = useGameStore((s) => s.setActiveChannel);

  const channelList = Object.values(channels);

  // GLOBAL pinned first, rest sorted by last message time descending
  const globalChannels = channelList.filter((c) => c.type === 'GLOBAL');
  const otherChannels = channelList
    .filter((c) => c.type !== 'GLOBAL')
    .sort((a, b) => getLastMessageTimestamp(b) - getLastMessageTimestamp(a));

  const sorted = [...globalChannels, ...otherChannels];

  return (
    <div
      style={{
        width: 140,
        minWidth: 140,
        borderRight: '1px solid #aca899',
        background: '#f5f3ee',
        overflowY: 'auto',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          padding: '4px 6px',
          borderBottom: '1px solid #d4d0c8',
          marginBottom: 4,
          color: '#0054e3',
          flexShrink: 0,
        }}
      >
        Channels
      </div>

      {sorted.length === 0 && (
        <div style={{ padding: '4px 6px', color: '#999', fontStyle: 'italic' }}>
          No channels
        </div>
      )}

      {sorted.map((channel) => {
        const isActive = channel.id === activeChannelId;
        const unread = unreadCounts[channel.id] || 0;
        const icon = CHANNEL_ICONS[channel.type] ?? '#';
        const label = getChannelLabel(channel, players, selfId);
        const partnerEliminated = isPrivatePartnerEliminated(channel, players, selfId);
        const isLocked = channel.locked;
        const isExpired =
          channel.expiresAt != null &&
          typeof channel.expiresAt === 'string' &&
          // expiresAt is a Phase name — treat it as "expired" only if locked
          isLocked;

        let rowStyle = {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          cursor: 'pointer',
          borderRadius: 2,
          userSelect: 'none',
          minHeight: 22,
        };

        if (isActive) {
          rowStyle.background = 'rgba(49, 106, 197, 0.15)';
          rowStyle.borderLeft = '2px solid #0054e3';
          rowStyle.paddingLeft = 4;
        } else {
          rowStyle.borderLeft = '2px solid transparent';
          rowStyle.paddingLeft = 4;
        }

        let labelStyle = {
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#333',
        };

        if (partnerEliminated) {
          labelStyle.opacity = 0.45;
        }

        if (isLocked || isExpired) {
          labelStyle.color = '#999';
        }

        if (isActive) {
          labelStyle.fontWeight = 'bold';
          labelStyle.color = '#0054e3';
        }

        let iconStyle = {
          color: '#666',
          fontSize: 10,
          flexShrink: 0,
          fontFamily: 'Tahoma, monospace',
        };

        if (channel.type === 'HACKER') {
          iconStyle.color = '#b22222';
        } else if (channel.type === 'SYSTEM') {
          iconStyle.color = '#8b6914';
        } else if (channel.type === 'ROLE') {
          iconStyle.color = '#5a5a9a';
        }

        if (partnerEliminated) {
          iconStyle.opacity = 0.45;
        }

        return (
          <div
            key={channel.id}
            style={rowStyle}
            onClick={() => setActiveChannel(channel.id)}
            title={isLocked ? `${label} (locked)` : label}
          >
            <span style={iconStyle}>{icon}</span>
            <span style={labelStyle}>{label}</span>
            {isLocked && (
              <span
                style={{
                  color: '#999',
                  fontSize: 9,
                  flexShrink: 0,
                  marginLeft: 1,
                }}
                title="Locked"
              >
                [x]
              </span>
            )}
            {unread > 0 && (
              <span
                style={{
                  background: '#c0392b',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '0 4px',
                  fontSize: 9,
                  fontWeight: 'bold',
                  minWidth: 14,
                  textAlign: 'center',
                  flexShrink: 0,
                  lineHeight: '14px',
                }}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
