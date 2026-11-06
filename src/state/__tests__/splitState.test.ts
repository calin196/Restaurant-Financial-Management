import { beforeEach, describe, expect, it, vi } from 'vitest'
import { afterCommit, makeSliceStore } from '../sliceStore'
import { buildSeed } from '../../data/seed'
import { TODAY } from '../../domain/shared/dates'

const storage = new Map<string, string>()
let store: typeof import('../store')
let published: typeof import('../published')
let workforce: typeof import('../workforce')

beforeEach(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  })
  storage.clear()
  vi.resetModules()
  store = await import('../store')
  published = await import('../published')
  workforce = await import('../workforce')
})

describe('independent state persistence', () => {
  it('updates and notifies only the owning slice and shared audit log', () => {
    const inventoryListener = vi.fn()
    const workforceListener = vi.fn()
    const oldWorkforce = store.workforceStore.get()
    const stopInventory = store.inventoryStore.subscribe(inventoryListener)
    const stopWorkforce = store.workforceStore.subscribe(workforceListener)
    store.actions.recordPrice('shrimp', TODAY, '26.00')
    expect(inventoryListener).toHaveBeenCalledOnce()
    expect(workforceListener).not.toHaveBeenCalled()
    expect(store.workforceStore.get()).toBe(oldWorkforce)
    expect([...storage.keys()].sort()).toEqual(['truecost.v1.inventory', 'truecost.v1.shared'])
    const reloaded = makeSliceStore(store.inventoryStore.key, () => ({ suppliers: [], ingredients: [], prices: [] }))
    expect(reloaded.get()).toEqual(store.inventoryStore.get())
    stopInventory(); stopWorkforce()
  })

  it('ignores the legacy key and malformed/unsupported slice envelopes', () => {
    storage.set('truecost.prototype.v1', JSON.stringify({ employees: ['legacy'] }))
    for (const raw of ['not JSON', JSON.stringify({ schemaVersion: 99, data: { sales: [] } }),
      JSON.stringify({ schemaVersion: 1 }), JSON.stringify({ schemaVersion: 1, data: {} })]) {
      storage.set('test.sales', raw)
      const slice = makeSliceStore('test.sales', () => ({ sales: ['seed'] }))
      expect(slice.get()).toEqual({ sales: ['seed'] })
    }
    expect(store.workforceStore.get().employees).toEqual(buildSeed().employees)
  })

  it('resets every slice and persisted envelope, preserving unrelated storage', () => {
    storage.set('unrelated', 'keep')
    store.actions.switchRole('accountant')
    store.actions.recordPrice('shrimp', TODAY, '30')
    store.actions.setRoleRate('kitchen', '35')
    store.actions.resetDemo()
    const slices = [store.identityStore, store.inventoryStore, store.menuStore, store.salesStore,
      store.workforceStore, store.financeStore, store.insightsStore, store.sharedStore]
    expect(slices.map((s) => s.key).sort()).toEqual([
      'finance', 'identity', 'insights', 'inventory', 'menu', 'sales', 'shared', 'workforce',
    ].map((s) => `truecost.v1.${s}`))
    for (const slice of slices) expect(JSON.parse(storage.get(slice.key)!).data).toEqual(slice.get())
    expect(store.getState().employees).toEqual(buildSeed().employees)
    expect(store.getState().prices).toEqual(buildSeed().prices)
    expect(store.getState().session.role).toBe('manager')
    expect(published.getPublishedCosting('2026-09').costing.find((c) => c.itemId === 'risotto')!.trueCost.toFixed(2)).toBe('20.07')
    expect(storage.get('unrelated')).toBe('keep')
  })

  it('keeps working in memory if localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') },
    })
    const slice = makeSliceStore('test.offline', () => ({ count: 0 }))
    slice.update((d) => { d.count++ })
    expect(slice.get()).toEqual({ count: 1 })
  })

  it('rolls back a failed mutation and discards its queued events', () => {
    const slice = makeSliceStore('test.rollback', () => ({ count: 0 }))
    const delivered = vi.fn()
    expect(() => slice.update((draft) => {
      draft.count++
      afterCommit(delivered)
      throw new Error('reject')
    })).toThrow('reject')
    expect(slice.get().count).toBe(0)
    expect(storage.has('test.rollback')).toBe(false)
    slice.update((draft) => { draft.count++ })
    expect(delivered).not.toHaveBeenCalled()
  })
})

describe('cross-context event consumers', () => {
  it.each(['IngredientPriceChanged', 'LabourRateSet'])('%s invalidates Menu Costing results even without changing a source reference', async (type) => {
    const { publishToHandlers } = await import('../eventBus')
    const before = published.getPublishedCosting('2026-09')
    expect(published.getPublishedCosting('2026-09')).toBe(before)
    publishToHandlers({ id: 'probe', at: TODAY, context: type === 'LabourRateSet' ? 'Workforce' : 'Inventory', type, summary: 'Probe' })
    expect(published.getPublishedCosting('2026-09')).not.toBe(before)
  })

  it('OverheadPoolClosed invalidates Insights results', async () => {
    const { publishToHandlers } = await import('../eventBus')
    const before = published.getPublishedInsights('2026-09')
    expect(published.getPublishedInsights('2026-09')).toBe(before)
    publishToHandlers({ id: 'probe', at: TODAY, context: 'Finance', type: 'OverheadPoolClosed', summary: 'Probe' })
    expect(published.getPublishedInsights('2026-09')).not.toBe(before)
  })

  it('delivers committed rates, recalculates costs, logs facts and supports unsubscribe', () => {
    const seen: string[] = []
    const stop = store.subscribeToEvent('LabourRateSet', () => {
      seen.push(published.getPublishedCosting('2026-09').costing.find((c) => c.itemId === 'risotto')!.labour.cost.toFixed(2))
    })
    store.actions.setRoleRate('kitchen', '30')
    expect(seen).toEqual(['12.50'])
    expect(store.sharedStore.get().events[0].type).toBe('LabourRateSet')
    stop()
    store.actions.setRoleRate('kitchen', '36')
    expect(seen).toEqual(['12.50'])
    const before = published.getPublishedCosting('2026-09').costing.find((c) => c.itemId === 'risotto')!.ingredientCost
    store.actions.recordPrice('shrimp', TODAY, '30')
    expect(published.getPublishedCosting('2026-09').costing.find((c) => c.itemId === 'risotto')!.ingredientCost.gt(before)).toBe(true)
  })

  it('freezes closed-period numbers and rejects writes without changing persisted data', () => {
    store.actions.closePeriod('2026-09')
    const closed = structuredClone(store.financeStore.get().periods.find((p) => p.month === '2026-09')!.snapshot)
    const events = store.sharedStore.get().events
    expect(events.some((e) => e.type === 'OverheadPoolClosed')).toBe(true)
    store.actions.recordPrice('shrimp', TODAY, '40')
    expect(store.financeStore.get().periods.find((p) => p.month === '2026-09')!.snapshot).toEqual(closed)
    const sales = store.salesStore.get()
    expect(() => store.actions.recordDailySales('2026-09-30', { risotto: 2 })).toThrow('closed')
    expect(store.salesStore.get()).toBe(sales)
  })
})

describe('published Workforce privacy', () => {
  it('publishes only roster totals and directory display fields', () => {
    expect(Object.keys(workforce.getRosterStatus('2026-10-05')).sort()).toEqual(['published', 'violationCount'])
    for (const employee of workforce.getEmployeeDirectory()) expect(Object.keys(employee).sort()).toEqual(['id', 'name', 'roleName'])
    expect(JSON.stringify(workforce.getWorkforcePublication())).not.toMatch(/hourlyWage|contractHours|employees/)
    for (const item of published.getMenuCatalogue()) {
      expect(Object.keys(item).sort()).toEqual(['archived', 'category', 'grossPrice', 'id', 'name', 'vatCategory'])
    }
  })

  it('filters to one employee and published weeks before returning the schedule', () => {
    const { employees, shifts } = store.workforceStore.get()
    const me = employees.find((e) => shifts.some((s) => s.employeeId === e.id))!
    const week = store.workforceStore.get().rosterWeeks.at(-1)!.weekStart
    store.actions.unpublishRoster(week)
    expect(workforce.getOwnSchedule(me.id).shifts.some((s) => s.date >= week)).toBe(false)
    store.actions.publishRoster(week, [])
    const own = workforce.getOwnSchedule(me.id)
    expect(own.me?.name).toBe(me.name)
    const ids = new Set(shifts.filter((s) => s.employeeId === me.id).map((s) => s.id))
    expect(own.shifts.length).toBeGreaterThan(0)
    expect(own.shifts.every((s) => ids.has(s.id))).toBe(true)
    expect(JSON.stringify(own)).not.toMatch(/hourlyWage|employeeId|isMinor/)
    expect(workforce.getOwnSchedule(null).shifts).toEqual([])
  })
})
