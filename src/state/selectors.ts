import { ZERO, cents, sum, type Dec } from '../domain/shared/money'
import { TODAY, addMonths, monthOf } from '../domain/shared/dates'
import { publishedPrices } from '../domain/inventory/inventory'
import { publishedLabourRates } from '../domain/workforce/workforce'
import { overheadPool, labourForMonth, profitAndLoss, type ProfitAndLoss } from '../domain/finance/finance'
import { portionsByItem, salesForMonth, salesMonths } from '../domain/sales/sales'
import { costMenu, versionOn, type CostBreakdown, type CostingInputs } from '../domain/menuCosting/costing'
import { reconcileLabour, type LabourReconciliation } from '../domain/insights/insights'
import type { AllocationPolicy, FinanceState, InventoryState, MenuCostingState, PeriodSnapshot, SalesState, SharedState, WorkforceState } from '../domain/types'

// Projections that connect the contexts. Each one passes only what a context
// publishes (prices per base unit, a rate per role, an overhead pool, portions
// sold) to the context downstream of it.

export type CostingSource = InventoryState & MenuCostingState & SalesState & Pick<WorkforceState, 'roles'> & Pick<FinanceState, 'costs'> & Pick<SharedState, 'settings'>
export type FinanceSource = CostingSource & FinanceState & Pick<WorkforceState, 'labourBookings'>

export const currentMonth = monthOf(TODAY)

/** Months that can serve as a costing basis: complete months with sales. */
export const basisMonths = (s: SalesState): string[] => salesMonths(s.sales).filter((m) => m < currentMonth)

export const defaultBasisMonth = (s: SalesState): string => basisMonths(s).at(-1) ?? addMonths(currentMonth, -1)

export const costingInputs = (s: CostingSource, basisMonth: string, policy?: AllocationPolicy): CostingInputs => ({
  prices: publishedPrices(s.ingredients, s.prices, TODAY, s.settings.staleAfterDays),
  labourRates: publishedLabourRates(s.roles),
  overheadPool: overheadPool(s.costs, basisMonth).total,
  portionsSold: portionsByItem(s.sales, basisMonth),
  basisMonth,
  policy: policy ?? s.settings.allocationPolicy,
})

export const menuCosting = (s: CostingSource, basisMonth: string, policy?: AllocationPolicy): CostBreakdown[] =>
  costMenu(s.menuItems, costingInputs(s, basisMonth, policy))

/** Ingredient cost of what was actually sold in a month, using the published costing snapshot. */
export const labourReconciliation = (s: FinanceSource, month: string): LabourReconciliation[] =>
  reconcileLabour(menuCosting(s, month), s.roles, s.labourBookings, month)

export const cogsForMonth = (s: FinanceSource, month: string): Dec => {
  const prices = publishedPrices(s.ingredients, s.prices, TODAY, s.settings.staleAfterDays)
  const portions = portionsByItem(s.sales, month)
  return sum(
    s.menuItems.map((item) => {
      const n = portions.get(item.id) ?? 0
      if (!n) return ZERO
      const v = versionOn(item, TODAY)
      const unit = cents(sum(v.recipe.map((l) => {
        const p = prices.get(l.ingredientId)
        return p ? p.pricePerBaseUnit.times(l.quantity).div(l.yieldPct / 100) : ZERO
      })))
      return unit.times(n)
    }),
  )
}

export const pnlForMonth = (s: FinanceSource, month: string): ProfitAndLoss => {
  const closed = s.periods.find((p) => p.month === month && p.status === 'closed' && p.snapshot)
  const sales = salesForMonth(s.sales, month)
  if (closed?.snapshot) {
    // closed periods are immutable: read the frozen numbers, never recalculate
    const live = profitAndLoss(month, sales.net, ZERO, ZERO, s.costs)
    const snap = closed.snapshot
    return {
      ...live,
      revenue: dec(snap.revenue), cogs: dec(snap.cogs), labour: dec(snap.labour), overhead: dec(snap.overhead),
      grossProfit: dec(snap.revenue).minus(dec(snap.cogs)), profit: dec(snap.profit),
      marginPct: dec(snap.revenue).isZero() ? 0 : dec(snap.profit).div(dec(snap.revenue)).times(100).toNumber(),
    }
  }
  return profitAndLoss(month, sales.net, cogsForMonth(s, month), labourForMonth(s.labourBookings, month), s.costs)
}

const dec = (v: string) => ZERO.plus(v)

export const buildSnapshot = (s: FinanceSource, month: string): PeriodSnapshot => {
  const pnl = profitAndLoss(month, salesForMonth(s.sales, month).net, cogsForMonth(s, month), labourForMonth(s.labourBookings, month), s.costs)
  const sales = salesForMonth(s.sales, month)
  return {
    revenue: cents(pnl.revenue).toFixed(2),
    cogs: cents(pnl.cogs).toFixed(2),
    labour: cents(pnl.labour).toFixed(2),
    overhead: cents(pnl.overhead).toFixed(2),
    profit: cents(pnl.profit).toFixed(2),
    portions: sales.portions,
    vat: sales.vat.map((v) => ({ rate: v.rate, net: cents(v.net).toFixed(2), vat: cents(v.vat).toFixed(2) })),
  }
}

export const isMonthLocked = (s: Pick<FinanceState, 'periods'>, month: string) =>
  s.periods.some((p) => p.month === month && p.status === 'closed')

/** Every month that has sales or costs, newest last. */
export const financeMonths = (s: SalesState & Pick<FinanceState, 'periods'>): string[] => {
  const months = new Set<string>(salesMonths(s.sales))
  s.periods.forEach((p) => months.add(p.month))
  return [...months].filter((m) => m <= currentMonth).sort()
}
