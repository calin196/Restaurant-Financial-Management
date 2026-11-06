import { D, ZERO, cents, netFromGross, type Dec } from '../shared/money'
import { monthOf } from '../shared/dates'
import type { MenuItem, SaleRecord } from '../types'

/** ItemsSold for a month: portions per menu item (published to Menu Costing). */
export const portionsByItem = (sales: SaleRecord[], month: string): Map<string, number> => {
  const out = new Map<string, number>()
  for (const s of sales) if (monthOf(s.date) === month) out.set(s.menuItemId, (out.get(s.menuItemId) ?? 0) + s.quantity)
  return out
}

/** Net revenue per line uses the gross price recorded at the moment of sale. */
export const saleNet = (s: SaleRecord): Dec => cents(netFromGross(s.grossUnitPrice, s.vatRate)).times(s.quantity)

export interface MonthSales {
  month: string
  portions: number
  gross: Dec
  net: Dec
  vat: { rate: number; net: Dec; vat: Dec }[]
}

export const salesForMonth = (sales: SaleRecord[], month: string): MonthSales => {
  let portions = 0
  let gross = ZERO
  let net = ZERO
  const vat = new Map<number, { net: Dec; gross: Dec }>()
  for (const s of sales) {
    if (monthOf(s.date) !== month) continue
    portions += s.quantity
    const g = D(s.grossUnitPrice).times(s.quantity)
    const n = saleNet(s)
    gross = gross.plus(g)
    net = net.plus(n)
    const v = vat.get(s.vatRate) ?? { net: ZERO, gross: ZERO }
    vat.set(s.vatRate, { net: v.net.plus(n), gross: v.gross.plus(g) })
  }
  return {
    month,
    portions,
    gross,
    net,
    vat: [...vat.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, net: v.net, vat: v.gross.minus(v.net) })),
  }
}

export const salesMonths = (sales: SaleRecord[]): string[] => [...new Set(sales.map((s) => monthOf(s.date)))].sort()

export const lastEntryDate = (sales: SaleRecord[]): string | null =>
  sales.reduce<string | null>((max, s) => (max === null || s.date > max ? s.date : max), null)

// ---------- CSV import (anti-corruption layer for POS / spreadsheet exports) ----------

export interface CsvRow {
  line: number
  raw: string
  date: string
  itemName: string
  quantity: number
  matchedItemId: string | null
  error?: string
}

const normalise = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export const matchItem = (name: string, items: Pick<MenuItem, 'id' | 'name'>[]): string | null => {
  const n = normalise(name)
  if (!n) return null
  const exact = items.find((i) => normalise(i.name) === n)
  if (exact) return exact.id
  const partial = items.filter((i) => normalise(i.name).includes(n) || n.includes(normalise(i.name)))
  return partial.length === 1 ? partial[0].id : null
}

export const parseSalesCsv = (text: string, items: Pick<MenuItem, 'id' | 'name'>[]): CsvRow[] => {
  const lines = text.split(/\r?\n/)
  const rows: CsvRow[] = []
  lines.forEach((raw, idx) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const cells = trimmed.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (idx === 0 && /date/i.test(cells[0])) return // header
    const [date = '', itemName = '', qty = ''] = cells
    const quantity = Number(qty)
    let error: string | undefined
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error = 'Date must be YYYY-MM-DD'
    else if (!Number.isInteger(quantity) || quantity <= 0) error = 'Quantity must be a positive whole number'
    rows.push({ line: idx + 1, raw: trimmed, date, itemName, quantity, matchedItemId: error ? null : matchItem(itemName, items), error })
  })
  return rows
}
