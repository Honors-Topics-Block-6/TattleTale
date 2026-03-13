import { useState } from 'react';

/**
 * Simple XP-style modal for side tasks (typing captcha, etc).
 * Renders as an overlay on top of the OS.
 */
export default function SideTaskModal({ task, onSubmit, onDismiss }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('ACTIVE'); // ACTIVE | SUCCESS | FAIL

  if (!task) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = onSubmit?.(value);
    if (result === 'SUCCESS') {
      setStatus('SUCCESS');
    } else {
      setStatus('FAIL');
    }
  };

  const handleClose = () => {
    onDismiss?.();
  };

  const isResolved = status === 'SUCCESS' || status === 'FAIL';

  return (
    <div
      className="xp-side-task-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
      }}
    >
      <div
        className="xp-side-task-window"
        style={{
          width: 360,
          maxWidth: '90%',
          backgroundColor: '#ece9d8',
          border: '2px solid #0a246a',
          boxShadow: '2px 2px 6px rgba(0,0,0,0.4)',
          fontFamily: 'Tahoma, sans-serif',
          fontSize: 11,
        }}
      >
        <div
          style={{
            background:
              'linear-gradient(to right, #0a246a, #a6caf0)',
            color: 'white',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{task.title || 'System notification'}</span>
          <button
            onClick={handleClose}
            style={{
              border: 'none',
              backgroundColor: '#c0c0c0',
              width: 16,
              height: 16,
              fontSize: 10,
              lineHeight: '14px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 12 }}>
          <p style={{ marginBottom: 8 }}>
            {task.message ||
              'Type the sentence below exactly to clear the interference.'}
          </p>

          <div
            style={{
              marginBottom: 8,
              padding: 6,
              backgroundColor: '#ffffff',
              border: '1px solid #aca899',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 11,
            }}
          >
            {task.sentence}
          </div>

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isResolved}
              autoFocus
              style={{
                width: '100%',
                marginBottom: 8,
                padding: '3px 4px',
                border: '1px solid #7f9db9',
                outline: 'none',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: 11,
              }}
            />

            {status === 'SUCCESS' && (
              <div style={{ marginBottom: 8, color: '#008000' }}>
                Signal stabilized. You can close this window.
              </div>
            )}
            {status === 'FAIL' && (
              <div style={{ marginBottom: 8, color: '#800000' }}>
                That didn&apos;t match. Check spacing and punctuation.
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="submit"
                disabled={isResolved}
                style={{
                  minWidth: 70,
                  padding: '2px 10px',
                  border: '1px solid #7f9db9',
                  background:
                    'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                  cursor: isResolved ? 'default' : 'pointer',
                }}
              >
                OK
              </button>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  minWidth: 70,
                  padding: '2px 10px',
                  border: '1px solid #7f9db9',
                  background:
                    'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

