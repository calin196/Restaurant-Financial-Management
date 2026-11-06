import { afterCommit, makeSliceStore } from './sliceStore'
import { publishToHandlers } from './eventBus'
export { subscribeToEvent } from './eventBus'
import { buildSeed } from '../data/seed'
import { TODAY, fmtDate, fmtMonth, monthOf } from '../domain/shared/dates'
import { D, fmtEUR } from '../domain/shared/money'
import { POLICY_LABELS, currentVersion } from '../domain/menuCosting/costing'
import type {
  AllocationPolicy, AppState, BudgetCategory, ContextName, CostEntry, DomainEvent, Employee,
  FinanceState, IdentityState, Ingredient, InsightsState, InventoryState, MenuCostingState, MenuItem,
  MenuItemVersion, PriceRecord, Role, SaleRecord, SalesState, Settings, SharedState, Shift,
  WorkforceState,
} from '../domain/types'
import { buildSnapshot, isMonthLocked, pnlForMonth } from './selectors'
import { budgetStatus } from '../domain/finance/finance'
import type { Suggestion } from '../domain/insights/insights'

// ---------------------------------------------------------------------------
// Experiment 1 – Split State
// The old single key is replaced by 8 per-module keys so each bounded context
// has its own localStorage slot and its own React subscription set.
// ---------------------------------------------------------------------------

// ---------- Build initial slices from the seed ----------

function splitSeed(): {
  shared: SharedState; identity: IdentityState; inventory: InventoryState
  menu: MenuCostingState; sales: SalesState; workforce: WorkforceState
  finance: FinanceState; insights: InsightsState
} {
  const seed = buildSeed()
  // Build closed-period snapshots (mirrors the old withSnapshots)
  for (const p of seed.periods)
    if (p.status === 'closed' && !p.snapshot) p.snapshot = buildSnapshot(seed, p.month)
  return {
    shared:    { schemaVersion: seed.schemaVersion, settings: seed.settings, events: seed.events },
    identity:  { session: seed.session, accessLog: seed.accessLog },
    inventory: { suppliers: seed.suppliers, ingredients: seed.ingredients, prices: seed.prices },
    menu:      { menuItems: seed.menuItems },
    sales:     { sales: seed.sales },
    workforce: { roles: seed.roles, employees: seed.employees, shifts: seed.shifts, rosterWeeks: seed.rosterWeeks, labourBookings: seed.labourBookings },
    finance:   { costs: seed.costs, budgets: seed.budgets, periods: seed.periods },
    insights:  { decisions: seed.decisions },
  }
}

const seed = splitSeed()

// ---------- Per-module stores ----------
export const sharedStore    = makeSliceStore<SharedState>   ('truecost.v1.shared',    () => seed.shared)
export const identityStore  = makeSliceStore<IdentityState> ('truecost.v1.identity',  () => seed.identity)
export const inventoryStore = makeSliceStore<InventoryState>('truecost.v1.inventory', () => seed.inventory)
export const menuStore      = makeSliceStore<MenuCostingState>('truecost.v1.menu',    () => seed.menu)
export const salesStore     = makeSliceStore<SalesState>    ('truecost.v1.sales',     () => seed.sales)
export const workforceStore = makeSliceStore<WorkforceState>('truecost.v1.workforce', () => seed.workforce)
export const financeStore   = makeSliceStore<FinanceState>  ('truecost.v1.finance',   () => seed.finance)
export const insightsStore  = makeSliceStore<InsightsState> ('truecost.v1.insights',  () => seed.insights)

// ---------- Backward-compatible composed view ----------
// Kept for infrastructure/export compatibility. Presentation code must use
// owned slice hooks or published queries; the boundary test enforces this.

const compose = (): AppState => ({
  ...sharedStore.get(),
  ...identityStore.get(),
  ...inventoryStore.get(),
  ...menuStore.get(),
  ...salesStore.get(),
  ...workforceStore.get(),
  ...financeStore.get(),
  ...insightsStore.get(),
})

// React hook: subscribes to ALL slice listeners and returns the composed view.
// Pages migrated to per-module hooks get more granular re-renders.
export const useAppState = (): AppState => {
  sharedStore.useSlice()
  identityStore.useSlice()
  inventoryStore.useSlice()
  menuStore.useSlice()
  salesStore.useSlice()
  workforceStore.useSlice()
  financeStore.useSlice()
  insightsStore.useSlice()
  return compose()
}

export const getState = (): AppState => compose()

/** Explicit demo backup, not a state reader for presentation code. */
export const exportDemoJson = () => JSON.stringify(compose(), null, 2)

// ---------- Shared helpers ----------
export class DomainError extends Error {}

const now = () => `${TODAY}T${new Date().toTimeString().slice(0, 8)}`
let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const emit = (eventType: string, context: ContextName, summary: string) => {
  const event: DomainEvent = { id: newId('ev'), at: now(), type: eventType, context, summary }
  afterCommit(() => {
    sharedStore.update((d) => { d.events.unshift(event) })
    publishToHandlers(event)
  })
}

const assertOpen = (month: string) => {
  if (isMonthLocked(compose(), month))
    throw new DomainError(`${fmtMonth(month)} is closed. Closed periods cannot be changed.`)
}

const checkBudgets = (month: string) => {
  const d = compose()
  const pnl = pnlForMonth(d, month)
  for (const b of budgetStatus(d.budgets, pnl))
    if (b.exceeded && !d.events.some((e) => e.type === 'BudgetExceeded' && e.summary.startsWith(`${b.category} ${fmtMonth(month)}`)))
      emit('BudgetExceeded', 'Finance', `${b.category} ${fmtMonth(month)}: ${fmtEUR(b.actual)} of ${fmtEUR(b.budget)} budget`)
}

// ---------- Actions (split to owning stores) ----------
export const actions = {
  // ---------- Identity & Access ----------
  switchRole(role: Role, employeeId: string | null = null) {
    identityStore.update((d) => {
      d.session = { role, employeeId: role === 'employee' ? employeeId : null }
    })
  },
  logAccess(resource: string, allowed: boolean) {
    const role = identityStore.get().session.role
    identityStore.update((d) => {
      d.accessLog.unshift({ id: newId('acc'), at: now(), role, resource, allowed })
    })
    if (!allowed) emit('AccessDenied', 'Identity', `${role} was denied access to ${resource}`)
  },

  // ---------- Settings ----------
  setPolicy(policy: AllocationPolicy) {
    const cur = sharedStore.get().settings.allocationPolicy
    if (cur === policy) return
    sharedStore.update((d) => { d.settings.allocationPolicy = policy })
    emit('AllocationPolicyChanged', 'Menu Costing', `Overhead allocation set to "${POLICY_LABELS[policy].name}"`)
  },
  updateSettings(patch: Partial<Settings>) {
    sharedStore.update((d) => { d.settings = { ...d.settings, ...patch } })
  },
  toggleFlag(flag: keyof Settings['flags']) {
    sharedStore.update((d) => { d.settings.flags[flag] = !d.settings.flags[flag] })
  },
  resetDemo() {
    const s = splitSeed()
    sharedStore.reset(s.shared)
    identityStore.reset(s.identity)
    inventoryStore.reset(s.inventory)
    menuStore.reset(s.menu)
    salesStore.reset(s.sales)
    workforceStore.reset(s.workforce)
    financeStore.reset(s.finance)
    insightsStore.reset(s.insights)
  },

  // ---------- Inventory ----------
  recordPrice(ingredientId: string, date: string, price: string, note?: string) {
    const ing = inventoryStore.get().ingredients.find((i) => i.id === ingredientId)!
    const prev = [...inventoryStore.get().prices]
      .filter((p) => p.ingredientId === ingredientId)
      .sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    const rec: PriceRecord = { id: newId('pr'), ingredientId, date, price: D(price).toFixed(2), source: 'manual', note }
    inventoryStore.update((d) => { d.prices.push(rec) })
    emit('IngredientPriceChanged', 'Inventory',
      `${ing.name}: ${prev ? fmtEUR(D(prev.price)) + ' → ' : ''}${fmtEUR(D(price))} per ${ing.purchaseUnit} (${fmtDate(date)})`)
  },
  addIngredient(ing: Omit<Ingredient, 'id' | 'archived'>, price: string) {
    const id = newId('ing')
    inventoryStore.update((d) => {
      d.ingredients.push({ ...ing, id, archived: false })
      d.prices.push({ id: newId('pr'), ingredientId: id, date: TODAY, price: D(price).toFixed(2), source: 'manual' })
    })
    emit('IngredientAdded', 'Inventory', `${ing.name} added at ${fmtEUR(D(price))} per ${ing.purchaseUnit}`)
    return id
  },
  setStock(ingredientId: string, stock: number) {
    inventoryStore.update((d) => {
      const ing = d.ingredients.find((i) => i.id === ingredientId)!
      const wasLow = ing.stock <= ing.reorderLevel
      ing.stock = stock
      if (!wasLow && stock <= ing.reorderLevel)
        emit('StockBelowThreshold', 'Inventory', `${ing.name} below reorder level (${stock} ${ing.baseUnit})`)
    })
  },
  setArchivedIngredient(ingredientId: string, archived: boolean) {
    inventoryStore.update((d) => {
      const ing = d.ingredients.find((i) => i.id === ingredientId)!
      ing.archived = archived
      emit(archived ? 'IngredientArchived' : 'IngredientRestored', 'Inventory', ing.name)
    })
  },

  // ---------- Menu Costing ----------
  saveMenuItem(itemId: string | null, base: Pick<MenuItem, 'name' | 'category'>, version: Omit<MenuItemVersion, 'validFrom'>) {
    let id = itemId
    menuStore.update((d) => {
      const v: MenuItemVersion = { ...version, validFrom: TODAY }
      if (!itemId) {
        id = newId('dish')
        d.menuItems.push({ id, ...base, versions: [v], archived: false })
        emit('MenuItemAdded', 'Menu Costing', `${base.name} added at ${fmtEUR(D(v.grossPrice))}`)
      } else {
        const item = d.menuItems.find((i) => i.id === itemId)!
        const prev = currentVersion(item)
        item.name = base.name
        item.category = base.category
        // versions are append-only; a same-day edit replaces today's version
        if (prev.validFrom === TODAY && item.versions.length > 1) item.versions[item.versions.length - 1] = v
        else if (prev.validFrom === TODAY) item.versions[0] = v
        else item.versions.push(v)
        const changes: string[] = []
        if (prev.grossPrice !== v.grossPrice) changes.push(`price ${fmtEUR(D(prev.grossPrice))} → ${fmtEUR(D(v.grossPrice))}`)
        if (prev.prepMinutes !== v.prepMinutes) changes.push(`prep ${prev.prepMinutes} → ${v.prepMinutes} min`)
        if (JSON.stringify(prev.recipe) !== JSON.stringify(v.recipe)) changes.push('recipe updated')
        emit('MenuCatalogPublished', 'Menu Costing', `${base.name}: ${changes.join(', ') || 'details updated'}`)
      }
    })
    return id!
  },
  setArchivedMenuItem(itemId: string, archived: boolean) {
    menuStore.update((d) => {
      const item = d.menuItems.find((i) => i.id === itemId)!
      item.archived = archived
      emit(archived ? 'MenuItemArchived' : 'MenuItemRestored', 'Menu Costing', item.name)
    })
  },

  // ---------- Sales ----------
  recordDailySales(date: string, quantities: Record<string, number>) {
    assertOpen(monthOf(date))
    salesStore.update((d) => {
      d.sales = d.sales.filter((s) => !(s.date === date && s.source === 'manual'))
      let total = 0
      for (const [menuItemId, quantity] of Object.entries(quantities)) {
        if (!quantity) continue
        const item = menuStore.get().menuItems.find((i) => i.id === menuItemId)!
        const v = currentVersion(item)
        d.sales.push({
          id: newId('s'), date, menuItemId, quantity, grossUnitPrice: v.grossPrice,
          vatRate: v.vatCategory === 'alcohol' ? 21 : 9, source: 'manual',
        })
        total += quantity
      }
      emit('SaleRecorded', 'Sales', `${total} portions entered for ${fmtDate(date)}`)
    })
    checkBudgets(monthOf(date))
  },
  importSales(rows: { date: string; menuItemId: string; quantity: number }[]) {
    for (const r of rows) assertOpen(monthOf(r.date))
    salesStore.update((d) => {
      for (const r of rows) {
        const item = menuStore.get().menuItems.find((i) => i.id === r.menuItemId)!
        const v = currentVersion(item)
        const rec: SaleRecord = {
          id: newId('s'), date: r.date, menuItemId: r.menuItemId, quantity: r.quantity,
          grossUnitPrice: v.grossPrice, vatRate: v.vatCategory === 'alcohol' ? 21 : 9, source: 'csv',
        }
        d.sales.push(rec)
      }
    })
    emit('ItemsSold', 'Sales', `CSV import: ${rows.reduce((a, r) => a + r.quantity, 0)} portions on ${new Set(rows.map((r) => r.date)).size} day(s)`)
  },

  // ---------- Workforce ----------
  setRoleRate(roleId: string, rate: string) {
    workforceStore.update((d) => {
      const role = d.roles.find((r) => r.id === roleId)!
      const prev = role.ratePerHour
      role.ratePerHour = D(rate).toFixed(2)
      emit('LabourRateSet', 'Workforce', `${role.name}: ${fmtEUR(D(prev))} → ${fmtEUR(D(rate))} per hour (employer cost)`)
    })
  },
  addEmployee(e: Omit<Employee, 'id' | 'archived'>) {
    workforceStore.update((d) => {
      d.employees.push({ ...e, id: newId('e'), archived: false })
      emit('EmployeeAdded', 'Workforce', `New ${d.roles.find((r) => r.id === e.roleId)?.name.toLowerCase()} employee added`)
    })
  },
  saveShift(shift: Omit<Shift, 'id'> & { id?: string }) {
    workforceStore.update((d) => {
      if (shift.id) {
        const i = d.shifts.findIndex((s) => s.id === shift.id)
        d.shifts[i] = { ...d.shifts[i], ...shift } as Shift
      } else d.shifts.push({ ...shift, id: newId('sh') })
    })
  },
  removeShift(id: string) {
    workforceStore.update((d) => { d.shifts = d.shifts.filter((s) => s.id !== id) })
  },
  publishRoster(weekStart: string, acknowledged: string[]) {
    workforceStore.update((d) => {
      const w = d.rosterWeeks.find((x) => x.weekStart === weekStart)
      const rec = { weekStart, published: true, publishedAt: now(), acknowledgedWarnings: acknowledged }
      if (w) Object.assign(w, rec)
      else d.rosterWeeks.push(rec)
      emit('RosterPublished', 'Workforce',
        `Roster for week of ${fmtDate(weekStart, false)} published${acknowledged.length ? ` with ${acknowledged.length} acknowledged warning(s)` : ''}`)
    })
  },
  unpublishRoster(weekStart: string) {
    workforceStore.update((d) => {
      const w = d.rosterWeeks.find((x) => x.weekStart === weekStart)
      if (w) w.published = false
      emit('RosterReopened', 'Workforce', `Roster for week of ${fmtDate(weekStart, false)} reopened for changes`)
    })
  },

  // ---------- Finance ----------
  addCost(c: Omit<CostEntry, 'id' | 'archived' | 'createdAt'>) {
    assertOpen(c.fromMonth)
    financeStore.update((d) => {
      d.costs.push({ ...c, id: newId('c'), archived: false, createdAt: TODAY })
      emit(c.kind === 'general' ? 'GeneralCostRecorded' : 'ExternalCostRecorded', 'Finance', `${c.name}: ${fmtEUR(D(c.amount))}`)
    })
    checkBudgets(c.fromMonth)
  },
  setArchivedCost(id: string, archived: boolean) {
    financeStore.update((d) => {
      const c = d.costs.find((x) => x.id === id)!
      for (const p of d.periods)
        if (p.status === 'closed' && p.month >= c.fromMonth && p.month <= c.toMonth)
          throw new DomainError(`This cost covers ${fmtMonth(p.month)}, which is closed.`)
      c.archived = archived
      emit(archived ? 'CostArchived' : 'CostRestored', 'Finance', c.name)
    })
  },
  setBudget(category: BudgetCategory, monthly: string) {
    financeStore.update((d) => {
      const b = d.budgets.find((x) => x.category === category)!
      b.monthly = D(monthly).toFixed(2)
      emit('BudgetSet', 'Finance', `${category}: ${fmtEUR(D(monthly))} per month`)
    })
  },
  closePeriod(month: string) {
    const snapshot = buildSnapshot(compose(), month)
    financeStore.update((d) => {
      const p = d.periods.find((x) => x.month === month)
      if (p) Object.assign(p, { status: 'closed', closedAt: now(), snapshot })
      else d.periods.push({ month, status: 'closed', closedAt: now(), snapshot })
    })
    emit('OverheadPoolClosed', 'Finance', `${fmtMonth(month)} overhead pool: ${fmtEUR(D(snapshot.overhead))}`)
    emit('PeriodClosed', 'Finance', `${fmtMonth(month)} closed and locked. Profit ${fmtEUR(D(snapshot.profit))}`)
  },
  logExport(what: string) {
    emit('AccountantExportCreated', 'Finance', what)
  },

  // ---------- Insights ----------
  decide(s: Suggestion, decision: 'accepted' | 'rejected') {
    insightsStore.update((d) => {
      d.decisions.unshift({ id: newId('dec'), suggestionKey: s.key, title: s.title, decision, at: now(), confidence: s.confidence })
      emit(decision === 'accepted' ? 'SuggestionAccepted' : 'SuggestionRejected', 'Insights', s.title)
    })
    if (decision === 'accepted' && s.apply && s.itemId) {
      const item = menuStore.get().menuItems.find((i) => i.id === s.itemId)!
      const v = currentVersion(item)
      actions.saveMenuItem(item.id, item, {
        ...v,
        grossPrice: s.apply.grossPrice ?? v.grossPrice,
        prepMinutes: s.apply.prepMinutes ?? v.prepMinutes,
        note: `Accepted suggestion: ${s.title}`,
      })
    }
  },
}
