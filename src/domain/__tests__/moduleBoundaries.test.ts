import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['../*/**/*.ts', '!../__tests__/*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const presentation = import.meta.glob(['../../pages/*.tsx', '../../ui/*.tsx', '../../ui/*.ts', '../../main.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const stateSources = import.meta.glob('../../state/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ALLOWED: Record<string, string[]> = {
  menuCosting: ['inventory', 'workforce', 'finance', 'sales'],
  insights: ['menuCosting', 'sales', 'inventory', 'workforce', 'finance'],
  sales: ['menuCosting'], inventory: [], workforce: [], finance: [], identity: [], shared: [],
}
const moduleOf = (path: string) => path.split('/')[1]

// Source-level guard, including aliases, quote styles, namespace imports,
// re-exports and literal dynamic imports. Runtime access control is out of scope.
function imports(_path: string, source: string) {
  const out: { target: string; names: string[] }[] = []
  const declarations = /(?:import|export)\s+(?:type\s+)?(\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s*['"]([^'"]+)['"]/g
  for (const m of source.matchAll(declarations)) {
    const names = m[1].includes('*') || !m[1].startsWith('{') ? ['*']
      : m[1].slice(1, -1).split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean)
    out.push({ target: m[2], names })
  }
  for (const m of source.matchAll(/(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g)) out.push({ target: m[1], names: ['*'] })
  return out
}

function domainViolations(files: Record<string, string>) {
  return Object.entries(files).flatMap(([path, src]) => {
    const from = moduleOf(path)
    const errors: string[] = []
    for (const i of imports(path, src)) {
      const to = i.target.startsWith('../') ? i.target.slice(3).split('/')[0] : from
      if (!['types', 'shared', from, ...ALLOWED[from]].includes(to)) errors.push(`${path}: forbidden dependency ${to}`)
      if (from !== 'workforce' && i.names.includes('Employee')) errors.push(`${path}: employee type`)
      if (i.names.includes('AppState')) errors.push(`${path}: whole state`)
    }
    if (from !== 'workforce' && /\b\w+\.Employee\b/.test(src)) errors.push(`${path}: employee type`)
    if (from !== 'workforce' && /\bhourlyWage\b/.test(src)) errors.push(`${path}: personal wage`)
    if (/\bAppState\b/.test(src)) errors.push(`${path}: whole state`)
    return errors
  })
}

// Shared settings/event history are allowed everywhere; other raw slices belong
// to the owning page. Cross-context data must use the published query adapter.
const PAGE_SLICES: Record<string, string[]> = {
  WorkforcePage: ['useWorkforceState'], InventoryPage: ['useInventoryState'],
  MenuPage: ['useMenuState'], DishPage: ['useMenuState'], SalesPage: ['useSalesState'],
  InsightsPage: ['useInsightsState'], FinancePage: ['useFinanceState', 'useIdentityState'],
  Dashboard: ['useFinanceState'], ActivityPage: ['useIdentityState'], SettingsPage: [], MySchedule: [],
  AppContext: ['useSalesState'], Layout: ['useIdentityState'], main: ['useIdentityState'],
}
function presentationViolations(files: Record<string, string>) {
  return Object.entries(files).flatMap(([path, src]) => {
    const file = path.split('/').at(-1)!.replace(/\.tsx?$/, '')
    const allowed = ['useSharedState', ...(PAGE_SLICES[file] ?? [])]
    const errors: string[] = []
    for (const i of imports(path, src)) {
      if (/state\/store$/.test(i.target) && i.names.some((n) => !['actions', 'DomainError', 'exportDemoJson'].includes(n))) errors.push(`${path}: private store`)
      if (/state\/sliceHooks$/.test(i.target) && i.names.some((n) => !allowed.includes(n))) errors.push(`${path}: foreign slice`)
      if (i.names.some((n) => ['AppState', 'useAppState', 'getState'].includes(n))) errors.push(`${path}: whole state`)
    }
    if (file !== 'WorkforcePage' && /\.\s*(hourlyWage|employees)\b|\b(Employee|useWorkforceState)\b|\{[^}]*\bemployees\b[^}]*\}\s*=/.test(src)) errors.push(`${path}: employee records`)
    return errors
  })
}

describe('Experiment 1: module boundaries without a network', () => {
  it('covers every bounded context, including new files in nested folders', () => {
    expect([...new Set(Object.keys(sources).map(moduleOf))].sort()).toEqual(Object.keys(ALLOWED).sort())
  })
  it('enforces context-map imports, private wages and narrow domain inputs', () => {
    expect(domainViolations(sources)).toEqual([])
  })
  it.each([
    ['inventory', `import { validateRoster } from "../workforce/workforce"`, 'forbidden dependency workforce'],
    ['menuCosting', `import type { Employee as Person } from '../types'`, 'employee type'],
    ['menuCosting', `import type { AppState as State } from '../types'`, 'whole state'],
  ])('detects the original planted violation in %s', (context, planted, message) => {
    const mutated = { ...sources, [`../${context}/planted.ts`]: planted }
    expect(domainViolations(mutated).some((error) => error.includes(message))).toBe(true)
  })
  it('detects namespace, re-export and dynamic dependency bypasses', () => {
    for (const src of [
      `import * as workforce from '../workforce/workforce'`,
      `export { validateRoster } from '../workforce/workforce'`,
      `const x = import('../workforce/workforce')`,
    ]) expect(domainViolations({ '../inventory/planted.ts': src })).toContain('../inventory/planted.ts: forbidden dependency workforce')
  })
})

describe('Experiment 1: presentation data boundaries', () => {
  it('limits every page and UI component to its allowed raw slices', () => {
    expect(presentationViolations(presentation)).toEqual([])
  })
  it('catches whole-state aliases, private-store access and foreign slice hooks', () => {
    for (const src of [
      `import { useAppState as useData } from '../state/store'`,
      `import { workforceStore } from '../state/store'`,
      `import { useWorkforceState as useData } from '../state/sliceHooks'`,
      `import * as stores from '../state/store'`,
    ]) expect(presentationViolations({ '../../pages/Dashboard.tsx': src }).length).toBeGreaterThan(0)
  })
  it('keeps composed snapshots in seed/types/store infrastructure only', () => {
    const outside = Object.entries(stateSources).filter(([path]) => !path.endsWith('/store.ts'))
    expect(outside.filter(([, src]) => /\bAppState\b/.test(src)).map(([path]) => path)).toEqual([])
  })
  it('confines employee record access in the state layer to its owner and composition', () => {
    const outside = Object.entries(stateSources).filter(([path]) => !['/store.ts', '/workforce.ts', '/sliceHooks.ts'].some((name) => path.endsWith(name)))
    expect(outside.filter(([, src]) => /\b(employees|hourlyWage|workforceStore)\b/.test(src)).map(([path]) => path)).toEqual([])
  })
})
