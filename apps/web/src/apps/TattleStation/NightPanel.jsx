import useGameStore from '../../stores/gameStore';

export default function NightPanel({ socket }) {
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const myTeammates = useGameStore((s) => s.myTeammates);
  const hackerNightView = useGameStore((s) => s.hackerNightView);
  const pendingSelection = useGameStore((s) => s.pendingNightKillSelection);
  const selectNightKillTarget = useGameStore((s) => s.selectNightKillTarget);

  if (!hackerNightView) return null;

  const nightKillTally = hackerNightView.tally ?? {};
  const confirmedNightKill = hackerNightView.confirmedTarget ?? null;
  const hasSubmitted = confirmedNightKill !== null;

  const hackerSet = new Set([selfId, ...(myTeammates ?? [])]);
  const candidates = Object.values(players).filter(
    (p) => p.alive && !hackerSet.has(p.playerId),
  );

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: 'HACKER_KILL',
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit night action:', err);
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
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#f87171' }}>
        Pick a target to hack tonight.
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const tally = nightKillTally[p.playerId] ?? 0;
          const isSelected =
            pendingSelection === p.playerId ||
            confirmedNightKill === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && selectNightKillTarget(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#b91c1c' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                borderRadius: 2,
                marginBottom: 2,
              }}
            >
              <span>{p.displayName}</span>
              {tally > 0 && <span style={{ color: '#f87171' }}>{tally}</span>}
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
