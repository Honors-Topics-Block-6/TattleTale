import useGameStore from '../../stores/gameStore';

export default function PlayerList() {
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);

  const playerEntries = Object.entries(players);

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
        Players ({playerEntries.length})
      </div>
      {playerEntries.map(([id, player]) => {
        const isSelf = id === selfId;
        const isDead = !player.alive;
        const isDisconnected = !player.connected;

        let nameStyle = { padding: '3px 6px', display: 'block' };
        if (isSelf) {
          nameStyle.background = 'rgba(49, 106, 197, 0.1)';
          nameStyle.borderRadius = 2;
        }
        if (isDead) {
          nameStyle.textDecoration = 'line-through';
          nameStyle.color = '#999';
        } else if (isDisconnected) {
          nameStyle.fontStyle = 'italic';
          nameStyle.color = '#aaa';
        }

        return (
          <div key={id} style={nameStyle}>
            <span style={{ marginRight: 6 }}>{player.avatar || '🙂'}</span>
            {player.displayName}
            {isSelf && ' (you)'}
            {isDead && ' [dead]'}
            {!isDead && isDisconnected && ' [offline]'}
          </div>
        );
      })}
    </div>
  );
}
