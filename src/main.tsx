import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Lock } from 'lucide-react'
import './index.css'
import Layout from './ui/Layout'
import { AppProvider } from './ui/AppContext'
import { Card, EmptyState } from './ui/kit'
import { actions } from './state/store'
import { useIdentityState } from './state/sliceHooks'
import { can, ROLE_LABELS, type Resource } from './domain/identity/access'
import Dashboard from './pages/Dashboard'
import MenuPage from './pages/MenuPage'
import DishPage from './pages/DishPage'
import InventoryPage from './pages/InventoryPage'
import SalesPage from './pages/SalesPage'
import WorkforcePage from './pages/WorkforcePage'
import MySchedule from './pages/MySchedule'
import FinancePage from './pages/FinancePage'
import InsightsPage from './pages/InsightsPage'
import ActivityPage from './pages/ActivityPage'
import SettingsPage from './pages/SettingsPage'

/** Route guard: denied attempts are logged in the access log (privacy, quality attribute #3). */
function Guard({ resource, children }: { resource: Resource; children: ReactNode }) {
  const role = useIdentityState().session.role
  const allowed = can(role, resource)
  useEffect(() => {
    if (!allowed) actions.logAccess(resource, false)
  }, [allowed, resource])
  if (allowed) return <>{children}</>
  return (
    <Card>
      <EmptyState icon={<Lock size={20} />} title="You don't have access to this page">
        Signed in as {ROLE_LABELS[role]}. This attempt was recorded in the access log.
      </EmptyState>
    </Card>
  )
}

function Home() {
  const role = useIdentityState().session.role
  if (role === 'employee') return <Navigate to="/my-schedule" replace />
  if (role === 'accountant') return <Navigate to="/finance" replace />
  return <Dashboard />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="menu" element={<Guard resource="menu"><MenuPage /></Guard>} />
            <Route path="menu/:id" element={<Guard resource="menu"><DishPage /></Guard>} />
            <Route path="inventory" element={<Guard resource="inventory"><InventoryPage /></Guard>} />
            <Route path="sales" element={<Guard resource="sales"><SalesPage /></Guard>} />
            <Route path="workforce" element={<Guard resource="roster"><WorkforcePage /></Guard>} />
            <Route path="my-schedule" element={<Guard resource="myschedule"><MySchedule /></Guard>} />
            <Route path="finance" element={<Guard resource="finance"><FinancePage /></Guard>} />
            <Route path="insights" element={<Guard resource="insights"><InsightsPage /></Guard>} />
            <Route path="activity" element={<Guard resource="activity"><ActivityPage /></Guard>} />
            <Route path="settings" element={<Guard resource="settings"><SettingsPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AppProvider>
    </HashRouter>
  </StrictMode>,
)
