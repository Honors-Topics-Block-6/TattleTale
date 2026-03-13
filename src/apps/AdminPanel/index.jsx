import { useMemo, useState } from 'react';
import './adminPanel.css';

const CHAT_SERVER_URL = import.meta.env.VITE_CHAT_SERVER_URL || 'http://localhost:4000';

function AdminPanelComponent() {
  const [password, setPassword] = useState('');
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const loadSessions = async () => {
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch(`${CHAT_SERVER_URL}/admin/sessions`, {
        headers: { 'x-admin-password': password },
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || 'Failed to load sessions.');
      }

      setSessions(body.sessions || []);
      if (!selectedSessionId && body.sessions?.length) {
        setSelectedSessionId(body.sessions[0].id);
      }
      setStatus(`Loaded ${body.sessions?.length || 0} session(s).`);
    } catch (error) {
      setStatus(error.message || 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (sessionId, playerId, playerName) => {
    const confirmed = window.confirm(`Delete user "${playerName}" from session "${sessionId}"?`);
    if (!confirmed) return;

    setLoading(true);
    setStatus('');
    try {
      const response = await fetch(`${CHAT_SERVER_URL}/admin/sessions/${sessionId}/users/${playerId}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || 'Failed to delete user.');
      }

      setStatus(`Deleted ${playerName}.`);
      await loadSessions();
    } catch (error) {
      setStatus(error.message || 'Failed to delete user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminpanel-root">
      <div className="adminpanel-toolbar">
        <input
          type="password"
          className="adminpanel-input"
          placeholder="Admin password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="button" className="adminpanel-button" onClick={loadSessions} disabled={!password || loading}>
          {loading ? 'Loading...' : 'Load Users'}
        </button>
      </div>

      <div className="adminpanel-toolbar">
        <select
          className="adminpanel-input"
          value={selectedSessionId}
          onChange={(event) => setSelectedSessionId(event.target.value)}
          disabled={!sessions.length}
        >
          {!sessions.length && <option value="">No sessions</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.id} ({session.users.length} users)
            </option>
          ))}
        </select>
      </div>

      <div className="adminpanel-list">
        {(selectedSession?.users || []).map((user) => (
          <div key={user.id} className="adminpanel-user-row">
            <div>
              <strong>{user.name}</strong> {!user.online && '(offline)'}
              <div className="adminpanel-meta">IP: {user.ipAddress}</div>
            </div>
            <button
              type="button"
              className="adminpanel-button danger"
              onClick={() => deleteUser(selectedSession.id, user.id, user.name)}
              disabled={loading}
            >
              Delete User
            </button>
          </div>
        ))}
      </div>

      {status && <div className="adminpanel-status">{status}</div>}
    </div>
  );
}

const adminIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="3" width="24" height="26" rx="2" fill="#f2f2f2" stroke="#777" stroke-width="1"/>
    <rect x="7" y="6" width="18" height="4" fill="#2d6cdf"/>
    <circle cx="11" cy="18" r="3" fill="#777"/>
    <rect x="16" y="16" width="9" height="2" fill="#777"/>
    <rect x="16" y="20" width="7" height="2" fill="#777"/>
  </svg>
`);

const AdminPanel = {
  id: 'admin-panel',
  name: 'Admin Panel',
  icon: adminIcon,
  component: AdminPanelComponent,
  defaultWindow: {
    width: 700,
    height: 480,
    resizable: true,
    minWidth: 520,
    minHeight: 360,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Manage chat users',
  },
};

export default AdminPanel;
