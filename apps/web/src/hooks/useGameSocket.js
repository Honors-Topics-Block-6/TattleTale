import { useEffect, useRef } from 'react';
import useGameStore from '../stores/gameStore';

export default function useGameSocket(socket) {
  const syncSessionState = useGameStore((s) => s.syncSessionState);
  const setLobbyView = useGameStore((s) => s.setLobbyView);
  const addMessage = useGameStore((s) => s.addMessage);
  const incrementUnread = useGameStore((s) => s.incrementUnread);
  const setElimination = useGameStore((s) => s.setElimination);
  const prepareForReconnect = useGameStore((s) => s.prepareForReconnect);

  // Use a ref so the handler always reads the latest store state
  // without re-registering listeners on every render
  const storeRef = useRef(useGameStore);

  useEffect(() => {
    if (!socket) return;

    const handleSessionState = (payload) => {
      syncSessionState(payload);
    };

    const handleLobbyState = (payload) => {
      setLobbyView(payload);
    };

    const handleChannelMessage = (payload) => {
      const { channelId, message } = payload;
      addMessage(channelId, message);

      // Check if this channel's window is focused — for now, always
      // increment unread. The UI components will call markRead when focused.
      const state = storeRef.current.getState();
      if (channelId !== findGlobalChannelId(state.channels)) {
        incrementUnread(channelId);
      }
    };

    const handlePlayerEliminated = (payload) => {
      const state = storeRef.current.getState();
      // Only trigger the BSOD overlay for OUR OWN elimination — otherwise
      // every other player's death would re-fire the overlay on an already-dead
      // spectator and hide the chat UI.
      if (payload.playerId !== state.selfId) return;
      if (
        state.eliminationCycle === null ||
        payload.cycle > state.eliminationCycle
      ) {
        setElimination(payload.cause, payload.cycle);
      }
    };

    const handleReconnect = () => {
      prepareForReconnect();
    };

    socket.on('sessionState', handleSessionState);
    socket.on('lobbyState', handleLobbyState);
    socket.on('channelMessage', handleChannelMessage);
    socket.on('playerEliminated', handlePlayerEliminated);
    const unsubState = socket.onStateChange((newState) => {
      if (newState === 'reconnecting') {
        handleReconnect();
      }
    });

    return () => {
      socket.off('sessionState', handleSessionState);
      socket.off('lobbyState', handleLobbyState);
      socket.off('channelMessage', handleChannelMessage);
      socket.off('playerEliminated', handlePlayerEliminated);
      unsubState();
    };
  }, [
    socket,
    syncSessionState,
    setLobbyView,
    addMessage,
    incrementUnread,
    setElimination,
    prepareForReconnect,
  ]);
}

function findGlobalChannelId(channels) {
  for (const [id, ch] of Object.entries(channels)) {
    if (ch.type === 'GLOBAL') return id;
  }
  return null;
}
