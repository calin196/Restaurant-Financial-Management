import { useMemo } from 'react'
import { financeStore, inventoryStore, menuStore, salesStore, sharedStore } from './store'
import { subscribeToEvent } from './eventBus'
import { getWorkforcePublication, useWorkforcePublication } from './workforce'
import { costingInputs, financeMonths, labourReconciliation, menuCosting, pnlForMonth, type FinanceSource } from './selectors'
import { buildSuggestions, forecastWeek } from '../domain/insights/insights'
import { publishedPrices, isLowStock } from '../domain/inventory/inventory'
import { lastEntryDate, portionsByItem, salesForMonth, salesMonths } from '../domain/sales/sales'
import { currentVersion } from '../domain/menuCosting/costing'
import { TODAY, daysBetween } from '../domain/shared/dates'
import type { AllocationPolicy, PriceRecord } from '../domain/types'

// This adapter is the explicit composition point. It reads published role-level
// Workforce data, never employee records, and returns results to downstream UIs.
function source(): FinanceSource {
  return { ...inventoryStore.get(), ...menuStore.get(), ...salesStore.get(),
    ...financeStore.get(), settings: sharedStore.get().settings, ...getWorkforcePublication() }
}

function useInputs() {
  const inventory = inventoryStore.useSlice()
  const menu = menuStore.useSlice()
  const sales = salesStore.useSlice()
  const finance = financeStore.useSlice()
  const shared = sharedStore.useSlice()
  const workforce = useWorkforcePublication()
  return [inventory, menu, sales, finance, shared.settings, workforce] as const
}

const costingCache = new Map<string, { dependencies: readonly unknown[]; value: ReturnType<typeof calculateCosting> }>()
const insightsCache = new Map<string, { dependencies: readonly unknown[]; value: ReturnType<typeof calculateInsights> }>()
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => v === b[i])

// Real consumers: invalidate the receiving module's derived results. The next
// query rebuilds them; cached objects are shared by all readers until invalidated.
subscribeToEvent('IngredientPriceChanged', () => { costingCache.clear(); insightsCache.clear() })
subscribeToEvent('LabourRateSet', () => { costingCache.clear(); insightsCache.clear() })
subscribeToEvent('OverheadPoolClosed', () => { insightsCache.clear() })

function calculateCosting(month: string, policy?: AllocationPolicy) {
  const s = source()
  return { inputs: costingInputs(s, month, policy), costing: menuCosting(s, month, policy) }
}

export function getPublishedCosting(month: string, policy?: AllocationPolicy) {
  const s = source()
  const key = `${month}:${policy ?? s.settings.allocationPolicy}`
  const dependencies = [s.ingredients, s.prices, s.menuItems, s.sales, s.costs, s.roles, s.settings]
  const cached = costingCache.get(key)
  if (cached && same(cached.dependencies, dependencies)) return cached.value
  const value = calculateCosting(month, policy)
  costingCache.set(key, { dependencies, value })
  return value
}

export function getPublishedPolicies(month: string) {
  return {
    perPortion: getPublishedCosting(month, 'perPortion').costing,
    revenueShare: getPublishedCosting(month, 'revenueShare').costing,
    prepMinute: getPublishedCosting(month, 'prepMinute').costing,
  }
}

function calculateInsights(month: string) {
  const s = source()
  const { inputs, costing } = getPublishedCosting(month)
  return { suggestions: buildSuggestions(s.menuItems, costing, inputs, getPublishedPolicies(month)),
    forecast: forecastWeek(s.sales, s.menuItems, TODAY) }
}

export function getPublishedInsights(month: string) {
  const s = source()
  const dependencies = [getPublishedCosting(month), s.periods, s.sales, s.menuItems]
  const cached = insightsCache.get(month)
  if (cached && same(cached.dependencies, dependencies)) return cached.value
  const value = calculateInsights(month)
  insightsCache.set(month, { dependencies, value })
  return value
}

export function usePublishedCosting(month: string, policy?: AllocationPolicy) {
  const dependencies = useInputs()
  return useMemo(() => getPublishedCosting(month, policy), [...dependencies, month, policy])
}

export function usePublishedPolicies(month: string) {
  const dependencies = useInputs()
  return useMemo(() => getPublishedPolicies(month), [...dependencies, month])
}

export function usePublishedInsights(month: string) {
  const dependencies = useInputs()
  return useMemo(() => getPublishedInsights(month), [...dependencies, month])
}

export function usePublishedForecast(today = TODAY) {
  const sales = salesStore.useSlice()
  const menu = menuStore.useSlice()
  return useMemo(() => forecastWeek(sales.sales, menu.menuItems, today), [sales, menu, today])
}

/** Sales needs current prices and VAT, not recipes or menu-version history. */
export function getMenuCatalogue() {
  return menuStore.get().menuItems.map((item) => {
    const { grossPrice, vatCategory } = currentVersion(item)
    return { id: item.id, name: item.name, category: item.category, archived: item.archived, grossPrice, vatCategory }
  })
}

export function useMenuCatalogue() {
  const menu = menuStore.useSlice()
  return useMemo(() => ({ menuItems: getMenuCatalogue() }), [menu])
}

export function useDishSalesHistory(id: string) {
  const { sales } = salesStore.useSlice()
  return useMemo(() => salesMonths(sales).map((month) => ({ month, n: portionsByItem(sales, month).get(id) ?? 0 })), [sales, id])
}

export function useIngredientUsage() {
  const { menuItems } = menuStore.useSlice()
  return useMemo(() => (ingredientId: string) => menuItems
    .filter((m) => !m.archived && currentVersion(m).recipe.some((r) => r.ingredientId === ingredientId))
    .map(({ id, name }) => ({ id, name })), [menuItems])
}

export function previewIngredientPrice(record: PriceRecord, month: string) {
  const s = source()
  return menuCosting({ ...s, prices: [...s.prices, record] }, month)
}

export function useFinanceReports() {
  const dependencies = useInputs()
  return useMemo(() => {
    const s = source()
    return { months: financeMonths(s), pnl: (month: string) => pnlForMonth(s, month),
      sales: (month: string) => salesForMonth(s.sales, month),
      reconciliation: (month: string) => labourReconciliation(s, month) }
  }, dependencies)
}

export function useInventoryHealth() {
  const inventory = inventoryStore.useSlice()
  const menu = menuStore.useSlice()
  const { settings } = sharedStore.useSlice()
  const sales = salesStore.useSlice()
  return useMemo(() => {
    const used = new Set(menu.menuItems.filter((m) => !m.archived).flatMap((m) => currentVersion(m).recipe.map((r) => r.ingredientId)))
    const stale = inventory.ingredients.filter((i) => !i.archived && used.has(i.id)).map((i) => {
      const last = inventory.prices.filter((p) => p.ingredientId === i.id).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
      return { ing: { name: i.name }, days: last ? daysBetween(last.date, TODAY) : 999 }
    }).filter((x) => x.days > settings.staleAfterDays).sort((a, b) => b.days - a.days)
    return { stale, lowStock: settings.flags.inventoryAlerts
      ? inventory.ingredients.filter((i) => !i.archived && isLowStock(i)).map((i) => ({ name: i.name })) : [],
      lastSale: lastEntryDate(sales.sales) }
  }, [inventory, menu, settings, sales])
}

export function useRecipeOptions() {
  const inventory = inventoryStore.useSlice()
  const workforce = useWorkforcePublication()
  const { settings } = sharedStore.useSlice()
  return useMemo(() => ({
    ingredients: inventory.ingredients.filter((i) => !i.archived).map(({ id, name, baseUnit, purchaseUnit }) => ({ id, name, baseUnit, purchaseUnit })),
    roles: getWorkforcePublication().roles,
    prices: publishedPrices(inventory.ingredients, inventory.prices, TODAY, settings.staleAfterDays),
  }), [inventory, workforce, settings])
}

export function usePeriodStatus() {
  const { periods } = financeStore.useSlice()
  return useMemo(() => (month: string) => periods.some((p) => p.month === month && p.status === 'closed'), [periods])
}
