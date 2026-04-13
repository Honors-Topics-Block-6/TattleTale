import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function VotePanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const pendingSelection = useGameStore((s) => s.pendingSelection);
  const confirmedVote = useGameStore((s) => s.confirmedVote);
  const voteTally = useGameStore((s) => s.voteTally);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const confirmVote = useGameStore((s) => s.confirmVote);
  const lobbyCode = useGameStore((s) => s.lobbyCode);
  const gameId = useGameStore((s) => s.gameId);

  const voteableEntries = Object.entries(players).filter(
    ([id, p]) => id !== selfId && p.alive
  );

  const handleConfirm = () => {
    if (!pendingSelection || confirmedVote !== null) return;
    confirmVote();

    socket.send('game:submit-intent', {
      lobbyCode,
      gameId,
      playerId: selfId,
      reconnectToken: socket.credentials?.reconnectToken || '',
      intent: {
        type: 'SUBMIT_VOTE',
        payload: { targetPlayerId: pendingSelection },
        clientTimestamp: new Date().toISOString(),
      },
    });
  };

  const confirmedTargetInvalid =
    confirmedVote !== null &&
    (!players[confirmedVote]?.connected || !players[confirmedVote]?.alive);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        padding: 8,
        background: '#fff',
        overflowY: 'auto',
      }}
    >
      {/* Tally display */}
      {voteTally && (
        <div
          style={{
            marginBottom: 8,
            padding: 6,
            background: '#f5f3ee',
            border: '1px solid #d4d0c8',
            borderRadius: 2,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Vote Tally</div>
          {Object.entries(voteTally).map(([playerId, count]) => (
            <div key={playerId} style={{ display: 'flex', gap: 6 }}>
              <span>{players[playerId]?.displayName || playerId}:</span>
              <span style={{ fontWeight: 'bold' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invalidation notice */}
      {confirmedTargetInvalid && (
        <div
          style={{
            padding: 6,
            marginBottom: 8,
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 2,
            color: '#856404',
          }}
        >
          Your vote target disconnected. The server will resolve this.
        </div>
      )}

      {/* Player grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {voteableEntries.map(([id, player]) => {
          const isPending = pendingSelection === id && confirmedVote === null;
          const isConfirmed = confirmedVote === id;
          const isDisconnected = !player.connected;

          let borderColor = '#d4d0c8';
          let bgColor = '#fff';
          if (isConfirmed) {
            borderColor = '#4caf50';
            bgColor = '#e8f5e9';
          } else if (isPending) {
            borderColor = '#ff9800';
            bgColor = '#fff8e1';
          }

          return (
            <button
              key={id}
              onClick={() => !confirmedVote && selectPlayer(id)}
              disabled={!!confirmedVote || isDisconnected}
              style={{
                padding: '8px 12px',
                border: `2px solid ${borderColor}`,
                borderRadius: 3,
                background: bgColor,
                cursor: confirmedVote ? 'default' : 'pointer',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: 11,
                opacity: isDisconnected ? 0.5 : 1,
                textDecoration: isDisconnected ? 'line-through' : 'none',
              }}
            >
              {player.displayName}
              {isDisconnected && ' (disconnected)'}
              {isConfirmed && ' ✓'}
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      {confirmedVote === null && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button
            onClick={handleConfirm}
            disabled={!pendingSelection}
            style={{
              padding: '6px 24px',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 12,
              fontWeight: 'bold',
              border: '1px solid #7f9db9',
              background: pendingSelection
                ? 'linear-gradient(to bottom, #ffffff, #d9e4f6)'
                : '#ece9d8',
              cursor: pendingSelection ? 'pointer' : 'default',
              borderRadius: 2,
            }}
          >
            Confirm Vote
          </button>
          {pendingSelection && (
            <div style={{ marginTop: 4, color: '#555' }}>
              Voting for: {players[pendingSelection]?.displayName}
            </div>
          )}
        </div>
      )}

      {confirmedVote !== null && !confirmedTargetInvalid && (
        <div
          style={{ marginTop: 12, textAlign: 'center', color: '#4caf50' }}
        >
          Vote locked in for {players[confirmedVote]?.displayName}
        </div>
      )}
    </div>
  );
}
