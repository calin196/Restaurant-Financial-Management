import { useMemo } from 'react'
import { workforceStore } from './store'
import { useIdentityState } from './sliceHooks'
import { validateRoster } from '../domain/workforce/workforce'
import { startOfWeek } from '../domain/shared/dates'

/** Published rates and payroll totals by role contain no employee records. */
export function getWorkforcePublication() {
  const { roles, labourBookings } = workforceStore.get()
  return { roles, labourBookings }
}

export function useWorkforcePublication() {
  const slice = workforceStore.useSlice()
  return useMemo(getWorkforcePublication, [slice])
}

export function getRosterStatus(week: string) {
  const { shifts, employees, rosterWeeks } = workforceStore.get()
  return {
    violationCount: validateRoster(week, shifts, employees).filter((w) => w.severity === 'violation').length,
    published: rosterWeeks.find((w) => w.weekStart === week)?.published ?? false,
  }
}

export function useRosterStatus(week: string) {
  const slice = workforceStore.useSlice()
  return useMemo(() => getRosterStatus(week), [slice, week])
}

export function getEmployeeDirectory() {
  const { employees, roles } = workforceStore.get()
  return employees.filter((e) => !e.archived).map((e) => ({
    id: e.id, name: e.name, roleName: roles.find((r) => r.id === e.roleId)?.name ?? '',
  }))
}

export function useEmployeeDirectory() {
  const slice = workforceStore.useSlice()
  return useMemo(getEmployeeDirectory, [slice])
}

/** Select before publishing: own profile, own published shifts, no personal wage. */
export function getOwnSchedule(employeeId: string | null) {
  const { employees, roles, shifts, rosterWeeks } = workforceStore.get()
  const employee = employees.find((e) => e.id === employeeId && !e.archived)
  const publishedWeeks = rosterWeeks.filter((w) => w.published).map((w) => w.weekStart)
  return {
    me: employee ? { name: employee.name, contractHours: employee.contractHours,
      roleName: roles.find((r) => r.id === employee.roleId)?.name } : undefined,
    publishedWeeks,
    shifts: employee ? shifts.filter((s) => s.employeeId === employee.id && publishedWeeks.includes(startOfWeek(s.date)))
      .map(({ id, date, start, end }) => ({ id, date, start, end })) : [],
  }
}

export function useOwnSchedule() {
  const { session } = useIdentityState()
  const slice = workforceStore.useSlice()
  return useMemo(() => getOwnSchedule(session.role === 'employee' ? session.employeeId : null), [slice, session])
}
