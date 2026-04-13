import { useState, useRef } from 'react';
import Lobby from './Lobby';
import OS from './os/OS';
import useGameStore from './stores/gameStore';
import useGameSocket from './hooks/useGameSocket';
import usePhaseTimer from './hooks/usePhaseTimer';
import { GameSocket } from './lib/game-socket';
import { SocketContext } from './lib/SocketContext';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8787';

function App() {
  const [inGame, setInGame] = useState(false);
  const socketRef = useRef(null);
  const resetGame = useGameStore((s) => s.resetGame);
  const setSelfId = useGameStore((s) => s.setSelfId);

  // Initialize socket once
  if (!socketRef.current) {
    socketRef.current = new GameSocket();
    socketRef.current.connect(SOCKET_URL);
  }

  // Wire socket events to game store
  useGameSocket(socketRef.current);

  // Run the phase timer
  usePhaseTimer();

  const handleGameStart = (playerSessionView) => {
    setSelfId(socketRef.current.credentials?.playerId || '');
    useGameStore.getState().syncSessionState(playerSessionView);
    setInGame(true);
  };

  const handleReturnToLobby = () => {
    resetGame();
    setInGame(false);
  };

  if (!inGame) {
    return <Lobby socket={socketRef.current} onGameStart={handleGameStart} />;
  }

  return (
    <SocketContext.Provider value={socketRef.current}>
      <OS onReturnToLobby={handleReturnToLobby} />
    </SocketContext.Provider>
  );
}

export default App;
