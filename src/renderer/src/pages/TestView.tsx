import { ComparisonView } from '../components/test/ComparisonView'
import { MonitoringView } from '../components/test/MonitoringView'
import { SetupWizard } from '../components/test/SetupWizard'
import { useTestStore } from '../store/test-store'

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
