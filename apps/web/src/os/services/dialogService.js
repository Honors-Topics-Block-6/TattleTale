import useWindowStore from '../store/windowStore';
import useDialogStore from '../store/dialogStore';
import SystemDialog from '../../apps/SystemDialog';

export const dialogIcons = {
  info: SystemDialog.icon,
  success:
    'data:image/svg+xml,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13" fill="#3c9a41" stroke="#0a246a" stroke-width="2"/>
        <path d="M10 16.5 L14.2 20.5 L22.5 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `),
  error:
    'data:image/svg+xml,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13" fill="#c84129" stroke="#0a246a" stroke-width="2"/>
        <path d="M11 11 L21 21 M21 11 L11 21" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
};

export function openMessageBox({
  title = 'Message',
  message,
  tone = 'info', // info | success | error
  icon,
  buttons,
}) {
  const { createWindow, updateWindow } = useWindowStore.getState();
  const winId = createWindow(SystemDialog.id, SystemDialog);

  const iconSrc = icon || dialogIcons[tone] || dialogIcons.info;
  updateWindow(winId, { title, icon: iconSrc, resizable: false });

  useDialogStore.getState().setDialog(winId, {
    message,
    tone,
    icon: iconSrc,
    buttons,
  });

  return winId;
}

export function openProgressBox({
  title = 'Installing',
  message = 'Installing...',
  durationMs = 1200,
  tone = 'info',
  icon,
  onDone,
}) {
  const { createWindow, updateWindow } = useWindowStore.getState();
  const winId = createWindow(SystemDialog.id, SystemDialog);

  const iconSrc = icon || dialogIcons.info;
  updateWindow(winId, { title, icon: iconSrc, resizable: false });

  useDialogStore.getState().setDialog(winId, {
    message,
    tone,
    icon: iconSrc,
    variant: 'progress',
    durationMs,
    onDone,
  });

  return winId;
}

