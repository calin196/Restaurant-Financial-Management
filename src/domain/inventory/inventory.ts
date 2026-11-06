import { D, type Dec } from '../shared/money'
import { daysBetween } from '../shared/dates'
import type { BaseUnit, Ingredient, PriceRecord, PurchaseUnit } from '../types'

// Explicit base units: every recipe quantity is in g, ml or pcs; every price is
// converted from its purchase unit to that base unit before costing.
const FACTORS: Record<PurchaseUnit, { base: BaseUnit; factor: number }> = {
  kg: { base: 'g', factor: 1000 },
  g: { base: 'g', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  pcs: { base: 'pcs', factor: 1 },
}

export const purchaseUnitsFor = (base: BaseUnit): PurchaseUnit[] =>
  (Object.keys(FACTORS) as PurchaseUnit[]).filter((u) => FACTORS[u].base === base)

export const isCompatible = (base: BaseUnit, purchase: PurchaseUnit) => FACTORS[purchase].base === base

export const toBaseUnitPrice = (price: Dec, unit: PurchaseUnit): Dec => price.div(FACTORS[unit].factor)

export const priceHistory = (prices: PriceRecord[], ingredientId: string): PriceRecord[] =>
  prices
    .filter((p) => p.ingredientId === ingredientId)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))

/** The price valid on a date: the latest record on or before it. */
export const priceOn = (prices: PriceRecord[], ingredientId: string, date: string): PriceRecord | undefined => {
  const history = priceHistory(prices, ingredientId).filter((p) => p.date <= date)
  return history[history.length - 1]
}

export interface PublishedPrice {
  ingredientId: string
  name: string
  baseUnit: BaseUnit
  pricePerBaseUnit: Dec
  price: Dec
  purchaseUnit: PurchaseUnit
  date: string
  ageDays: number
  stale: boolean
}

/**
 * What Inventory publishes to Menu Costing: one price per base unit with its
 * date. Menu Costing reads this stored copy and never calls a supplier.
 */
export const publishedPrices = (
  ingredients: Ingredient[],
  prices: PriceRecord[],
  asOf: string,
  staleAfterDays: number,
): Map<string, PublishedPrice> => {
  const out = new Map<string, PublishedPrice>()
  for (const ing of ingredients) {
    const rec = priceOn(prices, ing.id, asOf)
    if (!rec) continue
    const ageDays = daysBetween(rec.date, asOf)
    out.set(ing.id, {
      ingredientId: ing.id,
      name: ing.name,
      baseUnit: ing.baseUnit,
      price: D(rec.price),
      purchaseUnit: ing.purchaseUnit,
      pricePerBaseUnit: toBaseUnitPrice(D(rec.price), ing.purchaseUnit),
      date: rec.date,
      ageDays,
      stale: ageDays > staleAfterDays,
    })
  }
  return out
}

export interface PriceCheck {
  level: 'ok' | 'warning' | 'error'
  message: string
  ratio?: number
}

/**
 * Guards against the classic unit mistake (price per gram typed as price per
 * kilogram): a jump of 5x or more against the previous price is flagged and
 * must be confirmed; 500x or more looks like a x1000 slip.
 */
export const checkNewPrice = (previous: Dec | undefined, next: Dec, unit: PurchaseUnit): PriceCheck => {
  if (next.lte(0)) return { level: 'error', message: 'Price must be greater than zero.' }
  if (!previous) return { level: 'ok', message: 'First price for this ingredient.' }
  const ratio = next.div(previous).toNumber()
  if (ratio >= 500 || ratio <= 1 / 500)
    return {
      level: 'warning',
      ratio,
      message: `This is ${ratio >= 1 ? Math.round(ratio) + '×' : '1/' + Math.round(1 / ratio)} the previous price. Did you enter the price per ${ratio >= 1 ? 'g instead of ' + unit : unit + ' instead of per g'}? Looks like a ×1000 unit error.`,
    }
  if (ratio >= 5 || ratio <= 0.2)
    return {
      level: 'warning',
      ratio,
      message: `Unusual change: ${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}% against the previous price. Check the unit (${unit}) before saving.`,
    }
  return { level: 'ok', ratio, message: `${ratio >= 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(1)}% against the previous price.` }
}

export const isLowStock = (ing: Ingredient) => ing.stock <= ing.reorderLevel
