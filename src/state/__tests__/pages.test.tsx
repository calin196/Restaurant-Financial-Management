import { beforeEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../../ui/AppContext'
import Dashboard from '../../pages/Dashboard'
import MenuPage from '../../pages/MenuPage'
import DishPage from '../../pages/DishPage'
import InventoryPage from '../../pages/InventoryPage'
import SalesPage from '../../pages/SalesPage'
import WorkforcePage from '../../pages/WorkforcePage'
import FinancePage from '../../pages/FinancePage'
import InsightsPage from '../../pages/InsightsPage'
import ActivityPage from '../../pages/ActivityPage'
import SettingsPage from '../../pages/SettingsPage'
import MySchedule from '../../pages/MySchedule'
import Layout from '../../ui/Layout'
import DishEditor from '../../ui/DishEditor'
import { actions } from '../store'

beforeEach(() => { actions.resetDemo() })

describe('split-state page rendering from seed', () => {
  it.each([
    ['/', Dashboard, 'Good morning'], ['/menu', MenuPage, 'Menu &amp; profitability'],
    ['/inventory', InventoryPage, 'Ingredients'], ['/sales', SalesPage, 'Sales'],
    ['/workforce', WorkforcePage, 'Staff &amp; roster'], ['/finance', FinancePage, 'Finance'],
    ['/insights', InsightsPage, 'Insights'], ['/activity', ActivityPage, 'Activity &amp; audit'],
    ['/settings', SettingsPage, 'Settings'],
  ] as const)('renders %s without missing state fields', (path, Page, text) => {
    const html = renderToString(<MemoryRouter initialEntries={[path]}><AppProvider><Page /></AppProvider></MemoryRouter>)
    expect(html).toContain(text)
  })

  it('renders dish details and the editor from published costing/recipe options', () => {
    const html = renderToString(<MemoryRouter initialEntries={['/menu/risotto']}><AppProvider>
      <Routes><Route path="/menu/:id" element={<DishPage />} /></Routes>
      <DishEditor onClose={() => {}} />
    </AppProvider></MemoryRouter>)
    expect(html).toContain('Seafood Risotto')
    expect(html).toContain('20.07')
  })

  it('renders navigation and an employee schedule with the filtered publication', () => {
    actions.switchRole('employee', 'e-marco')
    const html = renderToString(<MemoryRouter><AppProvider><Layout /><MySchedule /></AppProvider></MemoryRouter>)
    expect(html).toContain('Hi Marco')
    expect(html).toContain('Your published shifts')
  })
})
