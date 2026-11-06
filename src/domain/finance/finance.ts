import { D, ZERO, sum, type Dec } from '../shared/money'
import { monthRange } from '../shared/dates'
import type { Budget, BudgetCategory, CostEntry, LabourBooking } from '../types'

export const GENERAL_CATEGORIES = ['Rent', 'Energy', 'Water', 'Insurance', 'Other'] as const
export const EXTERNAL_CATEGORIES = ['Subscriptions', 'Cleaning', 'Repairs', 'Accounting', 'Other services'] as const

export const budgetCategoryOf = (c: CostEntry): BudgetCategory => {
  if (c.kind === 'external') return 'External services'
  if (c.category === 'Rent') return 'Rent'
  if (c.category === 'Energy' || c.category === 'Water') return 'Utilities'
  return 'Other general'
}

/** General and external costs are spread evenly over the months they cover. */
export const monthlyShare = (c: CostEntry, month: string): Dec => {
  if (c.archived || month < c.fromMonth || month > c.toMonth) return ZERO
  return D(c.amount).div(monthRange(c.fromMonth, c.toMonth).length)
}

export interface OverheadLine {
  cost: CostEntry
  share: Dec
}

/** The overhead pool of a month (published to Menu Costing as OverheadPoolClosed). */
export const overheadPool = (costs: CostEntry[], month: string): { total: Dec; lines: OverheadLine[] } => {
  const lines = costs.map((cost) => ({ cost, share: monthlyShare(cost, month) })).filter((l) => !l.share.isZero())
  return { total: sum(lines.map((l) => l.share)), lines }
}

export const labourForMonth = (bookings: LabourBooking[], month: string): Dec =>
  sum(bookings.filter((b) => b.month === month).map((b) => D(b.amount)))

export interface ProfitAndLoss {
  month: string
  revenue: Dec
  cogs: Dec
  grossProfit: Dec
  labour: Dec
  overhead: Dec
  overheadByCategory: Map<BudgetCategory, Dec>
  profit: Dec
  marginPct: number
}

export const profitAndLoss = (
  month: string,
  revenue: Dec,
  cogs: Dec,
  labour: Dec,
  costs: CostEntry[],
): ProfitAndLoss => {
  const pool = overheadPool(costs, month)
  const overheadByCategory = new Map<BudgetCategory, Dec>()
  for (const l of pool.lines) {
    const cat = budgetCategoryOf(l.cost)
    overheadByCategory.set(cat, (overheadByCategory.get(cat) ?? ZERO).plus(l.share))
  }
  const grossProfit = revenue.minus(cogs)
  const profit = grossProfit.minus(labour).minus(pool.total)
  return {
    month,
    revenue,
    cogs,
    grossProfit,
    labour,
    overhead: pool.total,
    overheadByCategory,
    profit,
    marginPct: revenue.isZero() ? 0 : profit.div(revenue).times(100).toNumber(),
  }
}

export interface BudgetStatus {
  category: BudgetCategory
  budget: Dec
  actual: Dec
  usedPct: number
  exceeded: boolean
}

export const budgetStatus = (budgets: Budget[], pnl: ProfitAndLoss): BudgetStatus[] =>
  budgets.map((b) => {
    const actual =
      b.category === 'Ingredients' ? pnl.cogs : b.category === 'Labour' ? pnl.labour : (pnl.overheadByCategory.get(b.category) ?? ZERO)
    const budget = D(b.monthly)
    const usedPct = budget.isZero() ? 0 : actual.div(budget).times(100).toNumber()
    return { category: b.category, budget, actual, usedPct, exceeded: actual.gt(budget) }
  })
