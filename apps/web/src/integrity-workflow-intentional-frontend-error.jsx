// Intentionally bad React component for frontend integrity testing.
// Import this somewhere (e.g. in App.jsx) to break the build.

import { useEffect, useState } from 'react'

export function IntegrityWorkflowIntentionalFrontendError() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // @ts-ignore - call a non-existent function to trigger tooling
    window.thisFunctionDoesNotExist()
  }, [])

  // Purposely reference an undefined variable
  const broken = totallyUndefinedVariable + count

  return (
    <div>
      <h1>Integrity Workflow Frontend Error</h1>
      <p>Broken value: {broken}</p>
    </div>
  )
}

