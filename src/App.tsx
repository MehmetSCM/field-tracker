import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { AppShell } from './shell/AppShell'
import { DashboardScreen } from './screens/Dashboard/DashboardScreen'
import { HistoryScreen } from './screens/History/HistoryScreen'
import { MillingEntryScreen } from './screens/MillingEntry/MillingEntryScreen'
import { PavingScreen } from './screens/Paving/PavingScreen'
import { TrackerScreen } from './screens/Tracker/TrackerScreen'

function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/milling" element={<MillingEntryScreen />} />
            <Route path="/paving" element={<PavingScreen />} />
            <Route path="/tracker" element={<TrackerScreen />} />
            <Route path="/history" element={<HistoryScreen />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
