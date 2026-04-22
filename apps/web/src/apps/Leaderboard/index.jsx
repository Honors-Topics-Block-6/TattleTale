import LeaderboardPanel from '../../components/LeaderboardPanel';
import { getDeviceId } from '../../os/utils/deviceId';

function LeaderboardApp() {
  const accountId = getDeviceId();
  return (
    <div style={{ width: '100%', height: '100%', padding: 8, boxSizing: 'border-box' }}>
      <LeaderboardPanel accountId={accountId} pageSize={20} />
    </div>
  );
}

const leaderboardIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="3" y="4" width="26" height="24" rx="2" fill="#fff9c4" stroke="#8c7b00" stroke-width="1"/>
    <rect x="7" y="19" width="4" height="6" fill="#4caf50"/>
    <rect x="14" y="14" width="4" height="11" fill="#2196f3"/>
    <rect x="21" y="10" width="4" height="15" fill="#f44336"/>
  </svg>
`);

const Leaderboard = {
  id: 'global-leaderboard',
  name: 'Leaderboard',
  icon: leaderboardIcon,
  component: LeaderboardApp,
  defaultWindow: {
    width: 560,
    height: 500,
    resizable: true,
    minWidth: 420,
    minHeight: 360,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'View global points rankings',
  },
};

export default Leaderboard;
