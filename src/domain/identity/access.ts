import type { Role } from '../types'

// Identity & Access: role-based access. Wages live only in Workforce and only
// the manager may see them; every denied attempt is logged.
export type Resource =
  | 'dashboard' | 'menu' | 'inventory' | 'sales' | 'roster' | 'wages' | 'myschedule'
  | 'finance' | 'finance.write' | 'export' | 'insights' | 'settings' | 'activity'

const MATRIX: Record<Role, Resource[]> = {
  manager: ['dashboard', 'menu', 'inventory', 'sales', 'roster', 'wages', 'finance', 'finance.write', 'export', 'insights', 'settings', 'activity'],
  employee: ['myschedule'],
  accountant: ['finance', 'export'],
}

export const can = (role: Role, resource: Resource) => MATRIX[role].includes(resource)

export const ROLE_LABELS: Record<Role, string> = {
  manager: 'Manager',
  employee: 'Employee',
  accountant: 'Accountant (read-only)',
}
