import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity, BarChart3, CalendarDays, ChefHat, ChevronDown, Landmark, LayoutDashboard, Menu, Package, Receipt,
  Settings as SettingsIcon, ShieldCheck, Sparkles, Wifi, WifiOff, X,
} from 'lucide-react'
import { actions } from '../state/store'
import { useIdentityState, useSharedState } from '../state/sliceHooks'
import { useEmployeeDirectory } from '../state/workforce'
import { can, ROLE_LABELS, type Resource } from '../domain/identity/access'
import { TODAY, fmtDate, fmtMonth } from '../domain/shared/dates'
import { useApp } from './AppContext'
import { cx } from './kit'
import type { Role } from '../domain/types'

interface NavItem { to: string; label: string; icon: ReactNode; resource: Resource; badge?: string }

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} />, resource: 'dashboard' }] },
  {
    group: 'Costing',
    items: [
      { to: '/menu', label: 'Menu & profitability', icon: <ChefHat size={17} />, resource: 'menu' },
      { to: '/inventory', label: 'Ingredients & stock', icon: <Package size={17} />, resource: 'inventory' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/sales', label: 'Sales', icon: <Receipt size={17} />, resource: 'sales' },
      { to: '/workforce', label: 'Staff & roster', icon: <CalendarDays size={17} />, resource: 'roster' },
      { to: '/my-schedule', label: 'My schedule', icon: <CalendarDays size={17} />, resource: 'myschedule' },
    ],
  },
  {
    group: 'Money',
    items: [
      { to: '/finance', label: 'Finance', icon: <Landmark size={17} />, resource: 'finance' },
      { to: '/insights', label: 'Insights', icon: <Sparkles size={17} />, resource: 'insights', badge: 'AI' },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/activity', label: 'Activity & audit', icon: <Activity size={17} />, resource: 'activity' },
      { to: '/settings', label: 'Settings', icon: <SettingsIcon size={17} />, resource: 'settings' },
    ],
  },
]

function RoleSwitcher() {
  const directory = useEmployeeDirectory()
  const state = useIdentityState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const { role, employeeId } = state.session
  const who = role === 'employee' ? directory.find((e) => e.id === employeeId)?.name : role === 'manager' ? 'Eva de Jong' : 'R. Kuipers'
  const initials = (who ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('')
  const pick = (r: Role, id: string | null = null) => {
    actions.switchRole(r, id)
    setOpen(false)
    window.location.hash = r === 'employee' ? '#/my-schedule' : r === 'accountant' ? '#/finance' : '#/'
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 rounded-lg border border-line bg-white py-1 pr-2.5 pl-1 text-left shadow-sm hover:bg-slate-50">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-[11px] font-semibold text-white">{initials}</span>
        <span className="hidden sm:block">
          <span className="block text-xs leading-tight font-medium text-ink">{who}</span>
          <span className="block text-[11px] leading-tight text-ink-2">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown size={14} className="text-ink-3" />
      </button>
      {open && (
        <div className="anim-pop absolute right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-white p-1.5 shadow-xl">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Switch role (prototype)</div>
          <RoleOption active={role === 'manager'} title="Eva de Jong" sub="Manager · full access" onClick={() => pick('manager')} />
          <RoleOption active={role === 'accountant'} title="R. Kuipers" sub="Accountant · read-only finance" onClick={() => pick('accountant')} />
          <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Employees · own schedule only</div>
          <div className="max-h-56 overflow-y-auto">
            {directory.map((e) => (
              <RoleOption key={e.id} active={role === 'employee' && employeeId === e.id} title={e.name} sub={e.roleName} onClick={() => pick('employee', e.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const RoleOption = ({ active, title, sub, onClick }: { active: boolean; title: string; sub: string; onClick: () => void }) => (
  <button onClick={onClick} className={cx('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-50', active && 'bg-brand-50')}>
    <span>
      <span className="block text-sm font-medium text-ink">{title}</span>
      <span className="block text-xs text-ink-2">{sub}</span>
    </span>
    {active && <span className="h-2 w-2 rounded-full bg-brand-600" />}
  </button>
)

function BasisPicker() {
  const { basisMonth, setBasisMonth, months } = useApp()
  return (
    <label className="hidden items-center gap-2 rounded-lg border border-line bg-white py-1 pr-1 pl-2.5 text-xs shadow-sm md:flex" title="Portions sold and the overhead pool of this month are used to allocate costs">
      <BarChart3 size={14} className="text-ink-3" />
      <span className="text-ink-2">Costing basis</span>
      <select value={basisMonth} onChange={(e) => setBasisMonth(e.target.value)} className="h-7 rounded-md bg-slate-50 px-2 text-xs font-medium text-ink outline-none">
        {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
      </select>
    </label>
  )
}

function PosStatus() {
  const s = useSharedState()
  const down = s.settings.posOutage
  return (
    <div
      className={cx('hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium lg:flex', down ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-ink-2')}
      title={down ? 'Costing keeps working from stored data (S7)' : 'Sales are entered manually or by CSV in phase 1'}
    >
      {down ? <WifiOff size={13} /> : <Wifi size={13} />}
      {down ? 'POS offline · using stored data' : s.settings.flags.posIntegration ? 'POS connected' : 'Manual / CSV sales'}
    </div>
  )
}

export default function Layout() {
  const state = { ...useIdentityState(), ...useSharedState() }
  const role = state.session.role
  const [mobileOpen, setMobileOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setMobileOpen(false), [loc.pathname])

  const sidebar = (
    <nav className="flex h-full flex-col bg-[#0b1f1e] text-slate-300">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white shadow-inner">
          <svg viewBox="0 0 32 32" className="h-5 w-5"><path d="M7 21l6-6 4 4 8-9" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <div className="text-[15px] leading-tight font-semibold text-white">TrueCost</div>
          <div className="text-[11px] leading-tight text-slate-400">{state.settings.restaurantName}</div>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(role, i.resource))
          if (!items.length) return null
          return (
            <div key={g.group}>
              <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">{g.group}</div>
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  className={({ isActive }) =>
                    cx('mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition', isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white')
                  }
                >
                  {i.icon}
                  <span className="flex-1">{i.label}</span>
                  {i.badge && state.settings.flags.aiSuggestions && <span className="rounded bg-brand-500/25 px-1.5 py-0.5 text-[10px] font-semibold text-brand-200">{i.badge}</span>}
                </NavLink>
              ))}
            </div>
          )
        })}
      </div>
      <div className="m-3 rounded-lg bg-white/5 p-3 text-[11px] leading-relaxed text-slate-400">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-200"><ShieldCheck size={13} /> Privacy by design</div>
        Wages stay in Workforce. Dish costs only use a labour rate per role.
      </div>
    </nav>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="anim-slide w-64">{sidebar}</div>
          <button className="flex-1 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="m-4 text-white" /></button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-1.5 text-ink-2 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="hidden text-xs text-ink-2 sm:block">Today · <span className="font-medium text-ink">{fmtDate(TODAY)}</span></div>
          <div className="flex-1" />
          {role === 'manager' && <PosStatus />}
          {role === 'manager' && <BasisPicker />}
          <RoleSwitcher />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
