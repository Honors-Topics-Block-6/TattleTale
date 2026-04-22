import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function InvestigatePanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const pendingSelection = useGameStore((s) => s.pendingInvestigateSelection);
  const selectInvestigateTarget = useGameStore((s) => s.selectInvestigateTarget);
  const pendingIntentTypes = useGameStore((s) => s.pendingIntentTypes);

  const candidates = Object.values(players).filter(
    (p) => p.alive && p.playerId !== selfId,
  );

  const hasSubmitted = pendingIntentTypes.includes('SUBMIT_NIGHT_ACTION');

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: 'INVESTIGATE',
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit investigate action:', err);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#60a5fa' }}>
        Pick a player to investigate tonight.
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const isSelected = pendingSelection === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && selectInvestigateTarget(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#1d4ed8' : 'transparent',
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
