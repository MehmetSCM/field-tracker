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
import { PavingEntryScreen } from './screens/Paving/PavingEntryScreen'
import { TrackerScreen } from './screens/Tracker/TrackerScreen'

// MillingHomeScreen/MillingDayDetailScreen/ReviewReadingsScreen are shared
// by both activities (see their own doc comments) — mounted twice below,
// once per activity, rather than duplicated under Paving-prefixed names.
// Only the two entry-flow screens (MillingEntryScreen/PavingEntryScreen)
// are genuinely activity-specific components, since the actual field-entry
// form differs meaningfully between the two.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/milling" element={<MillingHomeScreen activity="milling" />} />
          <Route
            path="/milling/new"
            element={
              <ErrorBoundary>
                <MillingEntryScreen />
              </ErrorBoundary>
            }
          />
          <Route path="/milling/day/:date" element={<MillingDayDetailScreen activity="milling" />} />
          <Route path="/milling/day/:date/segment/:roadSegmentId" element={<ReviewReadingsScreen activity="milling" />} />
          <Route path="/paving" element={<MillingHomeScreen activity="paving" />} />
          <Route
            path="/paving/new"
            element={
              <ErrorBoundary>
                <PavingEntryScreen />
              </ErrorBoundary>
            }
          />
          <Route path="/paving/day/:date" element={<MillingDayDetailScreen activity="paving" />} />
          <Route path="/paving/day/:date/segment/:roadSegmentId" element={<ReviewReadingsScreen activity="paving" />} />
          <Route path="/tracker" element={<TrackerScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
