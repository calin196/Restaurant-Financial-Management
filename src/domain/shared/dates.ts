// Dates are ISO strings (YYYY-MM-DD) and months are YYYY-MM.
// The prototype runs on a fixed "today" so the seeded story is reproducible.
export const TODAY = '2026-10-29'

export const monthOf = (date: string) => date.slice(0, 7)

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)

export const addDays = (date: string, n: number): string => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export const monthDays = (month: string): string[] =>
  Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)

export const addMonths = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export const monthRange = (from: string, to: string): string[] => {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

export const weekday = (date: string): number => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7 // Mon=0

export const startOfWeek = (date: string): string => addDays(date, -weekday(date))

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const fmtMonth = (month: string, short = false): string =>
  new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' })

export const fmtDate = (date: string, withYear = true): string =>
  new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })

export const fmtAge = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? '1 day ago' : days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`

export const quarterOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number)
  return `${y}-Q${Math.ceil(m / 3)}`
}

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
