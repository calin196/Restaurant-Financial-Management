import { D, fmtEUR, sum, type Dec } from '../shared/money'
import { addDays, weekday } from '../shared/dates'
import { POLICY_LABELS, currentVersion, whatIf, type CostBreakdown, type CostingInputs } from '../menuCosting/costing'
import type { AllocationPolicy, LabourBooking, LabourRole, MenuItem, SaleRecord } from '../types'

// Insights & Advisory. Suggestions are advice with a reason and a confidence;
// the manager decides and the decision is recorded. Nothing here looks at
// individual employees: forecasts work on aggregate demand only.

export interface Suggestion {
  key: string
  kind: 'price' | 'prep' | 'policy' | 'data'
  itemId?: string
  title: string
  reason: string
  impact: string
  impactValue: number // € per month, for sorting
  confidence: number // 0..1
  basedOn: string[]
  apply?: { grossPrice?: string; prepMinutes?: number }
}

const TARGET_MARGIN_PCT = 5

const confidenceFor = (c: CostBreakdown, base: number) => {
  let conf = base
  if (c.labour.estimate) conf -= 0.1
  if (c.staleInputs > 0) conf -= 0.1
  if (c.portions < 50) conf -= 0.15
  return Math.max(0.2, Math.min(0.95, conf))
}

export const buildSuggestions = (
  items: MenuItem[],
  costing: CostBreakdown[],
  inputs: CostingInputs,
  allPolicies: Record<AllocationPolicy, CostBreakdown[]>,
): Suggestion[] => {
  const out: Suggestion[] = []
  for (const c of costing) {
    const item = items.find((i) => i.id === c.itemId)!
    const basedOn = [
      `${c.portions} portions sold`,
      `${POLICY_LABELS[inputs.policy].name} overhead`,
      c.labour.estimate ? 'prep time is an estimate' : 'measured prep time',
      c.staleInputs ? `${c.staleInputs} stale price(s)` : 'prices up to date',
    ]
    if (c.marginPct < TARGET_MARGIN_PCT) {
      // smallest menu price on a €0.50 grid that reaches the target margin
      let price = D(c.grossPrice).div(0.5).toDecimalPlaces(0, 2).times(0.5)
      let result = whatIf(items, item, inputs, { grossPrice: price.toFixed(2) })
      for (let i = 0; i < 40 && result.marginPct < TARGET_MARGIN_PCT; i++) {
        price = price.plus(0.5)
        result = whatIf(items, item, inputs, { grossPrice: price.toFixed(2) })
      }
      const gain = result.margin.minus(c.margin)
      out.push({
        key: `price:${c.itemId}:${price.toFixed(2)}`,
        kind: 'price',
        itemId: c.itemId,
        title: `Raise ${c.name} to ${fmtEUR(price)}`,
        reason:
          c.margin.isNegative()
            ? `Every portion loses ${fmtEUR(c.margin.abs())} after labour and overhead (${fmtEUR(c.periodProfit, { whole: true })} in the basis month), although food cost alone is only ${c.foodCostPct.toFixed(0)}% of the net price.`
            : `The margin is only ${c.marginPct.toFixed(1)}% of the net price, below the ${TARGET_MARGIN_PCT}% target.`,
        impact: `${fmtEUR(gain, { sign: true })} per portion → margin ${fmtEUR(result.margin)} (${result.marginPct.toFixed(1)}%)`,
        impactValue: gain.times(c.portions).toNumber(),
        confidence: confidenceFor(c, 0.8),
        basedOn,
        apply: { grossPrice: price.toFixed(2) },
      })
    }
    if (c.marginPct < TARGET_MARGIN_PCT && c.labourPct > 30 && c.labour.minutes >= 10) {
      const minutes = Math.floor(c.labour.minutes / 2)
      const result = whatIf(items, item, inputs, { prepMinutes: minutes })
      const gain = result.margin.minus(c.margin)
      out.push({
        key: `prep:${c.itemId}:${minutes}`,
        kind: 'prep',
        itemId: c.itemId,
        title: `Cut prep time of ${c.name} to ${minutes} min`,
        reason: `Labour is ${c.labourPct.toFixed(0)}% of the net price (${c.labour.minutes} min at ${fmtEUR(c.labour.rate)}/h). Batch-preparing the base could halve the time per portion.`,
        impact: `${fmtEUR(gain, { sign: true })} per portion → margin ${fmtEUR(result.margin)} (${result.marginPct.toFixed(1)}%)`,
        impactValue: gain.times(c.portions).toNumber(),
        confidence: confidenceFor(c, 0.6),
        basedOn,
        apply: { prepMinutes: minutes },
      })
    }
    // allocation sensitivity: profitable under one policy, loss under another
    const signs = (Object.keys(allPolicies) as AllocationPolicy[]).map((p) => ({
      p,
      m: allPolicies[p].find((x) => x.itemId === c.itemId)?.margin,
    }))
    const losing = signs.filter((s) => s.m?.isNegative()).map((s) => POLICY_LABELS[s.p].name)
    if (losing.length > 0 && losing.length < signs.length) {
      out.push({
        key: `policy:${c.itemId}:${losing.join('|')}`,
        kind: 'policy',
        itemId: c.itemId,
        title: `${c.name} depends on the allocation policy`,
        reason: `It makes a loss under ${losing.join(' and ')} but a profit under the other polic${signs.length - losing.length > 1 ? 'ies' : 'y'}. Check which policy matches how this item really uses rent and staff before changing its price.`,
        impact: 'No automatic change; review the allocation policy',
        impactValue: 0,
        confidence: 0.5,
        basedOn,
      })
    }
  }
  return out.sort((a, b) => b.impactValue - a.impactValue)
}

export interface DemandForecastDay {
  date: string
  weekday: number
  kitchenPortions: number
  barPortions: number
  kitchenMinutes: number
  barMinutes: number
  cooks: number
  barStaff: number
}

// Productive minutes one person delivers in an 8 h shift (75% utilisation).
const PRODUCTIVE_MINUTES = 8 * 60 * 0.75

/** Aggregate demand forecast for the next 7 days: average of the same weekday over the last 8 weeks. */
export const forecastWeek = (sales: SaleRecord[], items: MenuItem[], today: string): DemandForecastDay[] => {
  const from = addDays(today, -56)
  const recent = sales.filter((s) => s.date >= from && s.date < today)
  const byItem = new Map(items.map((i) => [i.id, currentVersion(i)]))
  const days: DemandForecastDay[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i)
    const wd = weekday(date)
    const sameDays = new Set(recent.filter((s) => weekday(s.date) === wd).map((s) => s.date))
    const n = Math.max(sameDays.size, 1)
    let kp = 0, bp = 0, km = 0, bm = 0
    for (const s of recent) {
      if (weekday(s.date) !== wd) continue
      const v = byItem.get(s.menuItemId)
      if (!v) continue
      if (v.labourRoleId === 'bar') { bp += s.quantity; bm += s.quantity * v.prepMinutes }
      else { kp += s.quantity; km += s.quantity * v.prepMinutes }
    }
    kp /= n; bp /= n; km /= n; bm /= n
    days.push({
      date, weekday: wd,
      kitchenPortions: Math.round(kp), barPortions: Math.round(bp),
      kitchenMinutes: Math.round(km), barMinutes: Math.round(bm),
      cooks: Math.max(1, Math.ceil(km / PRODUCTIVE_MINUTES)),
      barStaff: Math.max(1, Math.ceil(bm / PRODUCTIVE_MINUTES)),
    })
  }
  return days
}

export interface LabourReconciliation {
  roleId: string
  roleName: string
  charged: Dec // labour per portion × portions sold, summed over the role's dishes
  booked: Dec // LabourCostBooked from Workforce
  unallocated: Dec // booked − charged; negative when dishes are charged more than payroll paid
  absorbedPct: number | null // charged as a share of booked; null when nothing was booked
}

/**
 * Labour reconciliation: labour charged to dishes against labour booked from payroll, per role.
 * Both sides are role totals, so no wage or employee data reaches Insights.
 * `costing` must be calculated with `month` as its basis month.
 */
export const reconcileLabour = (
  costing: CostBreakdown[],
  roles: Pick<LabourRole, 'id' | 'name'>[],
  bookings: LabourBooking[],
  month: string,
): LabourReconciliation[] =>
  roles.map((role) => {
    const charged = sum(costing.filter((c) => c.version.labourRoleId === role.id).map((c) => c.labour.cost.times(c.portions)))
    const booked = sum(bookings.filter((b) => b.month === month && b.roleId === role.id).map((b) => D(b.amount)))
    return {
      roleId: role.id,
      roleName: role.name,
      charged,
      booked,
      unallocated: booked.minus(charged),
      absorbedPct: booked.isZero() ? null : charged.div(booked).times(100).toNumber(),
    }
  })

/** Labour paid in the month that no dish carries: the gap between summed dish profit and the P&L. */
export const unallocatedLabour = (rows: LabourReconciliation[]): Dec => sum(rows.map((r) => r.unallocated))
