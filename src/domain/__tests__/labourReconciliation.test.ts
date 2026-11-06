import { describe, expect, it } from 'vitest'
import { buildSeed } from '../../data/seed'
import { costingInputs, labourReconciliation, menuCosting, pnlForMonth } from '../../state/selectors'
import { reconcileLabour, unallocatedLabour } from '../insights/insights'
import { ZERO, sum } from '../shared/money'

// Labour enters Menu Costing only as a rate per role (Concept Architecture 1.5),
// applied to the prep minutes of each dish. Insights compares the labour charged
// to dishes this way with the labour booked from payroll (LabourCostBooked) per
// role; these tests pin down what that comparison shows for the demo restaurant.

const s = buildSeed()
const MONTHS = ['2026-07', '2026-08', '2026-09']

describe('Labour per role against payroll', () => {
  it('keeps wages out of Menu Costing: only a rate per role leaves Workforce', () => {
    const { labourRates } = costingInputs(s, '2026-09')
    expect([...labourRates.keys()].sort()).toEqual(s.roles.map((r) => r.id).sort())
    for (const rate of labourRates.values()) expect(Object.keys(rate).sort()).toEqual(['rate', 'roleName'])
  })

  it('rejects the hypothesis: no role is within 10% of payroll in any month', () => {
    for (const month of MONTHS) {
      const byRole = Object.fromEntries(labourReconciliation(s, month).map((r) => [r.roleId, r.absorbedPct ?? NaN]))
      expect(byRole.kitchen).toBeGreaterThan(110) // prep-minute estimates exceed paid kitchen hours
      expect(byRole.bar).toBeLessThan(50)
      expect(byRole.service).toBe(0) // no dish carries front-of-house labour
    }
  })

  it('leaves about €5,800 of labour a month outside every dish', () => {
    const sep = labourReconciliation(s, '2026-09')
    expect(sum(sep.map((r) => r.charged)).toFixed(2)).toBe('12701.50')
    expect(sum(sep.map((r) => r.booked)).toFixed(2)).toBe('18500.00')
    for (const month of MONTHS) expect(unallocatedLabour(labourReconciliation(s, month)).toNumber()).toBeCloseTo(5795, -2)
  })

  it('reports no share, rather than failing, for a role with nothing booked', () => {
    const rows = reconcileLabour(menuCosting(s, '2026-09'), s.roles, [], '2026-09')
    for (const r of rows) {
      expect(r.absorbedPct).toBeNull()
      expect(r.unallocated.toFixed(2)).toBe(r.charged.negated().toFixed(2))
    }
  })

  it('explains the whole gap between summed dish profit and the September P&L', () => {
    const dishProfit = menuCosting(s, '2026-09').reduce((acc, c) => acc.plus(c.periodProfit), ZERO)
    expect(dishProfit.toFixed(2)).toBe('11168.60')
    expect(pnlForMonth(s, '2026-09').profit.toFixed(2)).toBe('5370.10')
    expect(dishProfit.minus(pnlForMonth(s, '2026-09').profit).toFixed(2)).toBe(unallocatedLabour(labourReconciliation(s, '2026-09')).toFixed(2))
  })
})
