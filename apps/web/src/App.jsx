import { useState } from 'react'
import Lobby from './Lobby'
import OS from './os/OS'

function App() {
  const [gameInfo, setGameInfo] = useState(null)

  if (!gameInfo) {
    return <Lobby onStart={(info) => setGameInfo(info)} />
  }

  return <OS gameInfo={gameInfo} myRole={gameInfo.role} />
}

export default App
