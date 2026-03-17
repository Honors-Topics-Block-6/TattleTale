import OS from './os/OS'
import { IntegrityWorkflowIntentionalFrontendError } from './integrity-workflow-intentional-frontend-error.jsx'

function App() {
  return (
    <>
      {/* INTENTIONAL: this component breaks the frontend for integrity testing */}
      <IntegrityWorkflowIntentionalFrontendError />
      <OS />
    </>
  )
}

export default App
