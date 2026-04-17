import useGameStore from '../../stores/gameStore';

function privateChannelId(a, b) {
  const [x, y] = [a, b].sort();
  return `pm:${x}:${y}`;
}

export default function PlayerList() {
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const channels = useGameStore((s) => s.channels);
  const unreadCounts = useGameStore((s) => s.unreadCounts);
  const activeId = useGameStore((s) => s.activeTattleChannelId);
  const setActive = useGameStore((s) => s.setActiveTattleChannel);

  const playerEntries = Object.entries(players);
  const globalUnread = unreadCounts.global || 0;

  const rowBase = {
    padding: '3px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  };

  const activeStyle = {
    background: 'rgba(0, 84, 227, 0.18)',
    borderRadius: 2,
  };

  const selfBgStyle = {
    background: 'rgba(49, 106, 197, 0.1)',
    borderRadius: 2,
  };

  const badgeStyle = {
    background: '#e81123',
    color: '#fff',
    borderRadius: 8,
    padding: '0 5px',
    fontSize: 9,
    fontWeight: 'bold',
    minWidth: 14,
    textAlign: 'center',
  };

  return (
    <div
      style={{
        width: 160,
        minWidth: 160,
        borderRight: '1px solid #aca899',
        background: '#f5f3ee',
        overflowY: 'auto',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        padding: 4,
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          padding: '4px 6px',
          borderBottom: '1px solid #d4d0c8',
          marginBottom: 4,
          color: '#0054e3',
        }}
      >
        Chats
      </div>

      <div
        onClick={() => setActive('global')}
        style={{
          ...rowBase,
          cursor: 'pointer',
          ...(activeId === 'global' ? activeStyle : {}),
        }}
      >
        <span style={{ fontWeight: 'bold' }}>Global</span>
        {globalUnread > 0 && activeId !== 'global' && (
          <span style={badgeStyle}>{globalUnread}</span>
        )}
      </div>

      <div
        style={{
          fontWeight: 'bold',
          padding: '6px 6px 2px',
          marginTop: 4,
          color: '#0054e3',
          borderTop: '1px solid #d4d0c8',
        }}
      >
        Players ({playerEntries.length})
      </div>
      {playerEntries.map(([id, player]) => {
        const isSelf = id === selfId;
        const isDead = !player.alive;
        const isDisconnected = !player.connected;
        const pmId = !isSelf ? privateChannelId(selfId, id) : null;
        const canDm = !isSelf && Boolean(channels[pmId]);
        const isActive = pmId && activeId === pmId;
        const unread = pmId ? unreadCounts[pmId] || 0 : 0;

        const nameStyle = { ...rowBase };
        if (isSelf) Object.assign(nameStyle, selfBgStyle);
        if (isActive) Object.assign(nameStyle, activeStyle);
        if (canDm) nameStyle.cursor = 'pointer';
        const labelStyle = {};
        if (isDead) {
          labelStyle.textDecoration = 'line-through';
          labelStyle.color = '#999';
        } else if (isDisconnected) {
          labelStyle.fontStyle = 'italic';
          labelStyle.color = '#aaa';
        }

        return (
          <div
            key={id}
            style={nameStyle}
            onClick={canDm ? () => setActive(pmId) : undefined}
          >
            <span style={labelStyle}>
              {player.displayName}
              {isSelf && ' (you)'}
              {isDead && ' [dead]'}
              {!isDead && isDisconnected && ' [offline]'}
            </span>
            {unread > 0 && !isActive && (
              <span style={badgeStyle}>{unread}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
