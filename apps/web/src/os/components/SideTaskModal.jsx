import { useState } from 'react';

/**
 * XP-style modal for side tasks (typing captcha, attention checks, etc).
 * Renders as an overlay on top of the OS.
 */
export default function SideTaskModal({ task, onSubmit, onDismiss }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('ACTIVE'); // ACTIVE | SUCCESS | FAIL

  if (!task) return null;

  const isResolved = status === 'SUCCESS' || status === 'FAIL';
  const isOpenTask = task.type === 'OPEN_2048';

  const handleClose = () => {
    onDismiss?.();
  };

  const handleTypingSubmit = (e) => {
    e.preventDefault();
    if (isResolved) return;
    const result = onSubmit?.(value);
    setStatus(result === 'SUCCESS' ? 'SUCCESS' : 'FAIL');
  };

  const handleOpen2048 = () => {
    if (isResolved) return;
    const result = onSubmit?.('OPEN_2048');
    const nextStatus = result === 'SUCCESS' ? 'SUCCESS' : 'FAIL';
    setStatus(nextStatus);

    // If we successfully opened the game window, dismiss the overlay so
    // the player can immediately use arrow keys.
    if (nextStatus === 'SUCCESS') onDismiss?.();
  };

  const handleAttentionChoice = (index) => {
    if (isResolved) return;
    const result = onSubmit?.(index);
    setStatus(result === 'SUCCESS' ? 'SUCCESS' : 'FAIL');
  };

  const isTypingTask = task.type === 'TYPING_SENTENCE';
  const isAttentionTask = task.type === 'ATTENTION_CHECK';

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
            background: 'linear-gradient(to right, #0a246a, #a6caf0)',
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
              (isTypingTask
                ? 'Type the sentence below exactly to clear the interference.'
                : isAttentionTask
                ? 'Tap the item that does not belong with the others.'
                : 'Open 2048 and play until you reach the next milestone.')}
          </p>

          {isTypingTask && (
            <>
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

              <form onSubmit={handleTypingSubmit}>
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
                      background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
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
            </>
          )}

          {isAttentionTask && Array.isArray(task.options) && (
            <>
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
                {task.prompt ||
                  'Choose carefully; only one of these fits the rule.'}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {task.options.map((option, index) => (
                  <button
                    key={option + index}
                    type="button"
                    disabled={isResolved}
                    onClick={() => handleAttentionChoice(index)}
                    style={{
                      flex: '1 1 45%',
                      padding: '4px 6px',
                      border: '1px solid #7f9db9',
                      background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                      cursor: isResolved ? 'default' : 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {status === 'SUCCESS' && (
                <div style={{ marginBottom: 8, color: '#008000' }}>
                  Focus confirmed. You can close this window.
                </div>
              )}
              {status === 'FAIL' && (
                <div style={{ marginBottom: 8, color: '#800000' }}>
                  You got distracted. Try to stay sharp.
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
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
                  Close
                </button>
              </div>
            </>
          )}

          {isOpenTask && (
            <>
              {status === 'SUCCESS' && (
                <div style={{ marginBottom: 8, color: '#008000' }}>
                  2048 opened. Keep going until you reach 2048.
                </div>
              )}
              {status === 'FAIL' && (
                <div style={{ marginBottom: 8, color: '#800000' }}>
                  Couldn&apos;t open 2048. Try again.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleOpen2048}
                  disabled={isResolved}
                  style={{
                    minWidth: 120,
                    padding: '2px 10px',
                    border: '1px solid #7f9db9',
                    background:
                      'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                    cursor: isResolved ? 'default' : 'pointer',
                  }}
                >
                  Open 2048
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    minWidth: 90,
                    padding: '2px 10px',
                    border: '1px solid #7f9db9',
                    background:
                      'linear-gradient(to bottom, #ffffff, #d9e4f6)',
                    cursor: 'pointer',
                  }}
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

