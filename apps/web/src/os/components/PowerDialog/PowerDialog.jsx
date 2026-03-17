import useMenuStore from '../../store/menuStore';
import useWindowStore from '../../store/windowStore';

const iconStyle = {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  marginBottom: '4px',
  cursor: 'pointer',
  border: '2px solid transparent',
  transition: 'border-color 0.1s',
};

function PowerButton({ label, emoji, color, onClick }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => e.currentTarget.querySelector('.pb-circle').style.borderColor = '#fff'}
      onMouseLeave={(e) => e.currentTarget.querySelector('.pb-circle').style.borderColor = 'transparent'}
    >
      <div
        className="pb-circle"
        style={{ ...iconStyle, background: color }}
      >
        {emoji}
      </div>
      <span style={{ fontSize: '11px', color: '#fff', textShadow: '1px 1px 1px #000', userSelect: 'none' }}>
        {label}
      </span>
    </div>
  );
}

export default function PowerDialog() {
  const powerDialog = useMenuStore((s) => s.powerDialog);
  const closePowerDialog = useMenuStore((s) => s.closePowerDialog);
  const setOsScreen = useMenuStore((s) => s.setOsScreen);
  const closeAllWindows = useWindowStore((s) => s.closeAllWindows);

  if (!powerDialog) return null;

  const handleShutdown = (type) => {
    closePowerDialog();
    setOsScreen(type);
    if (type === 'restarting') {
      setTimeout(() => window.location.reload(), 2500);
    }
  };

  const handleLogoff = () => {
    closePowerDialog();
    closeAllWindows();
    setOsScreen('logoff');
    setTimeout(() => setOsScreen('welcome'), 2000);
  };

  const handleStandby = () => {
    closePowerDialog();
    setOsScreen('standby');
  };

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  };

  const dialogStyle = {
    background: 'linear-gradient(180deg, #1a3a6b 0%, #0a1f4a 100%)',
    border: '3px solid #3a6abf',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
    overflow: 'hidden',
    minWidth: '340px',
  };

  const headerStyle = {
    background: 'linear-gradient(180deg, #2a5abf 0%, #1a3a8f 100%)',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid #3a6abf',
  };

  if (powerDialog === 'shutdown') {
    return (
      <div style={overlayStyle} onMouseDown={closePowerDialog}>
        <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
          <div style={headerStyle}>
            <span style={{ fontSize: '20px' }}>💻</span>
            <span style={{ color: '#fff', fontFamily: 'Tahoma, sans-serif', fontSize: '13px', fontWeight: 'bold' }}>
              Turn Off Computer
            </span>
          </div>
          <div style={{ padding: '24px 32px', display: 'flex', gap: '32px', justifyContent: 'center' }}>
            <PowerButton
              label="Stand By"
              emoji="🌙"
              color="linear-gradient(180deg, #4a7abf 0%, #2a5a9f 100%)"
              onClick={handleStandby}
            />
            <PowerButton
              label="Turn Off"
              emoji="⏻"
              color="linear-gradient(180deg, #bf4a4a 0%, #9f2a2a 100%)"
              onClick={() => handleShutdown('shuttingdown')}
            />
            <PowerButton
              label="Restart"
              emoji="🔄"
              color="linear-gradient(180deg, #4abf4a 0%, #2a9f2a 100%)"
              onClick={() => handleShutdown('restarting')}
            />
          </div>
          <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={closePowerDialog}
              style={{
                padding: '3px 14px',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: '11px',
                background: 'linear-gradient(180deg, #e0e0e0 0%, #c0c0c0 100%)',
                border: '1px solid #888',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (powerDialog === 'logoff') {
    return (
      <div style={overlayStyle} onMouseDown={closePowerDialog}>
        <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
          <div style={headerStyle}>
            <span style={{ fontSize: '20px' }}>👤</span>
            <span style={{ color: '#fff', fontFamily: 'Tahoma, sans-serif', fontSize: '13px', fontWeight: 'bold' }}>
              Log Off Windows
            </span>
          </div>
          <div style={{ padding: '16px 24px', color: '#cce', fontFamily: 'Tahoma, sans-serif', fontSize: '11px', lineHeight: 1.5 }}>
            Select an option, or select Cancel to continue using Windows.
          </div>
          <div style={{ padding: '4px 32px 20px', display: 'flex', gap: '32px', justifyContent: 'center' }}>
            <PowerButton
              label="Switch User"
              emoji="👥"
              color="linear-gradient(180deg, #4a7abf 0%, #2a5a9f 100%)"
              onClick={handleLogoff}
            />
            <PowerButton
              label="Log Off"
              emoji="🚪"
              color="linear-gradient(180deg, #bf7a4a 0%, #9f5a2a 100%)"
              onClick={handleLogoff}
            />
          </div>
          <div style={{ padding: '8px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={closePowerDialog}
              style={{
                padding: '3px 14px',
                fontFamily: 'Tahoma, sans-serif',
                fontSize: '11px',
                background: 'linear-gradient(180deg, #e0e0e0 0%, #c0c0c0 100%)',
                border: '1px solid #888',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
