import { describe, expect, it } from 'vitest'
import { cents, D, fmtEUR, fmtPct, netFromGross, sum, ZERO } from '../shared/money'

describe('Money helpers keep amounts exact (quality attribute #1, accuracy)', () => {
  it('rounds half-up to the cent', () => {
    expect(cents(D('2.345')).toFixed(2)).toBe('2.35')
    expect(cents(D('2.344')).toFixed(2)).toBe('2.34')
    expect(cents(D('-2.345')).toFixed(2)).toBe('-2.35')
  })

  it('adds decimals without float drift', () => {
    expect(sum([D('0.1'), D('0.2')]).toString()).toBe('0.3')
    expect(sum([]).eq(ZERO)).toBe(true)
  })

  it('strips VAT from a gross price', () => {
    expect(cents(netFromGross('21.00', 9)).toFixed(2)).toBe('19.27')
    expect(cents(netFromGross(121, 21)).toFixed(2)).toBe('100.00')
    expect(netFromGross('10', 0).toFixed(2)).toBe('10.00')
  })
})

describe('Money formatting', () => {
  it('formats euros with a minus sign for losses', () => {
    expect(fmtEUR(D('1234.5'))).toBe('€1,234.50')
    expect(fmtEUR(-0.8)).toBe('−€0.80')
  })

  it('shows a plus sign only when asked and only for gains', () => {
    expect(fmtEUR(5, { sign: true })).toBe('+€5.00')
    expect(fmtEUR(0, { sign: true })).toBe('€0.00')
    expect(fmtEUR(-5, { sign: true })).toBe('−€5.00')
  })

  it('drops the cents for whole amounts', () => {
    expect(fmtEUR(9000.4, { whole: true })).toBe('€9,000')
  })

  it('formats percentages with the given digits', () => {
    expect(fmtPct(12.345)).toBe('12.3%')
    expect(fmtPct(-4, 0)).toBe('−4%')
  })
})
