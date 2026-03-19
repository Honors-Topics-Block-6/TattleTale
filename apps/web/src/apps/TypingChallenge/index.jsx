import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useWindowStore from '../../os/store/windowStore';
import useInstallStore from '../../os/store/installStore';
import { openMessageBox, openProgressBox } from '../../os/services/dialogService';
import { sfxClick } from '../../os/utils/sfx';

const PHRASES = [
  'Type fast. Type clean.',
  'No mistakes. No excuses.',
  'Keep calm and carry on.',
  'The quick brown fox jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump.',
];

const TIME_LIMIT_S = 20;
const MAX_MISTAKES = 3;

function TypingChallengeComponent({ windowId }) {
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const installLocal = useInstallStore((state) => state.install);
  const installViaServer = useInstallStore((state) => state.installViaServer);

  const [target, setTarget] = useState('');
  const [typed, setTyped] = useState('');
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | running
  const [timeLeftMs, setTimeLeftMs] = useState(TIME_LIMIT_S * 1000);

  const inputRef = useRef(null);
  const prevTypedRef = useRef('');
  const deadlineRef = useRef(0);
  const failedRef = useRef(false);
  const wonRef = useRef(false);

  const pickPhrase = useCallback(() => {
    return PHRASES[Math.floor(Math.random() * PHRASES.length)];
  }, []);

  const timeLeftS = useMemo(() => Math.max(0, Math.ceil(timeLeftMs / 1000)), [timeLeftMs]);

  const reset = useCallback(() => {
    const next = pickPhrase();
    setTarget(next);
    setTyped('');
    prevTypedRef.current = '';
    failedRef.current = false;
    wonRef.current = false;
    setMistakes(0);
    setTimeLeftMs(TIME_LIMIT_S * 1000);
    setStatus('idle');
  }, [pickPhrase]);

  const beginRun = useCallback(() => {
    reset();
    setStatus('running');
    deadlineRef.current = Date.now() + TIME_LIMIT_S * 1000;
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [reset]);

  useEffect(() => {
    // Auto-start so players don't get stuck on a lone "Start" button.
    beginRun();
  }, [beginRun]);

  useEffect(() => {
    if (status !== 'running') return;
    const tick = () => {
      const left = deadlineRef.current - Date.now();
      setTimeLeftMs(left);
      if (left <= 0) {
        if (failedRef.current) return;
        failedRef.current = true;
        setStatus('idle');
        openMessageBox({
          title: 'Game Store',
          message: 'Purchase Failed. Try Again.',
          tone: 'error',
        });
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [status]);

  const handleStart = () => {
    sfxClick();
    beginRun();
  };

  const handleWin = () => {
    if (wonRef.current) return;
    wonRef.current = true;
    closeWindow(windowId);
    openMessageBox({
      title: 'Confirm Purchase',
      message: 'Confirm you would like to purchase Typing Game?',
      tone: 'info',
      buttons: [
        {
          id: 'yes',
          label: 'Yes',
          onClick: () => {
            openProgressBox({
              title: 'Game Store',
              message: 'Installing Typing Game...',
              durationMs: 1400,
              onDone: async () => {
                // Always install to the desktop immediately.
                installLocal('typing-game');

                // Best-effort server sync (doesn't block local install).
                try {
                  await installViaServer('typing-game');
                } catch {
                  // Intentionally ignore: server may not be running in dev.
                }

                openMessageBox({
                  title: 'Game Store',
                  message: 'Installation Complete!',
                  tone: 'success',
                });
              },
            });
          },
        },
        { id: 'no', label: 'No' },
      ],
    });
  };

  const handleChange = (e) => {
    if (status !== 'running') return;
    const next = e.target.value;
    const prev = prevTypedRef.current;

    // Count new wrong keystrokes when text grows (covers typing + paste).
    let addedMistakes = 0;
    if (next.length > prev.length) {
      for (let i = prev.length; i < next.length; i += 1) {
        const expected = target[i];
        const actual = next[i];
        if (expected !== undefined && actual !== expected) addedMistakes += 1;
      }
      if (addedMistakes) {
        setMistakes((m) => m + addedMistakes);
      }
    }

    prevTypedRef.current = next;
    setTyped(next);

    const prospectiveMistakes = mistakes + addedMistakes;
    if (prospectiveMistakes > MAX_MISTAKES) {
      if (!failedRef.current) {
        failedRef.current = true;
        openMessageBox({
          title: 'Game Store',
          message: 'Purchase Failed. Try Again.',
          tone: 'error',
        });
      }
      setStatus('idle');
      return;
    }

    if (next === target && Date.now() <= deadlineRef.current && prospectiveMistakes <= MAX_MISTAKES) {
      handleWin();
    }
  };

  const tooManyMistakes = mistakes > MAX_MISTAKES;
  const timeUp = timeLeftMs <= 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ece9d8',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 'bold' }}>Unlock Challenge</div>
      <div style={{ color: '#000', lineHeight: 1.35 }}>
        Type the phrase exactly within <b>{TIME_LIMIT_S}s</b>. You can make up to <b>{MAX_MISTAKES}</b> mistakes.
      </div>

      <div
        style={{
          padding: 8,
          backgroundColor: '#fff',
          border: '1px solid #aca899',
          boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #716f64',
          fontSize: 12,
        }}
      >
        {target}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div>
          <b>Time:</b> {timeLeftS}s
        </div>
        <div>
          <b>Mistakes:</b> {mistakes}/{MAX_MISTAKES}
        </div>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={typed}
        onChange={handleChange}
        disabled={status !== 'running' || timeUp || tooManyMistakes}
        spellCheck={false}
        autoComplete="off"
        style={{
          width: '100%',
          padding: '3px 4px',
          border: '1px solid #7f9db9',
          outline: 'none',
          fontFamily: 'Tahoma, sans-serif',
          fontSize: 11,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'auto' }}>
        <button type="button" onClick={handleStart} style={btnStyle}>
          Start
        </button>
        <button
          type="button"
          onClick={() => {
            sfxClick();
            closeWindow(windowId);
          }}
          style={btnStyle}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const btnStyle = {
  minWidth: 80,
  padding: '3px 12px',
  border: '1px solid #7f9db9',
  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
  cursor: 'pointer',
  fontFamily: 'Tahoma, sans-serif',
  fontSize: 11,
};

const challengeIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="3" y="6" width="26" height="20" rx="2" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
    <rect x="5" y="8" width="22" height="16" fill="#000080"/>
    <text x="16" y="19" text-anchor="middle" font-size="9" font-family="Tahoma" fill="#fff" font-weight="bold">ABC</text>
  </svg>
`);

const TypingChallenge = {
  id: 'typing-challenge',
  name: 'Typing Challenge',
  icon: challengeIcon,
  component: TypingChallengeComponent,
  defaultWindow: {
    width: 520,
    height: 320,
    resizable: false,
    minWidth: 520,
    minHeight: 320,
  },
  desktopIcon: { show: false },
  startMenu: { show: false, section: 'programs' },
};

export default TypingChallenge;

