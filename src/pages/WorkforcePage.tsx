import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Download, EyeOff, Info, Lock, Plus, Send, ShieldCheck, Sparkles, Trash2, UserPlus } from 'lucide-react'
import { actions } from '../state/store'
import { useSharedState, useWorkforceState } from '../state/sliceHooks'
import { usePublishedForecast } from '../state/published'
import { useApp } from '../ui/AppContext'
import { Badge, Button, Callout, Card, CardTitle, Field, Input, Modal, PageHeader, Select, Tabs, Td, Th, cx } from '../ui/kit'
import { D, fmtEUR } from '../domain/shared/money'
import { TODAY, WEEKDAYS, addDays, fmtDate, fmtMonth, startOfWeek } from '../domain/shared/dates'
import { WORKING_TIME_RULES, plannedCostByRole, shiftHours, validateRoster, type RosterWarning } from '../domain/workforce/workforce'
import type { Employee, Shift } from '../domain/types'

type Tab = 'roster' | 'team' | 'hours'

export default function WorkforcePage() {
  const [tab, setTab] = useState<Tab>('roster')
  return (
    <>
      <PageHeader eyebrow="Workforce" title="Staff & roster"
        subtitle="Plan shifts with working-time checks, keep wages private, and pass only an aggregated labour rate per role to dish costing." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'roster', label: 'Roster' }, { value: 'team', label: 'Team & labour rates' }, { value: 'hours', label: 'Hours & labour cost' }]} />
      {tab === 'roster' && <Roster />}
      {tab === 'team' && <Team />}
      {tab === 'hours' && <Hours />}
    </>
  )
}

function Roster() {
  const s = useWorkforceState()
  const { settings } = useSharedState()
  const { toast } = useApp()
  const [week, setWeek] = useState(startOfWeek(TODAY))
  const [edit, setEdit] = useState<{ shift?: Shift; employeeId: string; date: string } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const status = s.rosterWeeks.find((w) => w.weekStart === week)
  const published = !!status?.published
  const employees = s.employees.filter((e) => !e.archived)
  const weekShifts = s.shifts.filter((x) => x.date >= week && x.date <= days[6])
  const warnings = useMemo(() => validateRoster(week, s.shifts, employees), [week, s.shifts, employees])
  const violations = warnings.filter((w) => w.severity === 'violation')
  const cost = plannedCostByRole(weekShifts, employees, s.roles)
  const demand = usePublishedForecast(week)
  const forecast = settings.flags.aiSuggestions && week >= startOfWeek(TODAY) ? demand : null

  const warnFor = (empId: string, date: string) => warnings.filter((w) => w.employeeId === empId && (w.date === date || !w.date))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={16} /></Button>
          <div className="text-sm font-semibold">Week of {fmtDate(week)}</div>
          <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={16} /></Button>
          {published ? <Badge tone="good" icon={<Lock size={10} />}>Published</Badge> : <Badge tone="warn">Draft</Badge>}
        </div>
        <div className="flex gap-2">
          {published
            ? <Button onClick={() => { actions.unpublishRoster(week); toast('Roster reopened', 'Staff will see changes once you publish again.', 'warn') }}>Reopen for changes</Button>
            : <Button variant="primary" icon={<Send size={15} />} onClick={() => setPublishing(true)}>Publish to staff</Button>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4">
          <Callout tone={violations.length ? 'bad' : 'warn'} title={violations.length ? `${violations.length} working-time violation${violations.length > 1 ? 's' : ''} in this week` : `${warnings.length} notice${warnings.length > 1 ? 's' : ''}`}>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{warnings.map((w) => <li key={w.key}><b className="font-medium">{w.rule}:</b> {w.message}{w.date ? ` (${WEEKDAYS[days.indexOf(w.date)] ?? fmtDate(w.date)})` : ''}</li>)}</ul>
          </Callout>
        </div>
      )}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] table-fixed">
            <thead>
              <tr>
                <Th className="w-48">Employee</Th>
                {days.map((d) => <Th key={d} className={cx('text-center', d === TODAY && 'text-brand-700')}>{WEEKDAYS[days.indexOf(d)]} {Number(d.slice(-2))}</Th>)}
                <Th className="w-20 text-right">Hours</Th>
              </tr>
            </thead>
            <tbody>
              {s.roles.map((role) => (
                <RoleBlock key={role.id} roleName={role.name}>
                  {employees.filter((e) => e.roleId === role.id).map((e) => {
                    const own = weekShifts.filter((x) => x.employeeId === e.id)
                    const hours = own.reduce((a, x) => a + shiftHours(x), 0)
                    return (
                      <tr key={e.id} className="group">
                        <Td className="align-top">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-ink-3">{e.contractHours} h contract{e.isMinor && <Badge className="ml-1.5" tone="info">Under 18</Badge>}</div>
                        </Td>
                        {days.map((d) => {
                          const sh = own.filter((x) => x.date === d)
                          const ws = warnFor(e.id, d).filter((w) => w.date === d && w.severity === 'violation')
                          return (
                            <Td key={d} className={cx('p-1.5 align-top', d === TODAY && 'bg-brand-50/30')}>
                              <div className="flex min-h-11 flex-col gap-1">
                                {sh.map((x) => (
                                  <button key={x.id} disabled={published} onClick={() => setEdit({ shift: x, employeeId: e.id, date: d })} title={ws.map((w) => w.message).join('\n')}
                                    className={cx('rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight font-medium transition',
                                      ws.length ? 'border-red-300 bg-red-50 text-red-800' : 'border-brand-200 bg-brand-50 text-brand-900',
                                      !published && 'hover:shadow-sm')}>
                                    <span className="tabular flex items-center gap-1">{ws.length > 0 && <AlertTriangle size={10} />}{x.start}–{x.end}</span>
                                    <span className="text-[10px] font-normal opacity-70">{shiftHours(x).toFixed(1)} h</span>
                                  </button>
                                ))}
                                {!published && sh.length === 0 && (
                                  <button onClick={() => setEdit({ employeeId: e.id, date: d })} className="grid min-h-11 place-items-center rounded-md border border-dashed border-transparent text-ink-3 opacity-0 transition group-hover:opacity-100 hover:border-line hover:bg-slate-50" aria-label="Add shift"><Plus size={14} /></button>
                                )}
                              </div>
                            </Td>
                          )
                        })}
                        <Td className={cx('tabular text-right align-top text-sm', hours > WORKING_TIME_RULES.maxWeekHours ? 'font-semibold text-critical' : hours > e.contractHours * 1.2 ? 'text-amber-700' : '')}>{hours.toFixed(1)}</Td>
                      </tr>
                    )
                  })}
                  <tr className="bg-slate-50/60 text-xs">
                    <Td className="text-ink-2">{role.name} on duty</Td>
                    {days.map((d) => {
                      const n = new Set(weekShifts.filter((x) => x.date === d && employees.find((e) => e.id === x.employeeId)?.roleId === role.id).map((x) => x.employeeId)).size
                      const f = forecast?.find((x) => x.date === d)
                      const need = f ? (role.id === 'kitchen' ? f.cooks : role.id === 'bar' ? f.barStaff : null) : null
                      return (
                        <Td key={d} className="text-center">
                          <span className="tabular font-medium text-ink">{n}</span>
                          {need !== null && <span className={cx('ml-1 inline-flex items-center gap-0.5', n < need ? 'text-amber-700' : 'text-ink-3')} title="Forecast from aggregate demand"><Sparkles size={10} />{need}</span>}
                        </Td>
                      )
                    })}
                    <Td className="tabular text-right text-ink-2">{fmtEUR(cost.get(role.id)?.cost ?? D(0), { whole: true })}</Td>
                  </tr>
                </RoleBlock>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-2">
        {forecast && <span className="inline-flex items-center gap-1"><Sparkles size={12} /> Forecast staff need from aggregate demand. It never assigns or ranks individual people; you decide who works.</span>}
        <span>Planned labour this week: <b className="tabular text-ink">{fmtEUR([...cost.values()].reduce((a, c) => a.plus(c.cost), D(0)), { whole: true })}</b> (role rates × hours)</span>
      </div>

      {edit && <ShiftModal {...edit} onClose={() => setEdit(null)} />}
      {publishing && <PublishModal week={week} warnings={warnings} onClose={() => setPublishing(false)} />}
    </>
  )
}

const RoleBlock = ({ roleName, children }: { roleName: string; children: ReactNode }) => (
  <>
    <tr><td colSpan={9} className="border-b border-line bg-white px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{roleName}</td></tr>
    {children}
  </>
)

function ShiftModal({ shift, employeeId, date, onClose }: { shift?: Shift; employeeId: string; date: string; onClose: () => void }) {
  const s = useWorkforceState()
  const [start, setStart] = useState(shift?.start ?? '12:00')
  const [end, setEnd] = useState(shift?.end ?? '20:00')
  const emp = s.employees.find((e) => e.id === employeeId)!
  const draft: Shift = { id: shift?.id ?? 'draft', employeeId, date, start, end }
  const preview = validateRoster(startOfWeek(date), [...s.shifts.filter((x) => x.id !== shift?.id), draft], [emp]).filter((w) => w.severity === 'violation')
  return (
    <Modal title={`${shift ? 'Edit' : 'Add'} shift · ${emp.name}`} subtitle={fmtDate(date)} onClose={onClose}
      footer={<>
        {shift && <Button variant="ghost" className="mr-auto text-critical" icon={<Trash2 size={14} />} onClick={() => { actions.removeShift(shift.id); onClose() }}>Remove</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => { actions.saveShift({ ...draft, id: shift?.id }); onClose() }}>Save shift</Button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End" hint="An end before the start means past midnight"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <div className="mt-3 text-sm text-ink-2">{shiftHours(draft).toFixed(1)} hours</div>
      {preview.length > 0 && <div className="mt-3"><Callout tone="bad" title="This shift breaks a working-time rule">{preview.map((w) => <div key={w.key}>{w.message}</div>)}</Callout></div>}
    </Modal>
  )
}

function PublishModal({ week, warnings, onClose }: { week: string; warnings: RosterWarning[]; onClose: () => void }) {
  const { toast } = useApp()
  const violations = warnings.filter((w) => w.severity === 'violation')
  const [ack, setAck] = useState<string[]>([])
  const allAck = violations.every((v) => ack.includes(v.key))
  return (
    <Modal title={`Publish roster · week of ${fmtDate(week)}`} subtitle="Employees see only their own shifts once published." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Go back and fix</Button>
        <Button variant={violations.length ? 'danger' : 'primary'} disabled={!allAck} onClick={() => { actions.publishRoster(week, ack); toast('Roster published', violations.length ? 'Acknowledged warnings were recorded in the activity log.' : 'Staff can now see their shifts.'); onClose() }}>
          {violations.length ? 'Publish with acknowledged warnings' : 'Publish'}
        </Button></>}>
      {violations.length === 0 ? (
        <Callout tone="good" icon={<ShieldCheck size={16} />} title="No working-time violations">{warnings.length ? `${warnings.length} notice(s) remain, such as break reminders.` : 'Everything is within the rules.'}</Callout>
      ) : (
        <>
          <Callout tone="bad" title="Warnings are shown before publishing and never hidden">Fixing them is recommended. To publish anyway, acknowledge each one; your choice is recorded.</Callout>
          <div className="mt-3 space-y-2">
            {violations.map((v) => (
              <label key={v.key} className="flex items-start gap-2.5 rounded-lg border border-line p-2.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-0.5 accent-red-600" checked={ack.includes(v.key)} onChange={(e) => setAck(e.target.checked ? [...ack, v.key] : ack.filter((k) => k !== v.key))} />
                <span><b className="font-medium">{v.rule}</b><br /><span className="text-ink-2">{v.message}</span></span>
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

function Team() {
  const s = useWorkforceState()
  const { toast } = useApp()
  const [rates, setRates] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardTitle title="Labour rate per role" subtitle="Employer cost per hour (wage + employer charges). This is the only labour figure dish costing ever sees." icon={<ShieldCheck size={16} />} />
        <div className="space-y-3">
          {s.roles.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <div className="w-24 text-sm font-medium">{r.name}</div>
              <div className="relative flex-1"><span className="absolute top-2 left-3 text-sm text-ink-3">€</span>
                <Input className="pl-7" inputMode="decimal" value={rates[r.id] ?? r.ratePerHour} onChange={(e) => setRates({ ...rates, [r.id]: e.target.value.replace(',', '.') })} />
              </div>
              <span className="text-xs text-ink-3">/ hour</span>
              <Button size="sm" disabled={!rates[r.id] || rates[r.id] === r.ratePerHour || !(Number(rates[r.id]) > 0)}
                onClick={() => { actions.setRoleRate(r.id, rates[r.id]); setRates({ ...rates, [r.id]: '' }); toast('Labour rate updated', 'LabourRateSet published; dish costs recalculated.') }}>Save</Button>
            </div>
          ))}
        </div>
        <div className="mt-5"><Callout tone="info" title="Why per role?">Labour cost per named employee would turn the tool into a way to rank people. We keep it aggregated (report, tradeoff 1.3).</Callout></div>
      </Card>
      <Card className="xl:col-span-3" padded={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <div><h2 className="text-[15px] font-semibold">Team</h2><p className="text-xs text-ink-2">Wages are personal data (GDPR). Only the manager sees this table.</p></div>
          <Button size="sm" icon={<UserPlus size={14} />} onClick={() => setAdding(true)}>Add employee</Button>
        </div>
        <table className="w-full">
          <thead><tr><Th>Name</Th><Th>Role</Th><Th className="text-right">Contract</Th><Th className="text-right">Gross wage</Th></tr></thead>
          <tbody>
            {s.employees.filter((e) => !e.archived).map((e) => (
              <tr key={e.id}>
                <Td className="font-medium">{e.name}{e.isMinor && <Badge className="ml-2" tone="info">Under 18</Badge>}</Td>
                <Td className="text-ink-2">{s.roles.find((r) => r.id === e.roleId)?.name}</Td>
                <Td className="tabular text-right">{e.contractHours} h/wk</Td>
                <Td className="tabular text-right">{fmtEUR(D(e.hourlyWage))}/h</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-ink-2"><EyeOff size={13} /> Accountants and employees are denied access to this page; attempts are logged.</div>
      </Card>
      {adding && <AddEmployee onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddEmployee({ onClose }: { onClose: () => void }) {
  const s = useWorkforceState()
  const { toast } = useApp()
  const [e, setE] = useState<Omit<Employee, 'id' | 'archived'>>({ name: '', roleId: 'kitchen', contractHours: 24, hourlyWage: '', isMinor: false })
  const valid = e.name.trim() && Number(e.hourlyWage) > 0 && e.contractHours > 0
  return (
    <Modal title="Add employee" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={() => { actions.addEmployee({ ...e, hourlyWage: D(e.hourlyWage).toFixed(2) }); toast('Employee added'); onClose() }}>Add</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" className="col-span-2"><Input value={e.name} autoFocus onChange={(x) => setE({ ...e, name: x.target.value })} /></Field>
        <Field label="Role"><Select value={e.roleId} onChange={(x) => setE({ ...e, roleId: x.target.value })}>{s.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Contract hours / week"><Input type="number" value={e.contractHours} onChange={(x) => setE({ ...e, contractHours: Number(x.target.value) })} /></Field>
        <Field label="Gross hourly wage (€)"><Input inputMode="decimal" value={e.hourlyWage} onChange={(x) => setE({ ...e, hourlyWage: x.target.value.replace(',', '.') })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm text-ink-2"><input type="checkbox" checked={e.isMinor} onChange={(x) => setE({ ...e, isMinor: x.target.checked })} className="accent-brand-600" /> Under 18</label>
      </div>
    </Modal>
  )
}

function Hours() {
  const s = useWorkforceState()
  const { toast } = useApp()
  const past = s.shifts.filter((x) => x.actualStart && x.actualEnd)
  const weeks = [...new Set(past.map((x) => startOfWeek(x.date)))].sort().reverse()
  const months = [...new Set(s.labourBookings.map((b) => b.month))].sort()

  const exportHours = () => {
    const lines = ['employee,date,start,end,hours', ...past.map((x) => {
      const e = s.employees.find((y) => y.id === x.employeeId)!
      return `${e.name},${x.date},${x.actualStart},${x.actualEnd},${shiftHours({ start: x.actualStart!, end: x.actualEnd! }).toFixed(2)}`
    })]
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'worked-hours-for-payroll.csv'; a.click(); URL.revokeObjectURL(url)
    toast('Hours exported', 'Send this file to your payroll provider.')
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardTitle title="Labour cost booked (from payroll)" subtitle="LabourCostBooked: actual employer cost per role, imported after payroll runs" actions={<Badge tone="brand">Phase 2</Badge>} />
        <table className="w-full">
          <thead><tr><Th>Month</Th>{s.roles.map((r) => <Th key={r.id} className="text-right">{r.name}</Th>)}<Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {months.map((m) => {
              const row = s.roles.map((r) => s.labourBookings.filter((b) => b.month === m && b.roleId === r.id).reduce((a, b) => a.plus(b.amount), D(0)))
              return (
                <tr key={m}>
                  <Td>{fmtMonth(m)}</Td>
                  {row.map((v, i) => <Td key={i} className="tabular text-right">{fmtEUR(v, { whole: true })}</Td>)}
                  <Td className="tabular text-right font-medium">{fmtEUR(row.reduce((a, b) => a.plus(b), D(0)), { whole: true })}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-3 flex items-start gap-2 text-xs text-ink-2"><Info size={13} className="mt-0.5 shrink-0" /> Payroll is calculated by your payroll provider. We only export worked hours and import the resulting cost per role.</div>
      </Card>
      <Card>
        <CardTitle title="Worked hours" subtitle="Cost is booked from actual hours, not planned ones" actions={<Button size="sm" icon={<Download size={14} />} onClick={exportHours}>Export for payroll</Button>} />
        <table className="w-full">
          <thead><tr><Th>Week</Th><Th className="text-right">Shifts</Th><Th className="text-right">Actual hours</Th></tr></thead>
          <tbody>
            {weeks.map((w) => {
              const sh = past.filter((x) => startOfWeek(x.date) === w)
              return <tr key={w}><Td>Week of {fmtDate(w)}</Td><Td className="tabular text-right">{sh.length}</Td><Td className="tabular text-right">{sh.reduce((a, x) => a + shiftHours({ start: x.actualStart!, end: x.actualEnd! }), 0).toFixed(1)}</Td></tr>
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
