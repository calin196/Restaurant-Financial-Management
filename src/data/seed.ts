import { addDays, daysBetween, monthDays, monthOf, startOfWeek, weekday, TODAY } from '../domain/shared/dates'
import type {
  AppState, CostEntry, Employee, Ingredient, LabourBooking, MenuItem, PriceRecord, RecipeLine, SaleRecord, Shift,
} from '../domain/types'
import { VAT_RATES, versionOn } from '../domain/menuCosting/costing'

// Demo restaurant "Bistro De Haven". September 2026 reproduces the worked
// example in the report (Bounded Contexts 3.5): 4,500 portions, a €9,000
// overhead pool, shrimp up from €18.00 to €23.40/kg and a seafood risotto that
// loses €0.80 per portion once labour and overhead are allocated.

const SEED_TODAY = '2026-10-06'
const SHIFT_DAYS = daysBetween(SEED_TODAY, TODAY)
const shiftDate = (date: string): string => addDays(date, SHIFT_DAYS)
const shiftMonth = (month: string): string => monthOf(shiftDate(`${month}-01`))
const shiftTimestamp = (timestamp: string): string => `${shiftDate(timestamp.slice(0, 10))}${timestamp.slice(10)}`

const suppliers = [
  { id: 'sup-noordzee', name: 'Noordzee Vis B.V.', contact: 'orders@noordzeevis.example' },
  { id: 'sup-hanos', name: 'Groothandel Hanos', contact: 'service@hanos.example' },
  { id: 'sup-boer', name: 'Boerderij Het Groene Veld', contact: '+31 6 1234 5678' },
  { id: 'sup-wijn', name: 'Wijnhandel Van Dam', contact: 'info@vandamwijn.example' },
]

type IngSeed = [id: string, name: string, category: string, base: Ingredient['baseUnit'], unit: Ingredient['purchaseUnit'], supplier: string, prices: [string, string][], stock: number, reorder: number]

const ING: IngSeed[] = [
  ['shrimp', 'Shrimp (peeled)', 'Fish & seafood', 'g', 'kg', 'sup-noordzee', [['2026-05-04', '17.60'], ['2026-07-01', '18.00'], ['2026-09-09', '23.40']], 4200, 3000],
  ['mussels', 'Mussels', 'Fish & seafood', 'g', 'kg', 'sup-noordzee', [['2026-06-01', '9.20'], ['2026-09-09', '9.50']], 6000, 4000],
  ['squid', 'Squid rings', 'Fish & seafood', 'g', 'kg', 'sup-noordzee', [['2026-06-01', '13.20'], ['2026-09-09', '14.00']], 3500, 2000],
  ['salmon', 'Salmon fillet', 'Fish & seafood', 'g', 'kg', 'sup-noordzee', [['2026-05-04', '22.00'], ['2026-08-03', '24.50'], ['2026-09-21', '26.00']], 5200, 4000],
  ['fishstock', 'Fish stock', 'Pantry', 'ml', 'L', 'sup-hanos', [['2026-06-15', '5.80'], ['2026-09-14', '6.00']], 18000, 10000],
  ['arborio', 'Arborio rice', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-04-10', '3.90'], ['2026-09-14', '4.20']], 12000, 5000],
  ['saffron', 'Saffron', 'Pantry', 'g', 'g', 'sup-hanos', [['2026-07-20', '8.30']], 14, 10],
  ['flour', 'Pizza flour (tipo 00)', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-05-11', '1.05'], ['2026-09-14', '1.10']], 50000, 25000],
  ['passata', 'Tomato passata', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-09-14', '2.40']], 22000, 10000],
  ['oliveoil', 'Olive oil (extra virgin)', 'Pantry', 'ml', 'L', 'sup-hanos', [['2026-03-02', '8.40'], ['2026-09-14', '9.50']], 15000, 8000],
  ['sugar', 'Sugar', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-09-14', '1.10']], 9000, 4000],
  ['ladyfingers', 'Ladyfingers', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-08-10', '7.20']], 3000, 2000],
  ['croutons', 'Croutons', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-09-14', '6.00']], 2500, 1500],
  ['bun', 'Brioche burger bun', 'Bakery', 'pcs', 'pcs', 'sup-hanos', [['2026-06-01', '0.42'], ['2026-09-14', '0.45']], 160, 120],
  ['coffee', 'Espresso beans', 'Pantry', 'g', 'kg', 'sup-hanos', [['2026-04-01', '19.50'], ['2026-09-14', '22.00']], 9000, 5000],
  ['parmesan', 'Parmigiano Reggiano', 'Dairy', 'g', 'kg', 'sup-hanos', [['2026-06-01', '27.00'], ['2026-09-14', '28.00']], 4000, 2500],
  ['butter', 'Butter', 'Dairy', 'g', 'kg', 'sup-hanos', [['2026-09-14', '11.00']], 6000, 4000],
  ['mozzarella', 'Mozzarella fior di latte', 'Dairy', 'g', 'kg', 'sup-hanos', [['2026-06-01', '9.40'], ['2026-09-14', '9.80']], 14000, 10000],
  ['cheddar', 'Aged cheddar', 'Dairy', 'g', 'kg', 'sup-hanos', [['2026-09-14', '12.00']], 3000, 2000],
  ['mascarpone', 'Mascarpone', 'Dairy', 'g', 'kg', 'sup-hanos', [['2026-09-14', '8.50']], 5000, 4000],
  ['cream', 'Cream (35%)', 'Dairy', 'ml', 'L', 'sup-hanos', [['2026-09-14', '4.80']], 8000, 5000],
  ['eggs', 'Free-range eggs', 'Dairy', 'pcs', 'pcs', 'sup-boer', [['2026-09-07', '0.28']], 180, 150],
  ['beef', 'Beef mince (dry-aged)', 'Meat', 'g', 'kg', 'sup-boer', [['2026-06-01', '12.80'], ['2026-09-07', '13.50']], 16000, 12000],
  ['chicken', 'Chicken breast', 'Meat', 'g', 'kg', 'sup-boer', [['2026-09-07', '10.50']], 7000, 5000],
  ['basil', 'Fresh basil', 'Vegetables & herbs', 'g', 'kg', 'sup-boer', [['2026-06-15', '24.00']], 800, 500],
  ['potatoes', 'Potatoes', 'Vegetables & herbs', 'g', 'kg', 'sup-boer', [['2026-09-07', '1.20']], 40000, 25000],
  ['romaine', 'Romaine lettuce', 'Vegetables & herbs', 'g', 'kg', 'sup-boer', [['2026-09-07', '3.80']], 6000, 5000],
  ['asparagus', 'Green asparagus', 'Vegetables & herbs', 'g', 'kg', 'sup-boer', [['2026-09-07', '9.00']], 3500, 3000],
  ['mushrooms', 'Chestnut mushrooms', 'Vegetables & herbs', 'g', 'kg', 'sup-boer', [['2026-09-07', '6.50']], 9000, 6000],
  ['lemon', 'Lemons', 'Vegetables & herbs', 'pcs', 'pcs', 'sup-boer', [['2026-09-07', '0.35']], 260, 300],
  ['redwine', 'House red wine', 'Drinks', 'ml', 'L', 'sup-wijn', [['2026-03-01', '7.60'], ['2026-09-09', '8.00']], 60000, 30000],
]

const ingredients: Ingredient[] = ING.map(([id, name, category, baseUnit, purchaseUnit, supplierId, , stock, reorderLevel]) => ({
  id, name, category, baseUnit, purchaseUnit, supplierId, stock, reorderLevel, archived: false,
}))

const prices: PriceRecord[] = ING.flatMap(([id, , , , , , history]) =>
  history.map(([date, price], i) => ({ id: `pr-${id}-${i}`, ingredientId: id, date: shiftDate(date), price, source: i === 0 ? 'seed' as const : 'invoice' as const })),
)

const r = (ingredientId: string, quantity: number, yieldPct = 100): RecipeLine => ({ ingredientId, quantity, yieldPct })

const menuItems: MenuItem[] = [
  {
    id: 'risotto', name: 'Seafood Risotto', category: 'Main', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '21.00', vatCategory: 'food', prepMinutes: 25, prepIsEstimate: true, labourRoleId: 'kitchen',
      recipe: [r('shrimp', 150), r('arborio', 90), r('mussels', 120), r('squid', 80), r('parmesan', 25), r('butter', 20), r('fishstock', 250), r('saffron', 0.04)],
    }],
  },
  {
    id: 'pizza', name: 'Margherita Pizza', category: 'Main', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '13.50', vatCategory: 'food', prepMinutes: 8, prepIsEstimate: false, labourRoleId: 'kitchen',
      recipe: [r('flour', 200), r('mozzarella', 120), r('passata', 80), r('basil', 3, 75), r('oliveoil', 10)],
    }],
  },
  {
    id: 'burger', name: 'Dry-aged Beef Burger', category: 'Main', archived: false,
    versions: [
      { validFrom: shiftDate('2026-03-01'), grossPrice: '16.50', vatCategory: 'food', prepMinutes: 12, prepIsEstimate: false, labourRoleId: 'kitchen',
        recipe: [r('beef', 180, 90), r('bun', 1), r('cheddar', 30), r('potatoes', 250, 85), r('oliveoil', 20)] },
      { validFrom: shiftDate('2026-08-01'), grossPrice: '17.50', vatCategory: 'food', prepMinutes: 12, prepIsEstimate: false, labourRoleId: 'kitchen', note: 'Price raised after beef increase',
        recipe: [r('beef', 180, 90), r('bun', 1), r('cheddar', 30), r('potatoes', 250, 85), r('oliveoil', 20)] },
    ],
  },
  {
    id: 'caesar', name: 'Chicken Caesar Salad', category: 'Starter', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '12.50', vatCategory: 'food', prepMinutes: 10, prepIsEstimate: false, labourRoleId: 'kitchen',
      recipe: [r('romaine', 150, 80), r('chicken', 120), r('parmesan', 15), r('croutons', 30), r('eggs', 1), r('oliveoil', 15)],
    }],
  },
  {
    id: 'salmon', name: 'Grilled Salmon & Asparagus', category: 'Main', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '24.50', vatCategory: 'food', prepMinutes: 18, prepIsEstimate: false, labourRoleId: 'kitchen',
      recipe: [r('salmon', 200, 95), r('asparagus', 120, 75), r('lemon', 0.5), r('butter', 20), r('potatoes', 150, 85)],
    }],
  },
  {
    id: 'soup', name: 'Mushroom Soup', category: 'Starter', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '8.00', vatCategory: 'food', prepMinutes: 7, prepIsEstimate: true, labourRoleId: 'kitchen',
      recipe: [r('mushrooms', 200, 90), r('cream', 60), r('butter', 15)],
    }],
  },
  {
    id: 'tiramisu', name: 'Tiramisu', category: 'Dessert', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '7.50', vatCategory: 'food', prepMinutes: 6, prepIsEstimate: false, labourRoleId: 'kitchen',
      recipe: [r('mascarpone', 80), r('ladyfingers', 40), r('eggs', 1), r('sugar', 20), r('coffee', 7)],
    }],
  },
  {
    id: 'lemonade', name: 'House Lemonade', category: 'Drink', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '4.50', vatCategory: 'food', prepMinutes: 3, prepIsEstimate: false, labourRoleId: 'bar',
      recipe: [r('lemon', 1.5), r('sugar', 30)],
    }],
  },
  {
    id: 'wine', name: 'House Red Wine (glass)', category: 'Drink', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '6.00', vatCategory: 'alcohol', prepMinutes: 1, prepIsEstimate: false, labourRoleId: 'bar',
      recipe: [r('redwine', 150)],
    }],
  },
  {
    id: 'espresso', name: 'Espresso', category: 'Drink', archived: false,
    versions: [{
      validFrom: shiftDate('2026-03-01'), grossPrice: '2.80', vatCategory: 'food', prepMinutes: 2, prepIsEstimate: false, labourRoleId: 'bar',
      recipe: [r('coffee', 8)],
    }],
  },
]

// Portions sold per month. September sums to exactly 4,500.
const MONTHLY: Record<string, Record<string, number>> = {
  '2026-07': { risotto: 290, pizza: 720, burger: 560, caesar: 340, salmon: 230, soup: 120, tiramisu: 380, lemonade: 820, wine: 690, espresso: 380 },
  '2026-08': { risotto: 305, pizza: 700, burger: 525, caesar: 330, salmon: 245, soup: 150, tiramisu: 395, lemonade: 760, wine: 705, espresso: 405 },
  '2026-09': { risotto: 320, pizza: 680, burger: 540, caesar: 310, salmon: 260, soup: 220, tiramisu: 410, lemonade: 600, wine: 720, espresso: 440 },
}
const SHIFTED_MONTHLY: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(MONTHLY).map(([month, totals]) => [shiftMonth(month), totals]),
)

const WEEKDAY_WEIGHT = [0.78, 0.82, 0.92, 1.02, 1.32, 1.52, 1.12]

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Spread a monthly total over days with weekday weights, keeping the exact total. */
const spread = (total: number, days: string[], rand: () => number): number[] => {
  const w = days.map((d) => WEEKDAY_WEIGHT[weekday(d)] * (0.88 + rand() * 0.24))
  const W = w.reduce((a, b) => a + b, 0)
  const raw = w.map((x) => (total * x) / W)
  const out = raw.map(Math.floor)
  let rest = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++
  return out
}

const buildSales = (): SaleRecord[] => {
  const rand = mulberry32(80)
  const out: SaleRecord[] = []
  const push = (date: string, itemId: string, quantity: number) => {
    if (quantity <= 0) return
    const item = menuItems.find((i) => i.id === itemId)!
    const v = versionOn(item, date)
    out.push({
      id: `s-${date}-${itemId}`, date, menuItemId: itemId, quantity,
      grossUnitPrice: v.grossPrice, vatRate: VAT_RATES[v.vatCategory], source: 'manual',
    })
  }
  for (const [month, totals] of Object.entries(SHIFTED_MONTHLY)) {
    const days = monthDays(month)
    for (const [itemId, total] of Object.entries(totals)) spread(total, days, rand).forEach((q, i) => push(days[i], itemId, q))
  }
  // October so far (1–5 Oct), at September's daily pace
  const octDays = monthDays(shiftMonth('2026-10')).filter((d) => d < TODAY)
  for (const [itemId, total] of Object.entries(MONTHLY['2026-09'])) {
    const all = spread(Math.round((total * 31) / 30), monthDays(shiftMonth('2026-10')), rand)
    octDays.forEach((d, i) => push(d, itemId, all[i]))
  }
  return out
}

const roles = [
  { id: 'kitchen', name: 'Kitchen', ratePerHour: '22.00' },
  { id: 'bar', name: 'Bar', ratePerHour: '19.00' },
  { id: 'service', name: 'Service', ratePerHour: '18.00' },
]

const employees: Employee[] = [
  { id: 'e-marco', name: 'Marco Rossi', roleId: 'kitchen', contractHours: 40, hourlyWage: '19.50', isMinor: false, archived: false },
  { id: 'e-lena', name: 'Lena de Vries', roleId: 'kitchen', contractHours: 36, hourlyWage: '16.00', isMinor: false, archived: false },
  { id: 'e-tom', name: 'Tom Bakker', roleId: 'kitchen', contractHours: 32, hourlyWage: '15.20', isMinor: false, archived: false },
  { id: 'e-aisha', name: 'Aisha Haddad', roleId: 'kitchen', contractHours: 24, hourlyWage: '14.40', isMinor: false, archived: false },
  { id: 'e-noah', name: 'Noah Jansen', roleId: 'bar', contractHours: 32, hourlyWage: '15.00', isMinor: false, archived: false },
  { id: 'e-sophie', name: 'Sophie Visser', roleId: 'bar', contractHours: 16, hourlyWage: '9.80', isMinor: true, archived: false },
  { id: 'e-emma', name: 'Emma Smit', roleId: 'service', contractHours: 38, hourlyWage: '16.50', isMinor: false, archived: false },
  { id: 'e-daan', name: 'Daan Mulder', roleId: 'service', contractHours: 28, hourlyWage: '14.50', isMinor: false, archived: false },
  { id: 'e-julia', name: 'Julia Meijer', roleId: 'service', contractHours: 16, hourlyWage: '14.20', isMinor: false, archived: false },
]

// Weekly pattern: [employee, weekday (Mon=0), start, end]
const PATTERN: [string, number, string, string][] = [
  ['e-marco', 1, '10:00', '19:00'], ['e-marco', 2, '10:00', '19:00'], ['e-marco', 3, '10:00', '19:00'], ['e-marco', 4, '14:00', '23:00'], ['e-marco', 5, '14:00', '23:00'],
  ['e-lena', 0, '14:00', '22:00'], ['e-lena', 3, '14:00', '22:00'], ['e-lena', 4, '15:00', '23:00'], ['e-lena', 5, '15:00', '23:00'], ['e-lena', 6, '12:00', '20:00'],
  ['e-tom', 0, '10:00', '18:00'], ['e-tom', 1, '14:00', '22:00'], ['e-tom', 2, '14:00', '22:00'], ['e-tom', 6, '14:00', '22:00'],
  ['e-aisha', 4, '17:00', '23:00'], ['e-aisha', 5, '12:00', '20:00'], ['e-aisha', 6, '12:00', '20:00'],
  ['e-noah', 2, '16:00', '24:00'], ['e-noah', 3, '16:00', '24:00'], ['e-noah', 4, '16:00', '24:00'], ['e-noah', 5, '16:00', '24:00'],
  ['e-sophie', 5, '12:00', '18:00'], ['e-sophie', 6, '12:00', '18:00'],
  ['e-emma', 0, '11:00', '19:00'], ['e-emma', 1, '11:00', '19:00'], ['e-emma', 3, '15:00', '23:00'], ['e-emma', 4, '15:00', '23:00'], ['e-emma', 5, '15:00', '23:00'],
  ['e-daan', 2, '17:00', '23:00'], ['e-daan', 4, '17:00', '23:00'], ['e-daan', 5, '12:00', '20:00'], ['e-daan', 6, '12:00', '20:00'],
  ['e-julia', 5, '17:00', '23:00'], ['e-julia', 6, '17:00', '23:00'],
]

const fixTime = (t: string) => (t === '24:00' ? '00:00' : t)

const buildShifts = (): Shift[] => {
  const out: Shift[] = []
  const currentWeek = startOfWeek(TODAY)
  const weeks = [addDays(currentWeek, -14), addDays(currentWeek, -7), currentWeek]
  for (const ws of weeks) {
    for (const [employeeId, wd, start, end] of PATTERN) {
      const date = addDays(ws, wd)
      const past = date < TODAY
      out.push({
        id: `sh-${employeeId}-${date}`, employeeId, date, start, end: fixTime(end),
        ...(past ? { actualStart: start, actualEnd: fixTime(end) } : {}),
      })
    }
  }
  // Seeded issues in the draft week so the roster warnings are visible (S12):
  // Lena closes Friday at 23:00 and is planned to open on Saturday at 08:00,
  // and Sophie (17) is planned until 23:30 on Saturday.
  const lenaSat = out.find((s) => s.id === `sh-e-lena-${addDays(currentWeek, 5)}`)!
  lenaSat.start = '08:00'; lenaSat.end = '16:00'
  const sophieSat = out.find((s) => s.id === `sh-e-sophie-${addDays(currentWeek, 5)}`)!
  sophieSat.start = '17:00'; sophieSat.end = '23:30'
  return out
}

const labourBookings: LabourBooking[] = [
  ['2026-07', '9650', '3050', '5480'], ['2026-08', '9720', '3120', '5390'], ['2026-09', '9800', '3100', '5600'],
].flatMap(([month, k, b, s]) => [
  { id: `lb-${shiftMonth(month)}-kitchen`, month: shiftMonth(month), roleId: 'kitchen', amount: k, source: 'payroll' as const },
  { id: `lb-${shiftMonth(month)}-bar`, month: shiftMonth(month), roleId: 'bar', amount: b, source: 'payroll' as const },
  { id: `lb-${shiftMonth(month)}-service`, month: shiftMonth(month), roleId: 'service', amount: s, source: 'payroll' as const },
])

const cost = (id: string, name: string, kind: CostEntry['kind'], category: string, amount: string, fromMonth: string, toMonth: string): CostEntry =>
  ({ id, name, kind, category, amount, fromMonth, toMonth, archived: false, createdAt: shiftDate(fromMonth + '-01') })

// September: 5,200 + 1,600 + 300 + 400 + 250 + 750 + 500 = €9,000 overhead pool
const costs: CostEntry[] = [
  cost('c-rent', 'Rent 2026', 'general', 'Rent', '62400.00', shiftMonth('2026-01'), shiftMonth('2026-12')),
  cost('c-insurance', 'Business insurance 2026', 'general', 'Insurance', '4800.00', shiftMonth('2026-01'), shiftMonth('2026-12')),
  cost('c-energy-07', 'Energy bill July', 'general', 'Energy', '1680.00', shiftMonth('2026-07'), shiftMonth('2026-07')),
  cost('c-energy-08', 'Energy bill August', 'general', 'Energy', '1750.00', shiftMonth('2026-08'), shiftMonth('2026-08')),
  cost('c-energy-09', 'Energy bill September', 'general', 'Energy', '1600.00', shiftMonth('2026-09'), shiftMonth('2026-09')),
  cost('c-water-q3', 'Water Q3', 'general', 'Water', '900.00', shiftMonth('2026-07'), shiftMonth('2026-09')),
  cost('c-water-q4', 'Water Q4', 'general', 'Water', '900.00', shiftMonth('2026-10'), shiftMonth('2026-12')),
  cost('c-software', 'POS & software subscriptions', 'external', 'Subscriptions', '3000.00', shiftMonth('2026-01'), shiftMonth('2026-12')),
  cost('c-cleaning', 'Cleaning service contract', 'external', 'Cleaning', '9000.00', shiftMonth('2026-01'), shiftMonth('2026-12')),
  cost('c-repair-09', 'Emergency repair: walk-in cooler', 'external', 'Repairs', '500.00', shiftMonth('2026-09'), shiftMonth('2026-09')),
]

export const buildSeed = (): AppState => ({
  schemaVersion: 1,
  settings: {
    restaurantName: 'Bistro De Haven',
    allocationPolicy: 'perPortion',
    staleAfterDays: 30,
    flags: { trueCostView: true, inventoryAlerts: true, aiSuggestions: true, posIntegration: false },
    posOutage: false,
    lastPosSync: shiftTimestamp('2026-10-05T23:10:00'),
  },
  session: { role: 'manager', employeeId: null },
  suppliers,
  ingredients,
  prices,
  menuItems,
  sales: buildSales(),
  roles,
  employees,
  shifts: buildShifts(),
  rosterWeeks: [
    { weekStart: startOfWeek(shiftDate('2026-09-21')), published: true, publishedAt: shiftTimestamp('2026-09-16T17:00:00') },
    { weekStart: startOfWeek(shiftDate('2026-09-28')), published: true, publishedAt: shiftTimestamp('2026-09-23T16:30:00') },
    { weekStart: startOfWeek(shiftDate('2026-10-05')), published: false },
  ],
  labourBookings,
  costs,
  budgets: [
    { category: 'Ingredients', monthly: '11500.00' },
    { category: 'Labour', monthly: '18000.00' },
    { category: 'Rent', monthly: '5200.00' },
    { category: 'Utilities', monthly: '2000.00' },
    { category: 'External services', monthly: '1200.00' },
    { category: 'Other general', monthly: '500.00' },
  ],
  periods: [
    { month: shiftMonth('2026-07'), status: 'closed', closedAt: shiftTimestamp('2026-08-04T10:12:00') },
    { month: shiftMonth('2026-08'), status: 'closed', closedAt: shiftTimestamp('2026-09-03T09:40:00') },
    { month: shiftMonth('2026-09'), status: 'open' },
    { month: shiftMonth('2026-10'), status: 'open' },
  ],
  decisions: [],
  events: [
    { id: 'ev-seed-1', at: shiftTimestamp('2026-09-09T08:14:00'), type: 'IngredientPriceChanged', context: 'Inventory', summary: 'Shrimp (peeled): €18.00 → €23.40 per kg (invoice Noordzee Vis)' },
    { id: 'ev-seed-2', at: shiftTimestamp('2026-09-03T09:40:00'), type: 'PeriodClosed', context: 'Finance', summary: 'August 2026 closed and locked' },
    { id: 'ev-seed-3', at: shiftTimestamp('2026-09-21T07:55:00'), type: 'IngredientPriceChanged', context: 'Inventory', summary: 'Salmon fillet: €24.50 → €26.00 per kg' },
    { id: 'ev-seed-4', at: shiftTimestamp('2026-09-23T16:30:00'), type: 'RosterPublished', context: 'Workforce', summary: 'Roster for week of 19 Oct published' },
    { id: 'ev-seed-5', at: shiftTimestamp('2026-10-01T09:00:00'), type: 'LabourCostBooked', context: 'Workforce', summary: 'September labour imported from payroll: €18,500.00 (3 roles)' },
    { id: 'ev-seed-6', at: shiftTimestamp('2026-10-05T23:10:00'), type: 'SaleRecorded', context: 'Sales', summary: 'Daily sales entered for 28 Oct 2026' },
  ],
  accessLog: [],
})
