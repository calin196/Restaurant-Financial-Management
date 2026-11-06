import Decimal from 'decimal.js-light'

// Accuracy is quality attribute #1: every money calculation runs on exact
// decimals, never on binary floats. Values are rounded half-up to the cent
// per cost component, which is how a manager checks the numbers by hand.
Decimal.config({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export type Dec = Decimal
export const D = (v: Decimal | string | number): Decimal => new Decimal(v)
export const ZERO = D(0)

export const cents = (v: Decimal): Decimal => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

export const sum = (values: Decimal[]): Decimal => values.reduce((acc, v) => acc.plus(v), ZERO)

export const netFromGross = (gross: Decimal | string | number, vatRate: number): Decimal =>
  D(gross).div(D(1).plus(D(vatRate).div(100)))

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export const fmtEUR = (v: Decimal | number, opts: { whole?: boolean; sign?: boolean } = {}): string => {
  const n = typeof v === 'number' ? v : v.toNumber()
  const s = (opts.whole ? eur0 : eur).format(Math.abs(n))
  if (n < 0) return `−${s}`
  return opts.sign && n > 0 ? `+${s}` : s
}

export const fmtPct = (v: number, digits = 1): string =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`

export const fmtNum = (v: number, digits = 0): string =>
  new Intl.NumberFormat('en-IE', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v)
