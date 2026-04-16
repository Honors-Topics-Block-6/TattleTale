import { useEffect, useState } from 'react';

const ROLE_DISPLAY = {
  FRIEND: { name: 'Friend', description: 'Standard friend with no special powers. Use your vote wisely.', color: '#4caf50' },
  EXTROVERT: { name: 'Extrovert', description: 'Each Night Cycle, create a temporary group chat and invite any players. It lasts through the next Day Cycle.', color: '#4caf50' },
  WHITE_HAT_HACKER: { name: 'White Hat Hacker', description: 'Each Night Cycle, investigate one player and learn their role privately.', color: '#4caf50' },
  SECURITY_SPECIALIST: { name: 'Security Specialist', description: 'Each Night Cycle, protect one player from being hacked.', color: '#4caf50' },
  HACKER: { name: 'Hacker', description: 'Standard hacker. Coordinate with your team in the Hacker channel to eliminate friends.', color: '#f44336' },
  THE_BOSS: { name: 'The Boss', description: 'Each Night Cycle, you make the final call on who gets hacked.', color: '#f44336' },
  SIGNAL_JAMMER: { name: 'Signal Jammer', description: 'Each Night Cycle, jam one player\'s private messages for the next Day Cycle.', color: '#f44336' },
  EAVESDROPPER: { name: 'Eavesdropper', description: 'Each Night Cycle, monitor one player\'s private messages during the next Day Cycle.', color: '#f44336' },
  TROLLER: { name: 'Troller', description: 'Each Night Cycle, alter one player\'s first private message during the next Day Cycle.', color: '#f44336' },
  IMITATOR: { name: 'Imitator', description: 'Each Night Cycle, silence one player and chat using their name during the next Day Cycle.', color: '#f44336' },
};

export default function RoleReveal({ role, team, teammates, onDismiss }) {
  const info = ROLE_DISPLAY[role] || { name: role, description: '', color: '#888' };
  const isHacker = team === 'HACKERS';

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 160000,
        background: 'rgba(0, 0, 0, 0.7)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease-in',
      }}
    >
      <div
        style={{
          background: '#ece9d8',
          border: `3px solid ${isHacker ? '#c62828' : '#0054e3'}`,
          borderRadius: '8px 8px 0 0',
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Tahoma, sans-serif',
          boxShadow: '2px 2px 10px rgba(0,0,0,0.5)',
          transform: visible ? 'scale(1)' : 'scale(0.9)',
          transition: 'transform 0.3s ease-out',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: isHacker
              ? 'linear-gradient(to bottom, #b71c1c, #e53935, #b71c1c)'
              : 'linear-gradient(to bottom, #0058e6, #3c82f7, #0058e6)',
            padding: '4px 8px',
            borderRadius: '6px 6px 0 0',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: 13,
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          Role Assignment
        </div>

        {/* Content */}
        <div style={{ padding: 20, textAlign: 'center' }}>
          {/* Team banner */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#fff',
              background: isHacker ? '#c62828' : '#2e7d32',
              display: 'inline-block',
              padding: '2px 12px',
              borderRadius: 2,
              marginBottom: 12,
              letterSpacing: '0.5px',
            }}
          >
            {isHacker ? 'HACKER TEAM' : 'FRIEND TEAM'}
          </div>

          {/* Role name */}
          <div
            style={{
              fontSize: 28,
              fontWeight: 'bold',
              color: info.color,
              marginBottom: 8,
            }}
          >
            {info.name}
          </div>

          {/* Role description */}
          <div
            style={{
              fontSize: 12,
              color: '#555',
              marginBottom: 16,
              lineHeight: '1.5',
              padding: '0 12px',
            }}
          >
            {info.description}
          </div>

          {/* Hacker teammates */}
          {isHacker && teammates && teammates.length > 0 && (
            <div
              style={{
                border: '1px solid #d4d0c8',
                marginBottom: 16,
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  background: '#f5f3ee',
                  padding: '4px 8px',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #d4d0c8',
                  fontSize: 11,
                }}
              >
                Your Team
              </div>
              <div style={{ padding: 8 }}>
                {teammates.map((mate) => (
                  <div
                    key={mate.playerId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '3px 4px',
                      fontSize: 11,
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <span style={{ color: '#333' }}>{mate.displayName}</span>
                    <span style={{ color: '#c62828', fontWeight: 'bold' }}>
                      {ROLE_DISPLAY[mate.role]?.name || mate.role || '?'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            style={{
              padding: '6px 24px',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 12,
              fontWeight: 'bold',
              border: '1px solid #7f9db9',
              background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
