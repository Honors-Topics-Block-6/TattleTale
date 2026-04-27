import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function ProtectPanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const protectNightView = useGameStore((s) => s.protectNightView);
  const pendingSelection = useGameStore((s) => s.pendingProtectSelection);
  const selectProtectTarget = useGameStore((s) => s.selectProtectTarget);

  if (!protectNightView) return null;

  const confirmedTarget = protectNightView.confirmedTarget ?? null;
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
            actionType: 'PROTECT',
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit protect action:', err);
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
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#10b981' }}>
        Pick a player to protect tonight.
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const isSelected =
            pendingSelection === p.playerId || confirmedTarget === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && selectProtectTarget(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#047857' : 'transparent',
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
