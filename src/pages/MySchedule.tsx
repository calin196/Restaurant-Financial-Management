import { CalendarDays, Clock, ShieldCheck } from 'lucide-react'
import { useOwnSchedule } from '../state/workforce'
import { Badge, Callout, Card, CardTitle, EmptyState, PageHeader, cx } from '../ui/kit'
import { TODAY, WEEKDAYS_LONG, addDays, fmtDate, startOfWeek, weekday } from '../domain/shared/dates'
import { shiftHours } from '../domain/workforce/workforce'

// Employees see only their own schedule, and only for published weeks (S5).
export default function MySchedule() {
  const { me, shifts, publishedWeeks: weeks } = useOwnSchedule()
  if (!me) return <Card><EmptyState title="No employee selected">Use the role switcher to sign in as an employee.</EmptyState></Card>
  const publishedWeeks = new Set(weeks)
  const mine = [...shifts].sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = mine.filter((x) => x.date >= TODAY)
  const thisWeek = startOfWeek(TODAY)
  const draftThisWeek = !publishedWeeks.has(thisWeek)
  const weekStarts = [...new Set(mine.map((x) => startOfWeek(x.date)))].sort().reverse()
  const role = me.roleName

  return (
    <>
      <PageHeader eyebrow={`${role} · ${me.contractHours} h contract`} title={`Hi ${me.name.split(' ')[0]}`} subtitle="Your published shifts. You only see your own schedule." />
      {draftThisWeek && <div className="mb-5"><Callout tone="info" title="This week’s roster is not published yet">Your manager is still planning it. You’ll see your shifts here once it’s published.</Callout></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon={<CalendarDays size={16} />} title="Upcoming shifts" />
          {upcoming.length === 0 ? <EmptyState title="No upcoming published shifts" /> : (
            <ul className="divide-y divide-line">
              {upcoming.map((x) => (
                <li key={x.id} className="flex items-center gap-4 py-3">
                  <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl text-center', x.date === TODAY ? 'bg-brand-600 text-white' : 'bg-slate-100')}>
                    <div><div className="text-[10px] uppercase opacity-80">{WEEKDAYS_LONG[weekday(x.date)].slice(0, 3)}</div><div className="text-lg leading-none font-semibold">{Number(x.date.slice(-2))}</div></div>
                  </div>
                  <div className="flex-1">
                    <div className="tabular font-medium">{x.start} – {x.end}</div>
                    <div className="text-xs text-ink-2">{WEEKDAYS_LONG[weekday(x.date)]} {fmtDate(x.date)} · {shiftHours(x).toFixed(1)} h</div>
                  </div>
                  {x.date === TODAY && <Badge tone="brand">Today</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle icon={<Clock size={16} />} title="Hours per week" />
            {weekStarts.map((w) => {
              const h = mine.filter((x) => startOfWeek(x.date) === w).reduce((a, x) => a + shiftHours(x), 0)
              return (
                <div key={w} className="flex justify-between border-b border-line/60 py-2 text-sm last:border-0">
                  <span className="text-ink-2">Week of {fmtDate(w, false)}{w === thisWeek && ' (this week)'}</span>
                  <span className="tabular font-medium">{h.toFixed(1)} h</span>
                </div>
              )
            })}
            <div className="mt-2 text-xs text-ink-3">Contract: {me.contractHours} h per week · Next week starts {fmtDate(addDays(thisWeek, 7), false)}</div>
          </Card>
          <Callout tone="good" icon={<ShieldCheck size={16} />} title="Your data">Your wage and hours are visible only to your manager and payroll. Dish costs use an average rate per role, never your personal wage.</Callout>
        </div>
      </div>
    </>
  )
}
