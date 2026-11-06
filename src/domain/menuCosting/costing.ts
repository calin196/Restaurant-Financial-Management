import { D, ZERO, cents, netFromGross, sum, type Dec } from '../shared/money'
import type { PublishedPrice } from '../inventory/inventory'
import type { AllocationPolicy, MenuItem, MenuItemVersion, VatCategory } from '../types'

// Menu Costing & Profitability: the core domain.
// True cost of a dish = ingredient cost + labour cost + overhead allocation.
// It calculates only from stored copies published by other contexts, so it
// works when they (or their external systems) are down, and a result can
// always be reproduced from its recorded inputs.

// VAT rates stored as dated data (Netherlands): reduced rate for food and
// non-alcoholic drinks, standard rate for alcohol.
export const VAT_RATES: Record<VatCategory, number> = { food: 9, alcohol: 21 }

export const POLICY_LABELS: Record<AllocationPolicy, { name: string; short: string; explain: string }> = {
  perPortion: {
    name: 'Per portion',
    short: 'Equal share per portion sold',
    explain: 'The overhead pool is divided equally over every portion sold. Simple, but cheap items carry as much rent as expensive ones.',
  },
  revenueShare: {
    name: 'Revenue share',
    short: 'Share of net revenue',
    explain: 'Each dish carries overhead in proportion to the net revenue it brings in. Expensive dishes carry more.',
  },
  prepMinute: {
    name: 'Prep minute',
    short: 'Share of kitchen/bar minutes',
    explain: 'Overhead follows preparation time: dishes that occupy the kitchen longer carry more of the rent and energy.',
  },
}

export const currentVersion = (item: MenuItem): MenuItemVersion => item.versions[item.versions.length - 1]

export const versionOn = (item: MenuItem, date: string): MenuItemVersion =>
  [...item.versions].reverse().find((v) => v.validFrom <= date) ?? item.versions[0]

/** Inputs Menu Costing receives from the other contexts (customer/supplier relationships). */
export interface CostingInputs {
  prices: Map<string, PublishedPrice> // from Inventory: price per base unit + date
  labourRates: Map<string, { roleName: string; rate: Dec }> // from Workforce: per role only
  overheadPool: Dec // from Finance: OverheadPoolClosed for the basis month
  portionsSold: Map<string, number> // from Sales: ItemsSold for the basis month
  basisMonth: string
  policy: AllocationPolicy
}

export interface IngredientLineCost {
  ingredientId: string
  name: string
  quantity: number
  unit: string
  yieldPct: number
  pricePerBaseUnit: Dec | null
  purchasePrice: Dec | null
  purchaseUnit: string | null
  priceDate: string | null
  ageDays: number | null
  stale: boolean
  cost: Dec // exact, before rounding
}

export interface CostBreakdown {
  itemId: string
  name: string
  category: MenuItem['category']
  version: MenuItemVersion
  grossPrice: Dec
  vatRate: number
  netPrice: Dec
  ingredients: IngredientLineCost[]
  missingPrices: string[]
  ingredientCost: Dec
  labour: { roleName: string; rate: Dec; minutes: number; estimate: boolean; cost: Dec }
  overhead: { policy: AllocationPolicy; pool: Dec; formula: string; cost: Dec }
  trueCost: Dec
  margin: Dec
  marginPct: number
  foodCostPct: number
  labourPct: number
  foodOnlyMargin: Dec
  portions: number
  periodProfit: Dec
  periodRevenue: Dec
  staleInputs: number
  oldestPriceDays: number
}

interface OverheadBasis {
  totalPortions: number
  totalNetRevenue: Dec
  totalPrepMinutes: number
}

const overheadBasis = (items: MenuItem[], inputs: CostingInputs): OverheadBasis => {
  let totalPortions = 0
  let totalNetRevenue = ZERO
  let totalPrepMinutes = 0
  for (const item of items) {
    const v = currentVersion(item)
    const n = inputs.portionsSold.get(item.id) ?? 0
    totalPortions += n
    totalNetRevenue = totalNetRevenue.plus(cents(netFromGross(v.grossPrice, VAT_RATES[v.vatCategory])).times(n))
    totalPrepMinutes += v.prepMinutes * n
  }
  return { totalPortions, totalNetRevenue, totalPrepMinutes }
}

const fmt = (d: Dec, dp = 2) => '€' + d.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const allocateOverhead = (
  v: MenuItemVersion,
  netPrice: Dec,
  basis: OverheadBasis,
  inputs: CostingInputs,
): { cost: Dec; formula: string } => {
  const pool = inputs.overheadPool
  switch (inputs.policy) {
    case 'perPortion': {
      if (basis.totalPortions === 0) return { cost: ZERO, formula: 'No portions sold in basis month' }
      return {
        cost: cents(pool.div(basis.totalPortions)),
        formula: `${fmt(pool)} pool ÷ ${basis.totalPortions.toLocaleString('en-IE')} portions sold`,
      }
    }
    case 'revenueShare': {
      if (basis.totalNetRevenue.isZero()) return { cost: ZERO, formula: 'No revenue in basis month' }
      return {
        cost: cents(pool.times(netPrice).div(basis.totalNetRevenue)),
        formula: `${fmt(pool)} pool × ${fmt(netPrice)} net price ÷ ${fmt(basis.totalNetRevenue, 0)} net revenue`,
      }
    }
    case 'prepMinute': {
      if (basis.totalPrepMinutes === 0) return { cost: ZERO, formula: 'No prep minutes in basis month' }
      return {
        cost: cents(pool.times(v.prepMinutes).div(basis.totalPrepMinutes)),
        formula: `${fmt(pool)} pool × ${v.prepMinutes} min ÷ ${basis.totalPrepMinutes.toLocaleString('en-IE')} prep minutes`,
      }
    }
  }
}

export const costDish = (
  item: MenuItem,
  inputs: CostingInputs,
  basis: OverheadBasis,
  override?: Partial<Pick<MenuItemVersion, 'grossPrice' | 'prepMinutes'>>,
): CostBreakdown => {
  const v = { ...currentVersion(item), ...override }
  const vatRate = VAT_RATES[v.vatCategory]
  const grossPrice = D(v.grossPrice)
  const netPrice = cents(netFromGross(grossPrice, vatRate))

  const missingPrices: string[] = []
  const ingredients: IngredientLineCost[] = v.recipe.map((line) => {
    const p = inputs.prices.get(line.ingredientId)
    if (!p) missingPrices.push(line.ingredientId)
    // quantity as served ÷ yield = quantity purchased
    const cost = p ? p.pricePerBaseUnit.times(line.quantity).div(D(line.yieldPct).div(100)) : ZERO
    return {
      ingredientId: line.ingredientId,
      name: p?.name ?? line.ingredientId,
      quantity: line.quantity,
      unit: p?.baseUnit ?? '',
      yieldPct: line.yieldPct,
      pricePerBaseUnit: p?.pricePerBaseUnit ?? null,
      purchasePrice: p?.price ?? null,
      purchaseUnit: p?.purchaseUnit ?? null,
      priceDate: p?.date ?? null,
      ageDays: p?.ageDays ?? null,
      stale: p?.stale ?? false,
      cost,
    }
  })
  const ingredientCost = cents(sum(ingredients.map((l) => l.cost)))

  const rate = inputs.labourRates.get(v.labourRoleId)
  const labourCost = rate ? cents(rate.rate.times(v.prepMinutes).div(60)) : ZERO
  const labour = {
    roleName: rate?.roleName ?? 'Unknown role',
    rate: rate?.rate ?? ZERO,
    minutes: v.prepMinutes,
    estimate: v.prepIsEstimate,
    cost: labourCost,
  }

  const oh = allocateOverhead(v, netPrice, basis, inputs)
  const overhead = { policy: inputs.policy, pool: inputs.overheadPool, ...oh }

  const trueCost = ingredientCost.plus(labourCost).plus(overhead.cost)
  const margin = netPrice.minus(trueCost)
  const portions = inputs.portionsSold.get(item.id) ?? 0
  const pct = (x: Dec) => (netPrice.isZero() ? 0 : x.div(netPrice).times(100).toNumber())
  const ages = ingredients.map((l) => l.ageDays ?? 0)

  return {
    itemId: item.id,
    name: item.name,
    category: item.category,
    version: v,
    grossPrice,
    vatRate,
    netPrice,
    ingredients,
    missingPrices,
    ingredientCost,
    labour,
    overhead,
    trueCost,
    margin,
    marginPct: pct(margin),
    foodCostPct: pct(ingredientCost),
    labourPct: pct(labourCost),
    foodOnlyMargin: netPrice.minus(ingredientCost),
    portions,
    periodProfit: margin.times(portions),
    periodRevenue: netPrice.times(portions),
    staleInputs: ingredients.filter((l) => l.stale).length,
    oldestPriceDays: ages.length ? Math.max(...ages) : 0,
  }
}

/** DishProfitabilityCalculated for every active menu item. */
export const costMenu = (items: MenuItem[], inputs: CostingInputs): CostBreakdown[] => {
  const active = items.filter((i) => !i.archived)
  const basis = overheadBasis(active, inputs)
  return active.map((item) => costDish(item, inputs, basis))
}

/** What-if: same inputs and overhead basis, one dish with a changed price or prep time. */
export const whatIf = (
  items: MenuItem[],
  item: MenuItem,
  inputs: CostingInputs,
  override: Partial<Pick<MenuItemVersion, 'grossPrice' | 'prepMinutes'>>,
): CostBreakdown => costDish(item, inputs, overheadBasis(items.filter((i) => !i.archived), inputs), override)
