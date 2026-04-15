export default function NightSpectatorView() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #0b1120 0%, #1e1b4b 100%)',
        color: '#dbeafe',
        fontFamily: 'Tahoma, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>
        Night has fallen.
      </div>
      <div style={{ fontSize: 13, opacity: 0.8, maxWidth: 360 }}>
        The Hackers are choosing. Use the global channel to strategize,
        or wait until morning.
      </div>
    </div>
  );
}
