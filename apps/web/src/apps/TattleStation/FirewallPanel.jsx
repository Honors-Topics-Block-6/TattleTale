import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

const TYPE_LABEL = {
  GLOBAL: 'Global',
  PRIVATE: 'DM',
  TEMP: 'Temp Chat',
  ROLE: 'Role',
};

export default function FirewallPanel() {
  const socket = useSocket();
  const firewallNightView = useGameStore((s) => s.firewallNightView);
  const pendingSelection = useGameStore((s) => s.pendingFirewallSelection);
  const selectFirewallTarget = useGameStore((s) => s.selectFirewallTarget);

  if (!firewallNightView) return null;

  const candidates = firewallNightView.candidates ?? [];
  const confirmedTargetChannelId = firewallNightView.confirmedTargetChannelId ?? null;
  const used = !!firewallNightView.used;
  const hasSubmitted = confirmedTargetChannelId !== null;

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted || used) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: 'CHANNEL_LOCK',
            targetChannelId: pendingSelection,
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Failed to submit firewall action:', err);
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
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#22d3ee' }}>
        Firewall — lock one channel for the next Day Cycle.
      </div>
      <div style={{ marginBottom: 8, color: '#fbbf24', fontSize: 11 }}>
        {used
          ? 'You have already used your once-per-game lock.'
          : 'Once per game. Choose carefully.'}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.length === 0 && (
          <div style={{ color: '#64748b', fontStyle: 'italic' }}>
            No lockable channels right now.
          </div>
        )}
        {candidates.map((c) => {
          const isSelected =
            pendingSelection === c.channelId
            || confirmedTargetChannelId === c.channelId;
          const labelText = c.label ?? TYPE_LABEL[c.type] ?? c.type;
          return (
            <div
              key={c.channelId}
              onClick={() => !hasSubmitted && !used && selectFirewallTarget(c.channelId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted || used ? 'default' : 'pointer',
                background: isSelected ? '#0e7490' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                borderRadius: 2,
                marginBottom: 2,
              }}
            >
              <span>{labelText}</span>
              <span style={{ color: '#94a3b8' }}>{c.type}</span>
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
        {used ? 'Used' : hasSubmitted ? 'Submitted' : 'Confirm Lock'}
      </button>
    </div>
  );
}
