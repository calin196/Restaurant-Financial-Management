// State of the whole prototype, split by bounded context. Each context owns its
// own slice; other contexts only read what a context publishes (see the
// projections in each context folder), never its internal records.

// ---------- G. Identity & Access ----------
export type Role = 'manager' | 'employee' | 'accountant'

export interface Session {
  role: Role
  employeeId: string | null // set when role === 'employee'
}

export interface AccessLogEntry {
  id: string
  at: string
  role: Role
  resource: string
  allowed: boolean
}

// ---------- C. Inventory & Procurement ----------
export type BaseUnit = 'g' | 'ml' | 'pcs'
export type PurchaseUnit = 'kg' | 'g' | 'L' | 'ml' | 'pcs'

export interface Supplier {
  id: string
  name: string
  contact: string
}

export interface Ingredient {
  id: string
  name: string
  category: string
  baseUnit: BaseUnit
  purchaseUnit: PurchaseUnit
  supplierId: string
  stock: number // in base units
  reorderLevel: number // in base units
  archived: boolean
}

// Prices are never overwritten: every change is a new dated record.
export interface PriceRecord {
  id: string
  ingredientId: string
  date: string
  price: string // per purchase unit, exact decimal as string
  source: 'manual' | 'invoice' | 'seed'
  note?: string
}

// ---------- A. Menu Costing & Profitability ----------
export type VatCategory = 'food' | 'alcohol'
export type AllocationPolicy = 'perPortion' | 'revenueShare' | 'prepMinute'

export interface RecipeLine {
  ingredientId: string
  quantity: number // base units per portion, as served
  yieldPct: number // usable share after trimming / cooking loss
}

export interface MenuItemVersion {
  validFrom: string
  grossPrice: string // incl. VAT
  vatCategory: VatCategory
  recipe: RecipeLine[]
  prepMinutes: number
  prepIsEstimate: boolean
  labourRoleId: string
  note?: string
}

export interface MenuItem {
  id: string
  name: string
  category: 'Starter' | 'Main' | 'Dessert' | 'Drink'
  versions: MenuItemVersion[] // oldest first, the last one is current
  archived: boolean
}

// ---------- B. Sales ----------
export interface SaleRecord {
  id: string
  date: string
  menuItemId: string
  quantity: number
  grossUnitPrice: string
  vatRate: number
  source: 'manual' | 'csv' | 'pos'
}

// ---------- D. Workforce ----------
export interface LabourRole {
  id: string
  name: string
  ratePerHour: string // employer cost per hour, aggregated per role
}

export interface Employee {
  id: string
  name: string
  roleId: string
  contractHours: number
  hourlyWage: string // gross, private to Workforce
  isMinor: boolean
  archived: boolean
}

export interface Shift {
  id: string
  employeeId: string
  date: string
  start: string // HH:MM
  end: string // HH:MM, may be past midnight (end < start)
  actualStart?: string
  actualEnd?: string
}

export interface RosterWeek {
  weekStart: string
  published: boolean
  publishedAt?: string
  acknowledgedWarnings?: string[]
}

export interface LabourBooking {
  id: string
  month: string
  roleId: string
  amount: string
  source: 'payroll' | 'manual'
}

// ---------- E. Finance & Expenses ----------
export type CostKind = 'general' | 'external'

export interface CostEntry {
  id: string
  name: string
  kind: CostKind
  category: string
  amount: string // net amount for the whole covered range
  fromMonth: string
  toMonth: string // spread evenly over fromMonth..toMonth
  archived: boolean
  createdAt: string
}

export interface Budget {
  category: BudgetCategory
  monthly: string
}

export type BudgetCategory = 'Ingredients' | 'Labour' | 'Rent' | 'Utilities' | 'External services' | 'Other general'

export interface PeriodSnapshot {
  revenue: string
  cogs: string
  labour: string
  overhead: string
  profit: string
  portions: number
  vat: { rate: number; net: string; vat: string }[]
}

export interface Period {
  month: string
  status: 'open' | 'closed'
  closedAt?: string
  snapshot?: PeriodSnapshot
}

// ---------- F. Insights & Advisory ----------
export interface SuggestionDecision {
  id: string
  suggestionKey: string
  title: string
  decision: 'accepted' | 'rejected'
  at: string
  confidence: number
}

// ---------- Domain events (event-based domain model) ----------
export type ContextName = 'Menu Costing' | 'Sales' | 'Inventory' | 'Workforce' | 'Finance' | 'Insights' | 'Identity'

export interface DomainEvent {
  id: string
  at: string
  type: string
  context: ContextName
  summary: string
}

export interface Settings {
  restaurantName: string
  allocationPolicy: AllocationPolicy
  staleAfterDays: number
  flags: {
    trueCostView: boolean // E2
    inventoryAlerts: boolean // E5
    aiSuggestions: boolean // E4
    posIntegration: boolean // phase 2
  }
  posOutage: boolean // S7 simulation
  lastPosSync: string
}

// ---------- Per-module state slices (Experiment 1 – split state) ----------
// Each bounded context owns its slice; only that module reads or writes it.
// This is the in-process equivalent of "own schema" from the concept architecture.

export interface SharedState {
  schemaVersion: number
  settings: Settings
  events: DomainEvent[]
}

export interface IdentityState {
  session: Session
  accessLog: AccessLogEntry[]
}

export interface InventoryState {
  suppliers: Supplier[]
  ingredients: Ingredient[]
  prices: PriceRecord[]
}

export interface MenuCostingState {
  menuItems: MenuItem[]
}

export interface SalesState {
  sales: SaleRecord[]
}

export interface WorkforceState {
  roles: LabourRole[]
  employees: Employee[]
  shifts: Shift[]
  rosterWeeks: RosterWeek[]
  labourBookings: LabourBooking[]
}

export interface FinanceState {
  costs: CostEntry[]
  budgets: Budget[]
  periods: Period[]
}

export interface InsightsState {
  decisions: SuggestionDecision[]
}

// Full snapshots are restricted to seed construction, export and store composition.
// Pure selectors declare only the fields they need; pages use owned slices.
export interface AppState extends
  SharedState,
  IdentityState,
  InventoryState,
  MenuCostingState,
  SalesState,
  WorkforceState,
  FinanceState,
  InsightsState {}
