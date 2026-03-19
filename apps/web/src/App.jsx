import { useState } from 'react'
import Lobby from './Lobby'
import OS from './os/OS'

function App() {
  const [started, setStarted] = useState(false)

  if (!started) {
    return <Lobby onStart={() => setStarted(true)} />
  }

  return <OS onLeave={() => setStarted(false)} />
}

export default App
