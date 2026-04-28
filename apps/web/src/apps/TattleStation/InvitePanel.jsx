import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function InvitePanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const extrovertNightView = useGameStore((s) => s.extrovertNightView);
  const pendingSelections = useGameStore((s) => s.pendingExtrovertSelections);
  const toggleExtrovertTarget = useGameStore((s) => s.toggleExtrovertTarget);

  if (!extrovertNightView) return null;

  const confirmedTargetIds = extrovertNightView.confirmedTargetIds ?? null;
  const hasSubmitted = confirmedTargetIds !== null;

  const candidates = Object.values(players).filter(
    (p) => p.alive && p.playerId !== selfId,
  );

  const selectedSet = new Set(
    hasSubmitted ? confirmedTargetIds : (pendingSelections ?? []),
  );

  const handleConfirm = async () => {
    if (hasSubmitted || selectedSet.size === 0) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: 'CREATE_TEMP_CHAT',
            targetPlayerIds: Array.from(selectedSet),
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit invite action:', err);
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
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#60a5fa' }}>
        Invite players to a temporary group chat tonight.
      </div>
      {!hasSubmitted && (
        <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: 11 }}>
          Select at least one player, then press Confirm.
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const isSelected = selectedSet.has(p.playerId);
          return (
            <label
              key={p.playerId}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#1d4ed8' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 2,
                marginBottom: 2,
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={hasSubmitted}
                onChange={() => !hasSubmitted && toggleExtrovertTarget(p.playerId)}
              />
              <span>{p.displayName}</span>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={hasSubmitted || selectedSet.size === 0}
        style={{ marginTop: 8, padding: '6px 12px' }}
      >
        {hasSubmitted ? 'Submitted' : `Confirm (${selectedSet.size})`}
      </button>
    </div>
  );
}
