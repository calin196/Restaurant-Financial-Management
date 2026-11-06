import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { buildSeed } from '../../data/seed'
import { currentVersion } from '../../domain/menuCosting/costing'
import { menuCosting } from '../selectors'
import { fmtDate, TODAY } from '../../domain/shared/dates'

let store: typeof import('../store')
let published: typeof import('../published')

beforeEach(async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  })
  vi.resetModules()
  store = await import('../store')
  published = await import('../published')
})

afterEach(() => { vi.unstubAllGlobals() })

const risotto = (costing: ReturnType<typeof menuCosting>) => costing.find((c) => c.itemId === 'risotto')!
const signature = (costing: ReturnType<typeof menuCosting>) => costing.map((c) => [c.itemId, c.trueCost.toFixed(2), c.margin.toFixed(2)])

describe('Supporting verification: controlled POS outage', () => {
  it('compares stored queries with a live-read reference under a failing POS stub', () => {
    const seed = buildSeed()
    let available = true
    const readPOS = vi.fn(() => {
      if (!available) throw new Error('POS unavailable')
      return seed.sales
    })
    // A reference alternative, not an implemented POS adapter or live service.
    const liveQuery = () => menuCosting({ ...seed, sales: readPOS() }, '2026-09')
    const localQuery = () => published.getPublishedCosting('2026-09').costing
    const expected = signature(localQuery())
    for (let i = 0; i < 20; i++) expect(signature(liveQuery())).toEqual(expected)
    const onlineCalls = readPOS.mock.calls.length
    available = false
    store.actions.updateSettings({ posOutage: true })
    const times: number[] = []
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      const result = localQuery()
      times.push(performance.now() - start)
      expect(signature(result)).toEqual(expected)
    }
    expect(readPOS).toHaveBeenCalledTimes(onlineCalls)
    for (let i = 0; i < 20; i++) expect(liveQuery).toThrow('POS unavailable')
    store.actions.recordPrice('shrimp', TODAY, '30')
    expect(risotto(localQuery()).ingredientCost.gt(risotto(menuCosting(seed, '2026-09')).ingredientCost)).toBe(true)
    console.info('STORED_INPUTS_OUTAGE', JSON.stringify({ onlineLiveSuccesses: 20, offlineStoredSuccesses: 20,
      offlineLiveSuccesses: 0, posCallsDuringStoredQueries: 0,
      storedQueryMaxMs: +Math.max(...times).toFixed(3),
      storedQueryMeanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3) }))
  })

  it('renders the outage notice with the configured last-sync date', async () => {
    const { AppProvider } = await import('../../ui/AppContext')
    const { default: SalesPage } = await import('../../pages/SalesPage')
    const { settings } = store.sharedStore.get()
    store.actions.updateSettings({ flags: { ...settings.flags, posIntegration: true },
      posOutage: true, lastPosSync: '2026-10-01T12:00:00' })
    const html = renderToString(<MemoryRouter><AppProvider><SalesPage /></AppProvider></MemoryRouter>)
    expect(html).toContain('POS unreachable')
    expect(html).toContain(fmtDate('2026-10-01'))
  }, 30000)
})

describe('CA3 Experiment 2: cross-context price updates', () => {
  it('updates all three dishes using olive oil and preserves earlier price records', () => {
    const before = published.getPublishedCosting('2026-09').costing
    const oldPrices = structuredClone(store.inventoryStore.get().prices)
    const affected = store.menuStore.get().menuItems.filter((m) => currentVersion(m).recipe.some((r) => r.ingredientId === 'oliveoil')).map((m) => m.id)
    expect(affected.sort()).toEqual(['burger', 'caesar', 'pizza'])
    const start = performance.now()
    store.actions.recordPrice('oliveoil', TODAY, '19')
    const after = published.getPublishedCosting('2026-09').costing
    const elapsed = performance.now() - start
    for (const item of after) {
      const old = before.find((c) => c.itemId === item.itemId)!
      expect(item.ingredientCost.gt(old.ingredientCost)).toBe(affected.includes(item.itemId))
    }
    expect(store.inventoryStore.get().prices.slice(0, -1)).toEqual(oldPrices)
    console.info('CA3_PROPAGATION', JSON.stringify({ correctlyUpdatedDishes: affected.length,
      unrelatedDishesChanged: 0, priorPricesPreserved: oldPrices.length,
      actionToQueryMs: +elapsed.toFixed(3) }))
  })

  it('replaying an event does not duplicate business records or add costs twice', async () => {
    const { publishToHandlers } = await import('../eventBus')
    store.actions.recordPrice('oliveoil', TODAY, '19')
    const event = store.sharedStore.get().events[0]
    const expected = signature(published.getPublishedCosting('2026-09').costing)
    const count = store.inventoryStore.get().prices.length
    publishToHandlers(event)
    publishToHandlers(event)
    expect(store.inventoryStore.get().prices).toHaveLength(count)
    expect(signature(published.getPublishedCosting('2026-09').costing)).toEqual(expected)
    // Command deduplication is a different property: same-price entries remain separate facts.
    store.actions.recordPrice('oliveoil', TODAY, '19')
    expect(store.inventoryStore.get().prices).toHaveLength(count + 1)
    expect(signature(published.getPublishedCosting('2026-09').costing)).toEqual(expected)
  })

  it('exposes the current failure limit: source commits, later handlers are skipped, no automatic retry', () => {
    const failure = vi.fn(() => { throw new Error('consumer failed') })
    const later = vi.fn()
    const stopFailure = store.subscribeToEvent('IngredientPriceChanged', failure)
    const stopLater = store.subscribeToEvent('IngredientPriceChanged', later)
    const count = store.inventoryStore.get().prices.length
    try {
      expect(() => store.actions.recordPrice('oliveoil', TODAY, '19')).toThrow('consumer failed')
      expect(store.inventoryStore.get().prices).toHaveLength(count + 1)
      expect(store.sharedStore.get().events[0].type).toBe('IngredientPriceChanged')
      expect(failure).toHaveBeenCalledOnce()
      expect(later).not.toHaveBeenCalled()
      published.getPublishedCosting('2026-09')
      expect(failure).toHaveBeenCalledOnce()
    } finally { stopFailure(); stopLater() }
  })

  it('a direct-call reference also propagates consumer failure after changing its source', () => {
    let sourcePrice = '9.50'
    const directConsumer = () => { throw new Error('consumer failed') }
    const directUpdate = () => { sourcePrice = '19.00'; directConsumer() }
    expect(directUpdate).toThrow('consumer failed')
    expect(sourcePrice).toBe('19.00')
  })
})
