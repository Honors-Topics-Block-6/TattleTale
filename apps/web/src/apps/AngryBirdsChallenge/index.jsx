import { useRef } from 'react';
import useWindowStore from '../../os/store/windowStore';
import useInstallStore from '../../os/store/installStore';
import { openMessageBox, openProgressBox } from '../../os/services/dialogService';
import { AngryBirdsComponent } from '../AngryBirds';

function AngryBirdsChallengeComponent({ windowId }) {
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const installLocal = useInstallStore((state) => state.install);
  const installViaServer = useInstallStore((state) => state.installViaServer);
  const wonRef = useRef(false);

  const handleLevelComplete = (levelIdx) => {
    if (wonRef.current) return;
    wonRef.current = true;

    closeWindow(windowId);
    openMessageBox({
      title: 'Confirm Purchase',
      message: 'Confirm you would like to purchase Angry Birds?',
      tone: 'info',
      buttons: [
        {
          id: 'yes',
          label: 'Yes',
          onClick: () => {
            openProgressBox({
              title: 'Game Store',
              message: 'Installing Angry Birds...',
              durationMs: 1400,
              onDone: async () => {
                installLocal('angry-birds');

                try {
                  await installViaServer('angry-birds');
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

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '6px 10px',
        background: '#ece9d8',
        borderBottom: '1px solid #aca899',
        fontSize: 11,
        fontFamily: 'Tahoma, sans-serif',
      }}>
        <strong>Unlock Challenge:</strong> Complete Level 1 to unlock Angry Birds!
      </div>
      <div style={{ flex: 1 }}>
        <AngryBirdsComponent windowId={windowId} onLevelComplete={handleLevelComplete} />
      </div>
    </div>
  );
}

const challengeIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="17" r="12" fill="#E53935"/>
    <circle cx="16" cy="17" r="12" fill="none" stroke="#B71C1C" stroke-width="1.5"/>
    <circle cx="12" cy="14" r="3.5" fill="#fff"/>
    <circle cx="20" cy="14" r="3.5" fill="#fff"/>
    <circle cx="13" cy="14.5" r="2" fill="#222"/>
    <circle cx="21" cy="14.5" r="2" fill="#222"/>
    <text x="16" y="28" text-anchor="middle" font-size="6" font-family="Tahoma" fill="#fff" font-weight="bold">?</text>
  </svg>
`);

const AngryBirdsChallenge = {
  id: 'angry-birds-challenge',
  name: 'Angry Birds Challenge',
  icon: challengeIcon,
  component: AngryBirdsChallengeComponent,
  defaultWindow: {
    width: 750,
    height: 510,
    resizable: true,
    minWidth: 600,
    minHeight: 430,
  },
  desktopIcon: { show: false },
  startMenu: { show: false },
};

export default AngryBirdsChallenge;
