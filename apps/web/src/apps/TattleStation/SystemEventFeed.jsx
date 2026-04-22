import { ROLE_DEFINITIONS } from '@tattletale/shared';

const TEMPLATES = {
  GAME_STARTED: () => 'The game has begun.',
  PLAYER_VOTED_OUT: ({ targetDisplayName } = {}) =>
    `${targetDisplayName ?? 'A player'} was voted out.`,
  PLAYER_KILLED_AT_NIGHT: ({ targetDisplayName } = {}) =>
    `${targetDisplayName ?? 'A player'} was hacked in the night.`,
  NO_KILL_TONIGHT: () => 'The night passed without incident.',
  CHANNEL_LOCKED: () => 'A channel was locked.',
  COMMUNICATION_JAMMED: () => 'Communications are jammed.',
  MESSAGE_INTEGRITY_COMPROMISED: () => 'A message was tampered with.',
  TEMP_CHANNEL_CREATED: () => 'A new channel opened.',
  PSYCHIC_SIGNAL_RECEIVED: () => 'A psychic signal is coming through.',
  INVESTIGATION_RESULT: ({ targetDisplayName, targetRoleId } = {}) => {
    const roleName = ROLE_DEFINITIONS.get(targetRoleId)?.displayName ?? 'Unknown Role';
    return `You investigated ${targetDisplayName ?? 'a player'}. They are a ${roleName}.`;
  },
};

function formatEvent(event) {
  const template = TEMPLATES[event.type];
  if (template) return template(event.metadata);
  return event.type.replace(/_/g, ' ').toLowerCase();
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function SystemEventFeed({ events }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 8,
        background: '#fff',
        border: '1px inset #aca899',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      {events.length === 0 && (
        <div style={{ color: '#999', fontStyle: 'italic' }}>
          Waiting for results...
        </div>
      )}
      {events.map((event) => (
        <div
          key={event.id}
          style={{
            padding: '4px 0',
            borderBottom: '1px solid #f0f0f0',
            color: '#555',
          }}
        >
          <span style={{ color: '#999', marginRight: 6, fontSize: 10 }}>
            {formatTime(event.createdAt)}
          </span>
          {formatEvent(event)}
        </div>
      ))}
    </div>
  );
}
