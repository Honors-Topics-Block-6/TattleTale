import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function VengeancePanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const vengefulNightView = useGameStore((s) => s.vengefulNightView);
  const pendingSelection = useGameStore((s) => s.pendingVengefulSelection);
  const selectVengefulTarget = useGameStore((s) => s.selectVengefulTarget);

  if (!vengefulNightView) return null;

  const confirmedTarget = vengefulNightView.confirmedTarget ?? null;
  const hasSubmitted = confirmedTarget !== null;

  const candidates = Object.values(players).filter(
    (p) => p.alive && p.playerId !== selfId,
  );

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: 'VENGEFUL_KILL',
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit vengeful action:', err);
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
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#a78bfa' }}>
        Vengeful — pre-pick a spite target.
      </div>
      <div style={{ marginBottom: 8, color: '#fbbf24', fontSize: 11 }}>
        Fires only if a hacker eliminates you tonight. Otherwise nothing happens.
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const isSelected =
            pendingSelection === p.playerId || confirmedTarget === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && selectVengefulTarget(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#6d28d9' : 'transparent',
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
        disabled={hasSubmitted || !pendingSelection}
        style={{ marginTop: 8, padding: '6px 12px' }}
      >
        {hasSubmitted ? 'Submitted' : 'Confirm'}
      </button>
    </div>
  );
}
