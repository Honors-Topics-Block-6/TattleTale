import useGameStore from '../../stores/gameStore';

export default function WinScreen({ onReturnToLobby }) {
  const status = useGameStore((s) => s.status);
  const players = useGameStore((s) => s.players);
  const selfTeam = useGameStore((s) => s.selfTeam);
  const cycle = useGameStore((s) => s.cycle);

  if (status !== 'FRIENDS_WIN' && status !== 'HACKERS_WIN') return null;

  const winningTeam = status === 'FRIENDS_WIN' ? 'Friends' : 'Hackers';
  const playerWon =
    (status === 'FRIENDS_WIN' && selfTeam === 'FRIENDS') ||
    (status === 'HACKERS_WIN' && selfTeam === 'HACKERS');

  const eliminatedCount = Object.values(players).filter(
    (p) => !p.alive
  ).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150000,
        background: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          background: '#ece9d8',
          border: '3px solid #0054e3',
          borderRadius: '8px 8px 0 0',
          width: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Tahoma, sans-serif',
          boxShadow: '2px 2px 10px rgba(0,0,0,0.5)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: 'linear-gradient(to bottom, #0058e6, #3c82f7, #0058e6)',
            padding: '4px 8px',
            borderRadius: '6px 6px 0 0',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: 13,
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          Game Over
        </div>

        {/* Content */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div
            style={{
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: playerWon ? '#4caf50' : '#f44336',
                marginBottom: 4,
              }}
            >
              {playerWon ? 'Victory!' : 'Defeat'}
            </div>
            <div style={{ fontSize: 14, color: '#555' }}>
              The {winningTeam} win!
            </div>
          </div>

          {/* Role reveal */}
          <div
            style={{
              border: '1px solid #d4d0c8',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                background: '#f5f3ee',
                padding: '4px 8px',
                fontWeight: 'bold',
                borderBottom: '1px solid #d4d0c8',
                fontSize: 11,
              }}
            >
              Role Reveal
            </div>
            <div style={{ padding: 8 }}>
              {Object.entries(players).map(([id, player]) => (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '3px 4px',
                    fontSize: 11,
                    borderBottom: '1px solid #f0f0f0',
                    color: player.alive ? '#333' : '#999',
                    textDecoration: player.alive ? 'none' : 'line-through',
                  }}
                >
                  <span>{player.displayName}</span>
                  <span
                    style={{
                      color:
                        player.team === 'HACKERS' ? '#f44336' : '#4caf50',
                      fontWeight: 'bold',
                    }}
                  >
                    {player.role || '?'} ({player.team === 'HACKERS' ? 'Hacker' : 'Friend'})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div
            style={{
              fontSize: 11,
              color: '#555',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            Game lasted {cycle} cycles — {eliminatedCount} players eliminated
          </div>

          {/* Return button */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={onReturnToLobby}
              style={{
                padding: '6px 24px',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: 12,
                fontWeight: 'bold',
                border: '1px solid #7f9db9',
                background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
