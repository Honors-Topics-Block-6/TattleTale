
/** @param {import('socket.io-client').Socket} sock */
function runChatSocketCleanup(sock) {
  const unload = sock.__ttChatUnload;
  if (typeof unload === 'function') {
    unload();
    sock.__ttChatUnload = undefined;
  }
}
// Default matches `apps/server` env default (`PORT` defaults to 3001).
const CHAT_SERVER_URL = import.meta.env.VITE_CHAT_SERVER_URL || 'http://localhost:3001';
const DEFAULT_SESSION_ID = 'tattletale-room-1';
const STORAGE_KEY = 'tattletale-chat-identity';
const DEFAULT_CHANNELS = [{ id: 'global', label: 'global' }];
  const [phase, setPhase] = useState('DAY_OPEN');
  const [sessionSelf, setSessionSelf] = useState(null);
  const [channels, setChannels] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState('LOBBY');
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const resetChatState = () => {
    setChannels([]);
  const appendMessage = (message) => {
    if (!message?.channelId) return;
    setMessagesByChannel((prev) => {
      const list = prev[message.channelId] || [];
      return {
        ...prev,
        [message.channelId]: [...list, message].slice(-200),
      };
    });
  };

  const toUiUsers = (incomingUsers = []) =>
    incomingUsers.map((user, index) => ({
      id: user.playerId || user.id || `user-${index}`,
      name: user.displayName || user.name || 'Unknown',
      online: user.connected ?? user.online ?? false,
    }));

  const storeIdentity = (nextIdentity) => {
    identityRef.current = nextIdentity;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...nextIdentity,
      sessionId,
    }));
  };

  const resetStateForNewJoin = () => {
    setChannels(DEFAULT_CHANNELS);
      setConnecting(false);
      const nextPhase = lobbyView?.status;
      setPhase(nextPhase === 'WAITING' ? 'LOBBY' : (nextPhase || 'LOBBY'));
      const parsed = (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
          return {};
        }
      })();
      if (parsed?.username) setUsername(parsed.username);

      setChannels([]);
      setUsers([]);
      setChannels(DEFAULT_CHANNELS);
      setUsers(toUiUsers(lobbyView?.players || []));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(SOCKET_EVENTS.server.lobbyState, onLobbyState);
    socket.on(SOCKET_EVENTS.server.sessionState, onSessionState);
    // Legacy chat server compatibility: when available, consume live message events.
    socket.on('chat.message', (message) => {
      appendMessage(message);
    });

    socket.on('user.presence', (presencePayload) => {
      setUsers(toUiUsers(presencePayload?.users || []));
    });

    socket.on('connect_error', (connectError) => {
      setConnecting(false);
      setConnected(false);
      const baseMessage =
        connectError?.message || 'Socket.IO connection failed.';
      setError(
        `${baseMessage} Could not connect to ${CHAT_SERVER_URL}. ` +
          `Is the chat server running on that port? ` +
          `If not, set VITE_CHAT_SERVER_URL.`
      );
    });