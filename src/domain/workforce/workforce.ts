import { D, type Dec } from '../shared/money'
import { addDays, toMinutes } from '../shared/dates'
import type { Employee, LabourRole, Shift } from '../types'

/** What Workforce publishes to Menu Costing: one employer-cost rate per role. Never per person. */
export const publishedLabourRates = (roles: LabourRole[]): Map<string, { roleName: string; rate: Dec }> =>
  new Map(roles.map((r) => [r.id, { roleName: r.name, rate: D(r.ratePerHour) }]))

export const shiftMinutes = (start: string, end: string): number => {
  const s = toMinutes(start)
  let e = toMinutes(end)
  if (e <= s) e += 24 * 60
  return e - s
}

export const shiftHours = (s: Pick<Shift, 'start' | 'end'>) => shiftMinutes(s.start, s.end) / 60

const absStart = (s: Shift) => Date.parse(`${s.date}T${s.start}:00Z`)
const absEnd = (s: Shift) => absStart(s) + shiftMinutes(s.start, s.end) * 60_000

// Working-time rules (Dutch Arbeidstijdenwet, simplified) stored as data so a
// change in law is a data change, not a code change.
export const WORKING_TIME_RULES = {
  maxShiftHours: 12,
  maxShiftHoursMinor: 9,
  maxWeekHours: 60,
  minRestHours: 11,
  breakAfterHours: 5.5,
  minorLatestEnd: '23:00',
}

export interface RosterWarning {
  key: string
  employeeId: string
  date?: string
  severity: 'violation' | 'notice'
  rule: string
  message: string
}

export const validateRoster = (weekStart: string, shifts: Shift[], employees: Employee[]): RosterWarning[] => {
  const R = WORKING_TIME_RULES
  const weekEnd = addDays(weekStart, 6)
  const out: RosterWarning[] = []
  for (const emp of employees) {
    // include the day before the week to check rest time across the boundary
    const own = shifts
      .filter((s) => s.employeeId === emp.id && s.date >= addDays(weekStart, -1) && s.date <= weekEnd)
      .sort((a, b) => absStart(a) - absStart(b))
    const inWeek = own.filter((s) => s.date >= weekStart)
    let weekHours = 0
    for (const s of inWeek) {
      const h = shiftHours(s)
      weekHours += h
      const max = emp.isMinor ? R.maxShiftHoursMinor : R.maxShiftHours
      if (h > max)
        out.push({
          key: `len-${s.id}`, employeeId: emp.id, date: s.date, severity: 'violation', rule: 'Maximum shift length',
          message: `${emp.name}: ${h.toFixed(1)} h shift exceeds the ${max} h maximum${emp.isMinor ? ' for employees under 18' : ''}.`,
        })
      if (emp.isMinor && (toMinutes(s.end) > toMinutes(R.minorLatestEnd) || toMinutes(s.end) < toMinutes(s.start)))
        out.push({
          key: `night-${s.id}`, employeeId: emp.id, date: s.date, severity: 'violation', rule: 'Night work (under 18)',
          message: `${emp.name} is under 18 and may not work after ${R.minorLatestEnd}.`,
        })
      // Break tracking is not implemented yet, so do not emit break notices.
    }
    for (let i = 1; i < own.length; i++) {
      const restH = (absStart(own[i]) - absEnd(own[i - 1])) / 3_600_000
      if (own[i].date >= weekStart && restH < R.minRestHours)
        out.push({
          key: `rest-${own[i].id}`, employeeId: emp.id, date: own[i].date, severity: 'violation', rule: 'Minimum rest',
          message: `${emp.name}: only ${restH.toFixed(1)} h rest before the shift on this day (minimum ${R.minRestHours} h).`,
        })
    }
    if (weekHours > R.maxWeekHours)
      out.push({
        key: `week-${emp.id}`, employeeId: emp.id, severity: 'violation', rule: 'Maximum weekly hours',
        message: `${emp.name}: ${weekHours.toFixed(1)} h planned this week, above the ${R.maxWeekHours} h maximum.`,
      })
    else if (weekHours > emp.contractHours * 1.2)
      out.push({
        key: `contract-${emp.id}`, employeeId: emp.id, severity: 'notice', rule: 'Above contract hours',
        message: `${emp.name}: ${weekHours.toFixed(1)} h planned against a ${emp.contractHours} h contract.`,
      })
  }
  return out
}

/** Shift labour cost for a role: hours x the role's employer cost rate (aggregated, no names). */
export const plannedCostByRole = (shifts: Shift[], employees: Employee[], roles: LabourRole[]) => {
  const byRole = new Map<string, { hours: number; cost: Dec }>()
  for (const r of roles) byRole.set(r.id, { hours: 0, cost: D(0) })
  for (const s of shifts) {
    const emp = employees.find((e) => e.id === s.employeeId)
    const role = roles.find((r) => r.id === emp?.roleId)
    if (!emp || !role) continue
    const entry = byRole.get(role.id)!
    const h = shiftHours(s)
    entry.hours += h
    entry.cost = entry.cost.plus(D(role.ratePerHour).times(h))
  }
  return byRole
}
