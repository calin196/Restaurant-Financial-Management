import { describe, expect, it } from 'vitest'
import { buildSeed } from '../../data/seed'
import { costingInputs, menuCosting, pnlForMonth } from '../../state/selectors'
import { buildSuggestions } from '../insights/insights'
import { checkNewPrice } from '../inventory/inventory'
import { validateRoster } from '../workforce/workforce'
import { parseSalesCsv } from '../sales/sales'
import { D } from '../shared/money'
import type { AllocationPolicy } from '../types'

const s = buildSeed()
const risotto = () => menuCosting(s, '2026-09').find((c) => c.itemId === 'risotto')!

describe('Menu Costing reproduces the worked example (report, Bounded Contexts 3.5)', () => {
  it('uses 4,500 portions and a €9,000 overhead pool in September', () => {
    const inputs = costingInputs(s, '2026-09')
    expect([...inputs.portionsSold.values()].reduce((a, b) => a + b, 0)).toBe(4500)
    expect(inputs.overheadPool.toFixed(2)).toBe('9000.00')
  })

  it('costs the seafood risotto to the cent', () => {
    const c = risotto()
    expect(c.portions).toBe(320)
    expect(c.netPrice.toFixed(2)).toBe('19.27')
    expect(c.ingredientCost.toFixed(2)).toBe('8.90')
    expect(c.ingredients.find((l) => l.ingredientId === 'shrimp')!.cost.toFixed(2)).toBe('3.51')
    expect(c.labour.cost.toFixed(2)).toBe('9.17')
    expect(c.overhead.cost.toFixed(2)).toBe('2.00')
    expect(c.trueCost.toFixed(2)).toBe('20.07')
    expect(c.margin.toFixed(2)).toBe('-0.80')
    expect(c.periodProfit.toFixed(2)).toBe('-256.00')
    expect(Math.round(c.foodCostPct)).toBe(46)
    expect(Math.round(c.labourPct)).toBe(48)
  })

  it('suggests the price and prep-time fixes from the report', () => {
    const inputs = costingInputs(s, '2026-09')
    const all = Object.fromEntries((['perPortion', 'revenueShare', 'prepMinute'] as AllocationPolicy[]).map((p) => [p, menuCosting(s, '2026-09', p)])) as never
    const sug = buildSuggestions(s.menuItems, menuCosting(s, '2026-09'), inputs, all)
    const price = sug.find((x) => x.kind === 'price' && x.itemId === 'risotto')!
    expect(price.apply?.grossPrice).toBe('23.50')
    expect(price.impact).toContain('margin €1.49')
    const prep = sug.find((x) => x.kind === 'prep' && x.itemId === 'risotto')!
    expect(prep.apply?.prepMinutes).toBe(12)
    expect(prep.impact).toContain('margin €3.97')
  })

  it('allocates exactly the overhead pool under every policy', () => {
    for (const p of ['perPortion', 'revenueShare', 'prepMinute'] as AllocationPolicy[]) {
      const total = menuCosting(s, '2026-09', p).reduce((acc, c) => acc.plus(c.overhead.cost.times(c.portions)), D(0))
      expect(Math.abs(total.minus(9000).toNumber())).toBeLessThan(25) // only per-portion cent rounding differs
    }
  })
})

describe('guards', () => {
  it('flags a x1000 unit error on a new price', () => {
    expect(checkNewPrice(D('23.40'), D('23400'), 'kg').level).toBe('warning')
    expect(checkNewPrice(D('23.40'), D('24.10'), 'kg').level).toBe('ok')
  })

  it('warns about rest time and night work in the draft roster', () => {
    const w = validateRoster('2026-10-26', s.shifts, s.employees)
    expect(w.some((x) => x.rule === 'Minimum rest' && x.employeeId === 'e-lena')).toBe(true)
    expect(w.some((x) => x.rule === 'Night work (under 18)' && x.employeeId === 'e-sophie')).toBe(true)
  })

  it('flags unmatched CSV lines', () => {
    const rows = parseSalesCsv('date,item,quantity\n2026-10-28,Espresso,12\n2026-10-28,Truffle fries,4', s.menuItems)
    expect(rows[0].matchedItemId).toBe('espresso')
    expect(rows[1].matchedItemId).toBeNull()
  })

  it('produces a September P&L with labour above budget', () => {
    const pnl = pnlForMonth(s, '2026-09')
    expect(pnl.labour.toFixed(2)).toBe('18500.00')
    expect(pnl.overhead.toFixed(2)).toBe('9000.00')
  })
})
