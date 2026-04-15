import { useRef } from 'react';
import Lobby from './Lobby';
import OS from './os/OS';
import useGameStore from './stores/gameStore';
import useGameSocket from './hooks/useGameSocket';
import usePhaseTimer from './hooks/usePhaseTimer';
import { GameSocket } from './lib/game-socket';
import { SocketContext } from './lib/SocketContext';

function App() {
  const socketRef = useRef(null);
  const resetGame = useGameStore((s) => s.resetGame);
  const phase = useGameStore((s) => s.phase);

  // Lazy-init the socket. We do NOT call connect() here — Lobby targets the
  // socket at a lobby-specific wsUrl once the user creates or joins a game.
  if (!socketRef.current) {
    socketRef.current = new GameSocket();
  }

  // Wire socket events to game store
  useGameSocket(socketRef.current);

  // Run the phase timer
  usePhaseTimer();

  const handleReturnToLobby = () => {
    socketRef.current?.close();
    resetGame();
  };

  const inGame = phase !== null;

  return (
    <SocketContext.Provider value={socketRef.current}>
      {inGame ? (
        <OS onReturnToLobby={handleReturnToLobby} />
      ) : (
        <Lobby />
      )}
    </SocketContext.Provider>
  );
}

export default App;
