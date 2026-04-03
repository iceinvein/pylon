import { useTestStore } from '../store/test-store'
import { ComparisonView } from '../components/test/ComparisonView'
import { MonitoringView } from '../components/test/MonitoringView'
import { SetupWizard } from '../components/test/SetupWizard'

export function TestView() {
  const viewMode = useTestStore((s) => s.viewMode)

  switch (viewMode) {
    case 'setup':
      return <SetupWizard />
    case 'monitoring':
      return <MonitoringView />
    case 'comparison':
      return <ComparisonView />
  }
}
