import { useMemo, useState } from 'react';
import { IntentType, NightActionType } from '@tattletale/shared';
import useGameStore, { selectInvestigateCandidates } from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

export default function InvestigatePanel() {
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const cycle = useGameStore((s) => s.cycle);
  const pendingSelection = useGameStore((s) => s.pendingInvestigateSelection);
  const selectInvestigateTarget = useGameStore((s) => s.selectInvestigateTarget);
  const investigateSubmittedCycle = useGameStore((s) => s.investigateSubmittedCycle);
  const markInvestigateSubmitted = useGameStore((s) => s.markInvestigateSubmitted);

  // useMemo avoids returning a new array reference on every render, which
  // Zustand v5 would otherwise flag as an unstable snapshot.
  const candidates = useMemo(
    () => selectInvestigateCandidates({ players, selfId }),
    [players, selfId],
  );

  const [error, setError] = useState(null);

  const hasSubmitted = investigateSubmittedCycle === cycle;

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted) return;
    // Defense-in-depth: the candidate list already filters these out, but guard
    // against a stale pendingSelection pointing at self or a player who just died.
    const target = candidates.find((p) => p.playerId === pendingSelection);
    if (!target || pendingSelection === selfId) {
      setError('That target is no longer valid.');
      return;
    }
    try {
      setError(null);
      await socket.send('submitIntent', {
        intent: {
          type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: {
            actionType: NightActionType.INVESTIGATE,
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
      markInvestigateSubmitted(cycle);
    } catch (err) {
      setError(err?.message ?? 'Failed to submit investigate action.');
    }
  };

  const handleSelect = (playerId) => {
    if (hasSubmitted) return;
    setError(null);
    selectInvestigateTarget(playerId);
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
      <div style={{ flex: 1, overflowY: 'auto' }} role="listbox" aria-label="Investigate targets">
        {candidates.length === 0 && (
          <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>
            No valid targets available.
          </div>
        )}
        {candidates.map((p) => {
          const isSelected = pendingSelection === p.playerId;
          return (
            <div
              key={p.playerId}
              role="option"
              tabIndex={hasSubmitted ? -1 : 0}
              aria-selected={isSelected}
              aria-disabled={hasSubmitted}
              onClick={() => handleSelect(p.playerId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(p.playerId);
                }
              }}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? '#1d4ed8' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                borderRadius: 2,
                marginBottom: 2,
                outline: 'none',
              }}
            >
              <span>{p.displayName}</span>
            </div>
          );
        })}
      </div>
      {error && (
        <div
          role="alert"
          style={{ marginTop: 8, color: '#fca5a5', fontSize: 11 }}
        >
          {error}
        </div>
      )}
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
