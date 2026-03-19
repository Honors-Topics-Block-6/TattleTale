import { useState, useRef, useCallback, useEffect } from 'react';

const SENTENCES = [
  'The signal is weak but real.',
  'Trust the pattern, not the noise.',
  'Someone is definitely hiding something.',
  'You are being watched, stay calm.',
  'Every message leaves a trace.',
  'Silence can be louder than words.',
  'The quick brown fox jumps over the lazy dog.',
  'All that glitters is not gold.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump.',
  'The five boxing wizards jump quickly.',
  'A journey of a thousand miles begins with a single step.',
  'Knowledge is power, but enthusiasm pulls the switch.',
  'Not all who wander are lost.',
  'Fortune favors the bold and the prepared.',
  'In the middle of difficulty lies opportunity.',
];

function TypingGameComponent() {
  const [sentence, setSentence] = useState('');
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('idle');
  const inputRef = useRef(null);

  const pickSentence = useCallback(() => {
    return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  }, []);

  useEffect(() => {
    setSentence(pickSentence());
  }, [pickSentence]);

  const handleStart = () => {
    setSentence(pickSentence());
    setTyped('');
    setStatus('typing');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (typed.trim() === sentence.trim()) {
      setStatus('success');
    } else {
      setStatus('fail');
    }
  };

  const handleChange = (e) => {
    if (status === 'typing') setTyped(e.target.value);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#ece9d8',
      fontFamily: 'Tahoma, sans-serif',
      fontSize: 11,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <p style={{ marginBottom: 8, textAlign: 'center' }}>
        Type the sentence below exactly to clear the interference.
      </p>

      <div style={{
        marginBottom: 10,
        padding: 8,
        backgroundColor: '#fff',
        border: '1px solid #aca899',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 12,
        width: '100%',
        maxWidth: 400,
        textAlign: 'center',
      }}>
        {sentence}
      </div>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400 }}>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={handleChange}
          disabled={status !== 'typing'}
          autoFocus={status === 'typing'}
          spellCheck={false}
          autoComplete="off"
          style={{
            width: '100%',
            marginBottom: 8,
            padding: '3px 4px',
            border: '1px solid #7f9db9',
            outline: 'none',
            fontFamily: 'Tahoma, sans-serif',
            fontSize: 11,
            boxSizing: 'border-box',
          }}
        />

        {status === 'success' && (
          <div style={{ marginBottom: 8, color: '#008000', textAlign: 'center' }}>
            Signal stabilized. Well done!
          </div>
        )}
        {status === 'fail' && (
          <div style={{ marginBottom: 8, color: '#800000', textAlign: 'center' }}>
            That didn&apos;t match. Check spacing and punctuation.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {status === 'idle' && (
            <button type="button" onClick={handleStart} style={btnStyle}>
              Start
            </button>
          )}
          {status === 'typing' && (
            <button type="submit" style={btnStyle}>
              OK
            </button>
          )}
          {(status === 'success' || status === 'fail') && (
            <button type="button" onClick={handleStart} style={btnStyle}>
              Next
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const btnStyle = {
  minWidth: 70,
  padding: '2px 10px',
  border: '1px solid #7f9db9',
  background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
  cursor: 'pointer',
  fontFamily: 'Tahoma, sans-serif',
  fontSize: 11,
};

const typingIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="2" y="10" width="28" height="18" rx="2" fill="#d0d0d0" stroke="#888" stroke-width="1"/>
    <rect x="4" y="12" width="24" height="14" rx="1" fill="#f0f0f0"/>
    <rect x="6" y="14" width="4" height="3" rx="0.5" fill="#bbb"/>
    <rect x="11" y="14" width="4" height="3" rx="0.5" fill="#bbb"/>
    <rect x="16" y="14" width="4" height="3" rx="0.5" fill="#bbb"/>
    <rect x="21" y="14" width="5" height="3" rx="0.5" fill="#bbb"/>
    <rect x="6" y="18" width="5" height="3" rx="0.5" fill="#bbb"/>
    <rect x="12" y="18" width="4" height="3" rx="0.5" fill="#bbb"/>
    <rect x="17" y="18" width="4" height="3" rx="0.5" fill="#bbb"/>
    <rect x="22" y="18" width="4" height="3" rx="0.5" fill="#bbb"/>
    <rect x="9" y="22" width="14" height="2.5" rx="0.5" fill="#999"/>
    <text x="16" y="8" text-anchor="middle" font-size="8" font-family="Tahoma" fill="#0a246a" font-weight="bold">Aa</text>
  </svg>
`);

const TypingGame = {
  id: 'typing-game',
  name: 'Typing Game',
  icon: typingIcon,
  component: TypingGameComponent,
  defaultWindow: {
    width: 440,
    height: 280,
    resizable: true,
    minWidth: 360,
    minHeight: 240,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Test your typing accuracy',
  },
};

export default TypingGame;
