import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function JealousPanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const jealousNightView = useGameStore((s) => s.jealousNightView);
  const pendingSelection = useGameStore((s) => s.pendingJealousSelection);
  const selectJealousTarget = useGameStore((s) => s.selectJealousTarget);

  if (!jealousNightView) return null;

  const confirmedTarget = jealousNightView.confirmedTarget ?? null;
  const used = !!jealousNightView.used;
  const hasSubmitted = confirmedTarget !== null;

  const candidates = Object.values(players).filter(
    (p) => p.alive && p.playerId !== selfId,
  );

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted || used) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: 'SWAP_ROLE',
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit swap action:', err);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        background: '#1e293b',
        color: '#e2e8f0',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#facc15' }}>
        The Jealous — swap roles with another player.
      </div>
      <div style={{ marginBottom: 8, color: '#fbbf24', fontSize: 11 }}>
        {used
          ? 'You have already used your once-per-game swap.'
          : 'Once per game. You take their role; they become their team\'s base role. You stay Neutral.'}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const isSelected =
            pendingSelection === p.playerId || confirmedTarget === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && !used && selectJealousTarget(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted || used ? 'default' : 'pointer',
                background: isSelected ? '#a16207' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                borderRadius: 2,
                marginBottom: 2,
              }}
            >
              <span>{p.displayName}</span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={hasSubmitted || used || !pendingSelection}
        style={{ marginTop: 8, padding: '6px 12px' }}
      >
        {used ? 'Used' : hasSubmitted ? 'Submitted' : 'Confirm Swap'}
      </button>
    </div>
  );
}
