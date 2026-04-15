import { useState, useEffect } from 'react';
import BSODScreen from './BSODScreen';

const GLITCH_DURATION = 2000;
const BSOD_DURATION = 3000;
const REBOOT_DURATION = 2000;

export default function EliminationSequence({ cause, onComplete }) {
  const [stage, setStage] = useState('glitch'); // glitch -> bsod -> reboot -> done

  useEffect(() => {
    const timers = [];

    timers.push(
      setTimeout(() => setStage('bsod'), GLITCH_DURATION)
    );
    timers.push(
      setTimeout(() => setStage('reboot'), GLITCH_DURATION + BSOD_DURATION)
    );
    timers.push(
      setTimeout(() => {
        setStage('done');
        onComplete();
      }, GLITCH_DURATION + BSOD_DURATION + REBOOT_DURATION)
    );

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (stage === 'done') return null;

  if (stage === 'glitch') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200000,
          background: 'transparent',
          pointerEvents: 'none',
          animation: 'glitch-flicker 0.1s infinite',
        }}
      >
        <style>{`
          @keyframes glitch-flicker {
            0% { opacity: 1; }
            20% { opacity: 0.4; filter: hue-rotate(90deg); }
            40% { opacity: 1; transform: translateX(3px); }
            60% { opacity: 0.6; transform: translateX(-5px); }
            80% { opacity: 1; filter: saturate(2); }
            100% { opacity: 0.8; }
          }
        `}</style>
        {/* Static noise overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E")`,
            opacity: 0.5,
            mixBlendMode: 'overlay',
          }}
        />
      </div>
    );
  }

  if (stage === 'bsod') {
    return <BSODScreen cause={cause} />;
  }

  if (stage === 'reboot') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#ccc',
          fontFamily: '"Lucida Console", "Courier New", monospace',
          fontSize: 13,
          padding: '5% 10%',
          zIndex: 200000,
          whiteSpace: 'pre-wrap',
        }}
      >
        <RebootText />
      </div>
    );
  }

  return null;
}

function RebootText() {
  const [lines, setLines] = useState([]);
  const bootLines = [
    'TattleTale BIOS v2.1',
    'Checking system integrity...',
    'Memory test: 640K OK',
    'Attempting network recovery... FAILED',
    '',
    'Loading Safe Mode...',
  ];

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < bootLines.length) {
        setLines((prev) => [...prev, bootLines[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return lines.map((line, i) => <div key={i}>{line}</div>);
}
