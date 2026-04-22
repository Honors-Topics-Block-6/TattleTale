import { useState, useRef, useEffect } from 'react';
import useGameStore from '../../stores/gameStore';
import { useSocket } from '../../lib/SocketContext';

function DayDivider({ cycle }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '10px 0 6px',
        color: '#888',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      <div style={{ flex: 1, height: 1, background: '#d4d0c8' }} />
      <span>— Day {cycle} —</span>
      <div style={{ flex: 1, height: 1, background: '#d4d0c8' }} />
    </div>
  );
}

export default function ChatPanel({ channelId }) {
  const socket = useSocket();
  const channel = useGameStore((s) => s.channels[channelId]);
  const selfAlive = useGameStore((s) => s.selfAlive);
  const selfId = useGameStore((s) => s.selfId);
  const phase = useGameStore((s) => s.phase);
  const myRestrictions = useGameStore((s) => s.myRestrictions);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const messages = channel?.messages || [];
  const isLocked = channel?.locked ?? false;
  const isPrivatePhaseRestricted =
    channel?.type === 'PRIVATE' && phase !== 'DAY_OPEN';
  const isSystemChannel = channel?.type === 'SYSTEM';
  const isSilenced = myRestrictions.some((r) => r.type === 'SILENCED');
  const isJammed = myRestrictions.some(
    (r) => r.type === 'JAMMED' && r.channelTypes?.includes(channel?.type),
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const content = inputValue.trim();
    // All other gates (selfAlive, isLocked, isPrivatePhaseRestricted,
    // isSystemChannel, isSilenced, isJammed) are enforced by conditional
    // rendering of the input block below — if any are true the input/button
    // don't exist, so handleSend is unreachable. Re-checking them here would
    // create a silent second layer that masks state/render desync bugs.
    if (!content) return;

    try {
      await socket.send('submitIntent', {
        intent: {
          type: 'SEND_MESSAGE',
          payload: { channelId, content },
          clientTimestamp: new Date().toISOString(),
        },
      });
      setInputValue('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 6,
          background: '#fff',
          border: '1px inset #aca899',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#999', fontStyle: 'italic', padding: 8 }}>
            No messages yet.
          </div>
        )}
        {messages.map((msg, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const showDivider =
            typeof msg.cycle === 'number' &&
            (prev === null || prev.cycle !== msg.cycle);
          return (
            <div key={msg.id}>
              {showDivider && <DayDivider cycle={msg.cycle} />}
              <div style={{ marginBottom: 4 }}>
                <span
                  style={{
                    fontWeight: 'bold',
                    color: msg.senderId === selfId ? '#0054e3' : '#333',
                  }}
                >
                  {msg.senderAvatar || '🙂'}{' '}
                  {msg.senderName}
                </span>
                <span style={{ color: '#999', marginLeft: 6, fontSize: 10 }}>
                  {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <div style={{ marginLeft: 2 }}>{msg.content}</div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {selfAlive && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: '#ece9d8',
            borderTop: '1px solid #aca899',
          }}
        >
          {isSystemChannel ? (
            <div
              style={{
                flex: 1,
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              System channel is read-only
            </div>
          ) : isLocked ? (
            <div
              style={{
                flex: 1,
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Channel locked
            </div>
          ) : isPrivatePhaseRestricted ? (
            <div
              style={{
                flex: 1,
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Private messages are disabled during this phase
            </div>
          ) : isSilenced ? (
            <div
              style={{
                flex: 1,
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              You have been silenced
            </div>
          ) : isJammed ? (
            <div
              style={{
                flex: 1,
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Your signal is jammed on this channel
            </div>
          ) : (
            <>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '3px 6px',
                  fontFamily: 'Tahoma, sans-serif',
                  fontSize: 11,
                  border: '1px solid #7f9db9',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                style={{
                  padding: '2px 10px',
                  fontFamily: 'Tahoma, sans-serif',
                  fontSize: 11,
                  border: '1px solid #7f9db9',
                  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                  cursor: 'pointer',
                }}
              >
                Send
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
