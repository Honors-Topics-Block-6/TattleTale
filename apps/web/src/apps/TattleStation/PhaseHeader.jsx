import useGameStore from '../../stores/gameStore';

const PHASE_LABELS = {
  DAY_OPEN: 'Open Discussion',
  DAY_VOTE: 'Vote',
  DAY_RESOLVE: 'Day Results',
  NIGHT_ACTIONS: 'Night',
  NIGHT_RESOLVE: 'Night Results',
  NIGHT_REVEAL: 'Dawn',
};

export default function PhaseHeader() {
  const phase = useGameStore((s) => s.phase);
  const cycle = useGameStore((s) => s.cycle);
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const phaseDurationSeconds = useGameStore((s) => s.phaseDurationSeconds);

  const label = PHASE_LABELS[phase] || phase || 'Waiting';
  const isDay = phase?.startsWith('DAY');
  const cycleLabel = isDay ? `Day ${cycle}` : `Night ${cycle}`;

  const fraction =
    phaseDurationSeconds > 0 ? timeRemaining / phaseDurationSeconds : 1;
  const percent = Math.max(0, Math.min(100, fraction * 100));

  let barColor = '#4caf50'; // green
  if (fraction < 0.15) barColor = '#f44336'; // red
  else if (fraction < 0.5) barColor = '#ff9800'; // yellow

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      style={{
        padding: '4px 8px',
        background: '#ece9d8',
        borderBottom: '1px solid #aca899',
        fontFamily: 'Tahoma, sans-serif',
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 3,
        }}
      >
        <span style={{ fontWeight: 'bold' }}>
          {cycleLabel} — {label}
        </span>
        <span style={{ color: fraction < 0.15 ? '#f44336' : '#555' }}>
          {timeDisplay}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: '#d4d0c8',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: barColor,
            transition: 'width 0.3s linear, background-color 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}
