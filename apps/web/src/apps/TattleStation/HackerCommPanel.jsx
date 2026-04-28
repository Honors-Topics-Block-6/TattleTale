import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

/**
 * Single-target Hacker comm-role panel (#86 Signal Jammer, #87 Eavesdropper,
 * #88 Troller, #89 Imitator). Mirrors the ProtectPanel/InvestigatePanel
 * pattern — picks a non-self living player, submits the role's NightActionType.
 *
 * The four roles share UI shape; per-role copy and the action type are
 * passed in via the `role` prop.
 */
const ROLE_CONFIG = {
  SIGNAL_JAMMER: {
    actionType: 'JAM',
    title: 'Signal Jammer — jam a player\'s PMs.',
    subtitle: 'Target cannot send or receive Private Messages next Day Cycle.',
    color: '#f97316',
    selectedBg: '#9a3412',
    viewKey: 'jammerNightView',
    pendingKey: 'pendingJammerSelection',
    selectAction: 'selectJammerTarget',
    excludeTeammates: true,
  },
  EAVESDROPPER: {
    actionType: 'MONITOR',
    title: 'Eavesdropper — monitor a player\'s PMs.',
    subtitle: 'Target will not know they are being watched.',
    color: '#a855f7',
    selectedBg: '#6b21a8',
    viewKey: 'eavesdropperNightView',
    pendingKey: 'pendingEavesdropperSelection',
    selectAction: 'selectEavesdropperTarget',
    excludeTeammates: true,
  },
  TROLLER: {
    actionType: 'MISDIRECT',
    title: 'Troller — scramble a player\'s first PM.',
    subtitle: 'The recipient sees gibberish; the sender does not know.',
    color: '#ec4899',
    selectedBg: '#9d174d',
    viewKey: 'trollerNightView',
    pendingKey: 'pendingTrollerSelection',
    selectAction: 'selectTrollerTarget',
    excludeTeammates: true,
  },
  IMITATOR: {
    actionType: 'IMITATE',
    title: 'Imitator — silence a player and lose your DMs.',
    subtitle: 'They cannot chat. You cannot use Private Messages tomorrow.',
    color: '#14b8a6',
    selectedBg: '#115e59',
    viewKey: 'imitatorNightView',
    pendingKey: 'pendingImitatorSelection',
    selectAction: 'selectImitatorTarget',
    excludeTeammates: true,
  },
};

export default function HackerCommPanel({ role }) {
  const cfg = ROLE_CONFIG[role];
  const socket = useSocket();
  const players = useGameStore((s) => s.players);
  const selfId = useGameStore((s) => s.selfId);
  const myTeammates = useGameStore((s) => s.myTeammates);
  const view = useGameStore((s) => s[cfg.viewKey]);
  const pendingSelection = useGameStore((s) => s[cfg.pendingKey]);
  const selectTarget = useGameStore((s) => s[cfg.selectAction]);

  if (!view) return null;

  const confirmedTarget = view.confirmedTarget ?? null;
  const hasSubmitted = confirmedTarget !== null;

  const teammateSet = cfg.excludeTeammates
    ? new Set([selfId, ...(myTeammates ?? [])])
    : new Set([selfId]);
  const candidates = Object.values(players).filter(
    (p) => p.alive && !teammateSet.has(p.playerId),
  );

  const handleConfirm = async () => {
    if (!pendingSelection || hasSubmitted) return;
    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SUBMIT_NIGHT_ACTION',
          payload: {
            actionType: cfg.actionType,
            targetPlayerId: pendingSelection,
            metadata: {},
          },
          clientTimestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error(`Failed to submit ${cfg.actionType} action:`, err);
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
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: cfg.color }}>
        {cfg.title}
      </div>
      <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: 11 }}>
        {cfg.subtitle}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {candidates.map((p) => {
          const isSelected =
            pendingSelection === p.playerId || confirmedTarget === p.playerId;
          return (
            <div
              key={p.playerId}
              onClick={() => !hasSubmitted && selectTarget(p.playerId)}
              style={{
                padding: '6px 8px',
                cursor: hasSubmitted ? 'default' : 'pointer',
                background: isSelected ? cfg.selectedBg : 'transparent',
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
