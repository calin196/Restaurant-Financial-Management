import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' }).trim()
const fields = {
  Identity: ['session', 'accessLog'], Inventory: ['suppliers', 'ingredients', 'prices'],
  Menu: ['menuItems'], Sales: ['sales'], Workforce: ['roles', 'employees', 'shifts', 'rosterWeeks', 'labourBookings'],
  Finance: ['costs', 'budgets', 'periods'], Insights: ['decisions'],
}
const hooks = Object.keys(fields).map((context) => [`use${context}State`, context])
const walk = (directory) => readdirSync(resolve(root, directory), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`])

function measure(ref) {
  const paths = ref ? git('ls-tree', '-r', '--name-only', ref, 'poc/src').split('\n') : walk('poc/src')
  const read = (path) => ref ? git('show', `${ref}:${path}`) : readFileSync(resolve(root, path), 'utf8')
  const files = paths.filter((path) => /^poc\/src\/(pages|ui)\/.*\.tsx?$/.test(path) && !path.includes('/__tests__/'))
  const readers = files.map((path) => {
    const src = read(path)
    const contexts = new Set(hooks.filter(([hook]) => new RegExp(`\\b${hook}\\s*\\(`).test(src)).map(([, context]) => context))
    const aliases = [...src.matchAll(/\bconst\s+(\w+)\s*=\s*useAppState\s*\(/g)].map((match) => match[1])
    for (const [context, names] of Object.entries(fields)) {
      if (aliases.some((alias) => names.some((name) => new RegExp(`\\b${alias}\\.${name}\\b`).test(src)))) contexts.add(context)
    }
    const employees = /\buseWorkforceState\s*\(/.test(src) || aliases.some((alias) => new RegExp(`\\b${alias}\\.employees\\b`).test(src))
    return { path, contexts: [...contexts].sort(), employees }
  })
  const stateFiles = paths.filter((path) => /^poc\/src\/state\/.*\.ts$/.test(path) && !path.includes('/__tests__/'))
  const subscriptions = [...new Set(stateFiles.flatMap((path) => [...read(path).matchAll(/subscribeToEvent\(['"]([^'"]+)['"]/g)].map((m) => m[1])))].sort()
  return {
    ref: ref ? `${ref} (${git('rev-parse', ref)})` : 'working tree',
    multipleRawContexts: readers.filter((r) => r.contexts.length > 1).map(({ path, contexts }) => ({ path, contexts })),
    employeeRecordReaders: readers.filter((r) => r.employees).map((r) => r.path),
    subscribedEventTypes: subscriptions,
  }
}

// Subscription presence is only a structural count. The event integration tests
// must also pass to establish that all three consumers do useful work.
console.log(JSON.stringify({ before: measure(process.argv[2] ?? 'experiment-1-before'), after: measure() }, null, 2))
