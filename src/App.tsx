import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './shell/AppShell'
import { DashboardScreen } from './screens/Dashboard/DashboardScreen'
import { HistoryScreen } from './screens/History/HistoryScreen'
import { HomeScreen } from './screens/Home/HomeScreen'
import { MillingEntryScreen } from './screens/MillingEntry/MillingEntryScreen'
import { MillingDayDetailScreen } from './screens/MillingHome/MillingDayDetailScreen'
import { MillingHomeScreen } from './screens/MillingHome/MillingHomeScreen'
import { ReviewReadingsScreen } from './screens/MillingHome/ReviewReadingsScreen'
import { PavingScreen } from './screens/Paving/PavingScreen'
import { TrackerScreen } from './screens/Tracker/TrackerScreen'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/milling" element={<MillingHomeScreen />} />
          <Route
            path="/milling/new"
            element={
              <ErrorBoundary>
                <MillingEntryScreen />
              </ErrorBoundary>
            }
          />
          <Route path="/milling/day/:date" element={<MillingDayDetailScreen />} />
          <Route path="/milling/day/:date/segment/:roadSegmentId" element={<ReviewReadingsScreen />} />
          <Route path="/paving" element={<PavingScreen />} />
          <Route path="/tracker" element={<TrackerScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
