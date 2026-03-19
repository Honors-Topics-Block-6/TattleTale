import { openMessageBox, openProgressBox } from '../../os/services/dialogService';
import { sfxClick } from '../../os/utils/sfx';

export const SNAKE_CHALLENGE_CONFIG = {
  targetFood: 7,
  cols: 12,
  rows: 12,
  tickMs: 90,
  timeLimitMs: 25_000,
};

export function showSnakePurchaseFailed() {
  openMessageBox({
    title: 'Game Store',
    message: 'Purchase Failed. Try Again.',
    tone: 'error',
  });
}

export function runSnakePurchaseFlow({ windowId, closeWindow, installLocal, installViaServer }) {
  closeWindow(windowId);
  openMessageBox({
    title: 'Confirm Purchase',
    message: 'Confirm you would like to purchase Snake?',
    tone: 'info',
    buttons: [
      {
        id: 'yes',
        label: 'Yes',
        onClick: () => {
          sfxClick();
          openProgressBox({
            title: 'Game Store',
            message: 'Installing Snake...',
            durationMs: 1400,
            onDone: async () => {
              installLocal('snake');
              try {
                await installViaServer('snake');
              } catch {
                // Best-effort server sync.
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
}

