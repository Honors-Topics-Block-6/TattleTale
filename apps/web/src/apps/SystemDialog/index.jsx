import { useEffect, useMemo, useState } from 'react';
import useWindowStore from '../../os/store/windowStore';
import useDialogStore from '../../os/store/dialogStore';
import { sfxClick, sfxError, sfxSuccess } from '../../os/utils/sfx';

function SystemDialogComponent({ windowId }) {
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const dialog = useDialogStore((state) => state.dialogs[windowId]);

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!dialog?.tone) return;
    if (dialog.tone === 'error') sfxError();
    if (dialog.tone === 'success') sfxSuccess();
  }, [dialog?.tone]);

  useEffect(() => {
    if (!dialog || dialog.variant !== 'progress' || !dialog.durationMs) return;
    const start = performance.now();
    let raf = 0;

    const tick = (t) => {
      const p = Math.max(0, Math.min(1, (t - start) / dialog.durationMs));
      setProgress(p);
      if (p >= 1) {
        closeWindow(windowId);
        dialog.onDone?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dialog, windowId, closeWindow]);

  const iconSrc = useMemo(() => {
    return dialog?.icon || defaultInfoIcon;
  }, [dialog?.icon]);

  const buttons = dialog?.variant === 'progress'
    ? []
    : (dialog?.buttons?.length ? dialog.buttons : [{ id: 'ok', label: 'OK' }]);

  const handleButton = (btn) => {
    sfxClick();
    closeWindow(windowId);
    btn.onClick?.();
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#ece9d8',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', gap: 12, padding: 12, flex: 1 }}>
        <img
          src={iconSrc}
          alt=""
          style={{ width: 32, height: 32, flexShrink: 0, imageRendering: 'pixelated' }}
        />

        <div style={{ fontSize: 11, color: '#000', lineHeight: 1.35 }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {dialog?.message ?? ''}
          </div>

          {dialog?.variant === 'progress' && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  height: 14,
                  border: '1px solid #aca899',
                  background: '#fff',
                  boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #716f64',
                  padding: 1,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(progress * 100)}%`,
                    background: 'linear-gradient(180deg, #4ca6ff 0%, #0058e6 100%)',
                  }}
                />
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#333' }}>
                {Math.round(progress * 100)}%
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '0 12px 12px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => handleButton(btn)}
            style={{
              minWidth: 80,
              padding: '3px 12px',
              border: '1px solid #7f9db9',
              background: 'linear-gradient(to bottom, #ffffff, #d9e4f6)',
              cursor: 'pointer',
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 11,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const defaultInfoIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="13" fill="#4ca6ff" stroke="#0a246a" stroke-width="2"/>
    <rect x="14.7" y="13" width="2.6" height="11" fill="#fff"/>
    <circle cx="16" cy="9" r="1.8" fill="#fff"/>
  </svg>
`);

const SystemDialog = {
  id: 'system-dialog',
  name: 'Message',
  icon: defaultInfoIcon,
  component: SystemDialogComponent,
  defaultWindow: {
    width: 360,
    height: 190,
    resizable: false,
    minWidth: 300,
    minHeight: 170,
  },
  desktopIcon: { show: false },
  startMenu: { show: false, section: 'programs' },
};

export default SystemDialog;

