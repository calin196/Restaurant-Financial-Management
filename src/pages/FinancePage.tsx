import { useMemo, useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, CheckCircle2, Download, FileSpreadsheet, Lock, LockOpen, Plus, RotateCcw } from 'lucide-react'
import { actions } from '../state/store'
import { useFinanceState, useIdentityState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { Badge, Button, Callout, Card, Field, Input, Modal, PageHeader, Progress, Segmented, Select, Tabs, Td, Th, cx } from '../ui/kit'
import { D, ZERO, cents, fmtEUR, fmtPct, type Dec } from '../domain/shared/money'
import { addMonths, fmtDate, fmtMonth, monthRange, quarterOf } from '../domain/shared/dates'
import { EXTERNAL_CATEGORIES, GENERAL_CATEGORIES, budgetStatus, monthlyShare, overheadPool, type ProfitAndLoss } from '../domain/finance/finance'
import { can } from '../domain/identity/access'
import { currentMonth, isMonthLocked } from '../state/selectors'
import { useFinanceReports } from '../state/published'
import type { BudgetCategory, CostKind } from '../domain/types'

type Tab = 'pnl' | 'costs' | 'budget' | 'vat' | 'periods'

export default function FinancePage() {
  const [params, setParams] = useSearchParams()
  const { session } = useIdentityState()
  const canWrite = can(session.role, 'finance.write')
  const tab = (params.get('tab') as Tab) ?? (canWrite ? 'pnl' : 'periods')
  const setTab = (t: Tab) => setParams({ tab: t })
  return (
    <>
      <PageHeader eyebrow="Finance & Expenses" title="Finance"
        subtitle={canWrite
          ? 'General and external costs, budget, monthly P&L and VAT overview. Closed months are locked and can be exported for your accountant.'
          : 'Read-only access for the accountant: closed periods, P&L, VAT overview and exports. Wages and staff details are not available in this role.'}
        actions={!canWrite ? <Badge tone="info" icon={<Lock size={11} />}>Read-only</Badge> : undefined} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'pnl', label: 'Profit & loss' },
        { value: 'costs', label: 'Costs', hidden: !canWrite },
        { value: 'budget', label: 'Budget', hidden: !canWrite },
        { value: 'vat', label: 'VAT overview' },
        { value: 'periods', label: 'Periods & export' },
      ]} />
      {tab === 'pnl' && <PnL />}
      {tab === 'costs' && canWrite && <Costs />}
      {tab === 'budget' && canWrite && <BudgetTab />}
      {tab === 'vat' && <Vat />}
      {tab === 'periods' && <Periods canWrite={canWrite} />}
    </>
  )
}

function MonthSelect({ value, onChange, months }: { value: string; onChange: (m: string) => void; months: string[] }) {
  const s = useFinanceState()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-56">
      {[...months].reverse().map((m) => <option key={m} value={m}>{fmtMonth(m)}{isMonthLocked(s, m) ? ' · closed' : m === currentMonth ? ' · to date' : ''}</option>)}
    </Select>
  )
}

function PnL() {
  const s = useFinanceState()
  const reports = useFinanceReports()
  const months = reports.months.slice()
  const [month, setMonth] = useState(addMonths(currentMonth, -1))
  const pnl = useMemo(() => reports.pnl(month), [reports, month])
  const prev = useMemo(() => reports.pnl(addMonths(month, -1)), [reports, month])
  const locked = isMonthLocked(s, month)
  const cats: BudgetCategory[] = ['Rent', 'Utilities', 'External services', 'Other general']

  const line = (label: string, a: Dec, b: Dec, opts: { strong?: boolean; indent?: boolean; negative?: boolean; pct?: boolean } = {}) => {
    const delta = a.minus(b)
    return (
      <tr className={cx(opts.strong && 'bg-slate-50/70')}>
        <Td className={cx(opts.indent && 'pl-8 text-ink-2', opts.strong && 'font-semibold')}>{label}</Td>
        <Td className={cx('tabular text-right', opts.strong && 'font-semibold', a.isNegative() && 'text-critical')}>{opts.negative && !a.isZero() ? '−' : ''}{fmtEUR(a.abs(), { whole: false })}</Td>
        <Td className="tabular text-right text-ink-2">{opts.negative && !b.isZero() ? '−' : ''}{fmtEUR(b.abs())}</Td>
        <Td className={cx('tabular text-right text-xs', delta.isZero() ? 'text-ink-3' : (opts.negative ? delta.isNegative() : delta.isPositive()) ? 'text-good-text' : 'text-critical')}>
          {delta.isZero() ? '—' : fmtEUR(delta, { sign: true, whole: true })}
        </Td>
        <Td className="tabular text-right text-xs text-ink-2">{pnl.revenue.isZero() ? '' : fmtPct(a.div(pnl.revenue).times(100).toNumber())}</Td>
      </tr>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthSelect value={month} onChange={setMonth} months={months} />
        {locked ? <Badge icon={<Lock size={10} />}>Closed · figures frozen</Badge> : month === currentMonth ? <Badge tone="warn">Month to date</Badge> : <Badge tone="info" icon={<LockOpen size={10} />}>Open</Badge>}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <table className="w-full">
            <thead><tr><Th>Profit & loss</Th><Th className="text-right">{fmtMonth(month)}</Th><Th className="text-right">{fmtMonth(addMonths(month, -1), true)}</Th><Th className="text-right">Change</Th><Th className="text-right">% rev.</Th></tr></thead>
            <tbody>
              {line('Net revenue', pnl.revenue, prev.revenue, { strong: true })}
              {line('Ingredients (cost of goods sold)', pnl.cogs, prev.cogs, { indent: true, negative: true })}
              {line('Gross profit', pnl.grossProfit, prev.grossProfit, { strong: true })}
              {line('Labour (booked from payroll)', pnl.labour, prev.labour, { indent: true, negative: true })}
              {cats.map((c) => <PnlCat key={c} c={c} pnl={pnl} prev={prev} line={line} />)}
              {line('Net profit', pnl.profit, prev.profit, { strong: true })}
            </tbody>
          </table>
        </Card>
        <div className="space-y-6">
          <Card>
            <div className="text-xs font-medium text-ink-2">Net profit margin</div>
            <div className={cx('mt-1 text-3xl font-semibold', pnl.profit.isNegative() ? 'text-critical' : 'text-ink')}>{fmtPct(pnl.marginPct)}</div>
            <div className="mt-1 text-xs text-ink-2">{fmtEUR(pnl.profit, { whole: true })} on {fmtEUR(pnl.revenue, { whole: true })} net revenue</div>
          </Card>
          <Callout tone="info" title="How the numbers are made">
            Revenue uses the price recorded at each sale. Ingredient cost uses the prices valid at month end. Labour is the employer cost imported from payroll. Overhead is spread over the months each cost covers.
          </Callout>
        </div>
      </div>
    </>
  )
}

function PnlCat({ c, pnl, prev, line }: { c: BudgetCategory; pnl: ProfitAndLoss; prev: ProfitAndLoss; line: (l: string, a: Dec, b: Dec, o?: { indent?: boolean; negative?: boolean }) => ReactElement }) {
  return line(c, pnl.overheadByCategory.get(c) ?? ZERO, prev.overheadByCategory.get(c) ?? ZERO, { indent: true, negative: true })
}

function Costs() {
  const s = useFinanceState()
  const { attempt } = useApp()
  const [kind, setKind] = useState<'all' | CostKind>('all')
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const month = addMonths(currentMonth, -1)
  const rows = s.costs.filter((c) => (kind === 'all' || c.kind === kind) && (showArchived || !c.archived)).sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))
  const pool = overheadPool(s.costs, month)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All costs' }, { value: 'general', label: 'General (rent, energy, water…)' }, { value: 'external', label: 'External services' }]} />
        <label className="flex items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-600" /> Show archived</label>
        <div className="flex-1" />
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Record cost</Button>
      </div>
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr><Th>Cost</Th><Th>Type</Th><Th>Covers</Th><Th className="text-right">Amount</Th><Th className="text-right">Per month</Th><Th className="text-right">In {fmtMonth(month, true)}</Th><Th /></tr></thead>
            <tbody>
              {rows.map((c) => {
                const n = monthRange(c.fromMonth, c.toMonth).length
                const share = monthlyShare(c, month)
                return (
                  <tr key={c.id} className={c.archived ? 'opacity-50' : ''}>
                    <Td><div className="font-medium">{c.name}</div><div className="text-xs text-ink-3">{c.category}</div></Td>
                    <Td><Badge tone={c.kind === 'general' ? 'neutral' : 'info'}>{c.kind === 'general' ? 'General' : 'External'}</Badge></Td>
                    <Td className="text-sm text-ink-2">{c.fromMonth === c.toMonth ? fmtMonth(c.fromMonth, true) : `${fmtMonth(c.fromMonth, true)} – ${fmtMonth(c.toMonth, true)}`} <span className="text-xs text-ink-3">({n} mo)</span></Td>
                    <Td className="tabular text-right">{fmtEUR(D(c.amount))}</Td>
                    <Td className="tabular text-right text-ink-2">{fmtEUR(cents(D(c.amount).div(n)))}</Td>
                    <Td className="tabular text-right">{share.isZero() ? <span className="text-ink-3">—</span> : fmtEUR(cents(share))}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" icon={c.archived ? <RotateCcw size={13} /> : <Archive size={13} />} onClick={() => attempt(() => actions.setArchivedCost(c.id, !c.archived), c.archived ? 'Cost restored' : 'Cost archived', 'Nothing is deleted; archived costs stay in the audit trail.')}>{c.archived ? 'Restore' : 'Archive'}</Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr className="bg-slate-50/80"><Td colSpan={5} className="text-right text-sm font-medium">Overhead pool {fmtMonth(month)}</Td><Td className="tabular text-right font-semibold">{fmtEUR(pool.total)}</Td><Td /></tr></tfoot>
          </table>
        </div>
      </Card>
      {adding && <AddCost onClose={() => setAdding(false)} />}
    </>
  )
}

function AddCost({ onClose }: { onClose: () => void }) {
  const { attempt } = useApp()
  const [kind, setKind] = useState<CostKind>('general')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>(GENERAL_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState(currentMonth)
  const [to, setTo] = useState(currentMonth)
  const valid = name.trim() && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && to >= from
  const n = to >= from ? monthRange(from, to).length : 0
  return (
    <Modal title="Record a cost" subtitle="Costs are spread evenly over the months they cover and feed the overhead pool." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid}
        onClick={() => attempt(() => { actions.addCost({ name: name.trim(), kind, category, amount: D(amount).toFixed(2), fromMonth: from, toMonth: to }); onClose() }, 'Cost recorded', 'Overhead pool and dish costs updated.')}>Save cost</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type" className="col-span-2">
          <Segmented value={kind} onChange={(k) => { setKind(k); setCategory(k === 'general' ? GENERAL_CATEGORIES[0] : EXTERNAL_CATEGORIES[0]) }} options={[{ value: 'general', label: 'General cost' }, { value: 'external', label: 'External service' }]} />
        </Field>
        <Field label="Description" className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={kind === 'general' ? 'e.g. Energy bill October' : 'e.g. Dishwasher repair'} /></Field>
        <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{(kind === 'general' ? GENERAL_CATEGORIES : EXTERNAL_CATEGORIES).map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Amount (excl. VAT)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} placeholder="0.00" /></Field>
        <Field label="Covers from"><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Until" error={to < from ? 'End must be after start' : undefined} hint={valid ? `${fmtEUR(D(amount).div(n))} per month over ${n} month(s)` : undefined}><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function BudgetTab() {
  const s = useFinanceState()
  const reports = useFinanceReports()
  const { toast } = useApp()
  const months = reports.months.slice()
  const [month, setMonth] = useState(addMonths(currentMonth, -1))
  const [edit, setEdit] = useState<Record<string, string>>({})
  const status = budgetStatus(s.budgets, reports.pnl(month))
  const total = status.reduce((a, b) => ({ budget: a.budget.plus(b.budget), actual: a.actual.plus(b.actual) }), { budget: ZERO, actual: ZERO })
  return (
    <>
      <div className="mb-4 flex items-center gap-3"><MonthSelect value={month} onChange={setMonth} months={months} />
        <span className="text-sm text-ink-2">Spent {fmtEUR(total.actual, { whole: true })} of {fmtEUR(total.budget, { whole: true })} budget</span></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {status.map((b) => (
          <Card key={b.category}>
            <div className="flex items-start justify-between">
              <div className="text-sm font-semibold">{b.category}</div>
              {b.exceeded ? <Badge tone="bad">Exceeded</Badge> : b.usedPct > 90 ? <Badge tone="warn">Near limit</Badge> : <Badge tone="good" icon={<CheckCircle2 size={10} />}>On track</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5"><span className="tabular text-2xl font-semibold">{fmtEUR(b.actual, { whole: true })}</span><span className="text-sm text-ink-3">/ {fmtEUR(b.budget, { whole: true })}</span></div>
            <div className="mt-3"><Progress value={b.usedPct} tone={b.exceeded ? 'bad' : b.usedPct > 90 ? 'warn' : 'brand'} /></div>
            <div className="mt-1.5 text-xs text-ink-2">{b.usedPct.toFixed(0)}% used{b.exceeded && ` · ${fmtEUR(b.actual.minus(b.budget), { whole: true })} over`}</div>
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
              <span className="text-xs text-ink-2">Monthly budget</span>
              <Input className="h-8 flex-1" inputMode="decimal" value={edit[b.category] ?? b.budget.toFixed(0)} onChange={(e) => setEdit({ ...edit, [b.category]: e.target.value })} />
              <Button size="sm" disabled={edit[b.category] === undefined || !(Number(edit[b.category]) >= 0)} onClick={() => { actions.setBudget(b.category, edit[b.category]); setEdit(Object.fromEntries(Object.entries(edit).filter(([k]) => k !== b.category))); toast('Budget updated') }}>Set</Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4"><Callout tone="info">Labour above budget is information for your decisions, not a target to cut people. Working-time and minimum-wage rules always apply.</Callout></div>
    </>
  )
}

function Vat() {
  const s = useFinanceState()
  const reports = useFinanceReports()
  const months = reports.months.slice()
  const quarters = [...new Set(months.map(quarterOf))]
  const [q, setQ] = useState(quarters.at(-1) ?? quarterOf(currentMonth))
  const qMonths = months.filter((m) => quarterOf(m) === q)
  const rows = qMonths.map((m) => ({ m, sales: reports.sales(m) }))
  const rates = [...new Set(rows.flatMap((r) => r.sales.vat.map((v) => v.rate)))].sort()
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Select value={q} onChange={(e) => setQ(e.target.value)} className="w-40">{quarters.map((x) => <option key={x}>{x}</option>)}</Select>
        <span className="text-sm text-ink-2">Output VAT on sales, by rate</span>
      </div>
      <Card padded={false}>
        <table className="w-full">
          <thead><tr><Th>Month</Th>{rates.map((r) => <Th key={r} className="text-right">Net at {r}%</Th>)}{rates.map((r) => <Th key={'v' + r} className="text-right">VAT {r}%</Th>)}<Th className="text-right">Total VAT</Th></tr></thead>
          <tbody>
            {rows.map(({ m, sales }) => (
              <tr key={m}>
                <Td>{fmtMonth(m)} {isMonthLocked(s, m) && <Lock size={11} className="ml-1 inline text-ink-3" />}</Td>
                {rates.map((r) => <Td key={r} className="tabular text-right">{fmtEUR(sales.vat.find((v) => v.rate === r)?.net ?? ZERO)}</Td>)}
                {rates.map((r) => <Td key={'v' + r} className="tabular text-right">{fmtEUR(sales.vat.find((v) => v.rate === r)?.vat ?? ZERO)}</Td>)}
                <Td className="tabular text-right font-medium">{fmtEUR(sales.vat.reduce((a, v) => a.plus(v.vat), ZERO))}</Td>
              </tr>
            ))}
            <tr className="bg-slate-50/80 font-semibold">
              <Td>{q} total</Td>
              {rates.map((r) => <Td key={r} className="tabular text-right">{fmtEUR(rows.reduce((a, x) => a.plus(x.sales.vat.find((v) => v.rate === r)?.net ?? ZERO), ZERO))}</Td>)}
              {rates.map((r) => <Td key={'v' + r} className="tabular text-right">{fmtEUR(rows.reduce((a, x) => a.plus(x.sales.vat.find((v) => v.rate === r)?.vat ?? ZERO), ZERO))}</Td>)}
              <Td className="tabular text-right">{fmtEUR(rows.reduce((a, x) => a.plus(x.sales.vat.reduce((b, v) => b.plus(v.vat), ZERO)), ZERO))}</Td>
            </tr>
          </tbody>
        </table>
      </Card>
      <div className="mt-4"><Callout tone="info" title="Overview, not a tax return">TrueCost has no tax engine. Input VAT and the actual filing stay with your accountant, who receives this overview in the export.</Callout></div>
    </>
  )
}

const download = (name: string, content: string, type = 'text/csv') => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}

function Periods({ canWrite }: { canWrite: boolean }) {
  const s = useFinanceState()
  const reports = useFinanceReports()
  const { attempt, toast } = useApp()
  const [closing, setClosing] = useState<string | null>(null)
  const months = reports.months.slice().reverse()

  const exportMonth = (m: string) => {
    const p = reports.pnl(m)
    const v = reports.sales(m).vat
    const rows = [
      ['section', 'line', 'amount_eur'],
      ['pnl', 'net_revenue', p.revenue.toFixed(2)], ['pnl', 'cost_of_goods_sold', p.cogs.toFixed(2)], ['pnl', 'labour', p.labour.toFixed(2)],
      ...[...p.overheadByCategory.entries()].map(([c, x]) => ['pnl', `overhead_${c.toLowerCase().replace(/ /g, '_')}`, x.toFixed(2)]),
      ['pnl', 'net_profit', p.profit.toFixed(2)],
      ...v.flatMap((x) => [['vat', `net_sales_${x.rate}pct`, x.net.toFixed(2)], ['vat', `output_vat_${x.rate}pct`, x.vat.toFixed(2)]]),
      ...overheadPool(s.costs, m).lines.map((l) => ['costs', `${l.cost.name} (${l.cost.category})`, l.share.toFixed(2)]),
    ]
    download(`bistro-de-haven_${m}_accountant-export.csv`, rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n'))
    actions.logExport(`Accountant export for ${fmtMonth(m)} (CSV)`)
    toast('Export downloaded', 'CSV with P&L, VAT and cost lines.')
  }

  return (
    <>
      <Card padded={false}>
        <table className="w-full">
          <thead><tr><Th>Period</Th><Th>Status</Th><Th className="text-right">Net revenue</Th><Th className="text-right">Net profit</Th><Th>Closed</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {months.map((m) => {
              const period = s.periods.find((p) => p.month === m)
              const locked = isMonthLocked(s, m)
              const p = reports.pnl(m)
              const closable = !locked && m < currentMonth
              return (
                <tr key={m}>
                  <Td className="font-medium">{fmtMonth(m)}</Td>
                  <Td>{locked ? <Badge icon={<Lock size={10} />}>Closed</Badge> : m === currentMonth ? <Badge tone="warn">In progress</Badge> : <Badge tone="info" icon={<LockOpen size={10} />}>Open · ready to close</Badge>}</Td>
                  <Td className="tabular text-right">{fmtEUR(p.revenue, { whole: true })}</Td>
                  <Td className={cx('tabular text-right font-medium', p.profit.isNegative() && 'text-critical')}>{fmtEUR(p.profit, { whole: true })}</Td>
                  <Td className="text-xs text-ink-2">{period?.closedAt ? fmtDate(period.closedAt.slice(0, 10)) : '—'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {closable && canWrite && <Button size="sm" variant="subtle" icon={<Lock size={13} />} onClick={() => setClosing(m)}>Close month</Button>}
                      <Button size="sm" icon={<Download size={13} />} disabled={m === currentMonth} onClick={() => exportMonth(m)}>Export</Button>
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Callout tone="info" icon={<FileSpreadsheet size={16} />} title="Published language for your accountant">Each export is a standard CSV with P&amp;L lines, VAT per rate and the cost entries behind the overhead, so nothing needs to be re-typed. An XML Auditfile export is planned for phase 3.</Callout>
        <Callout tone="info" icon={<Lock size={16} />} title="Closed means immutable">Closing a month freezes its P&amp;L and VAT. Sales and costs in that month can no longer be changed (7-year fiscal retention).</Callout>
      </div>
      {closing && (
        <Modal title={`Close ${fmtMonth(closing)}?`} subtitle="This cannot be undone." onClose={() => setClosing(null)}
          footer={<><Button variant="ghost" onClick={() => setClosing(null)}>Cancel</Button><Button variant="primary" icon={<Lock size={14} />} onClick={() => attempt(() => { actions.closePeriod(closing); setClosing(null) }, `${fmtMonth(closing)} closed`, 'OverheadPoolClosed published. The period is now locked.')}>Close and lock</Button></>}>
          <ClosePreview month={closing} />
        </Modal>
      )}
    </>
  )
}

function ClosePreview({ month }: { month: string }) {
  const reports = useFinanceReports()
  const p = reports.pnl(month)
  const sales = reports.sales(month)
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
        <span className="text-ink-2">Net revenue</span><span className="tabular text-right">{fmtEUR(p.revenue)}</span>
        <span className="text-ink-2">Ingredients</span><span className="tabular text-right">−{fmtEUR(p.cogs)}</span>
        <span className="text-ink-2">Labour</span><span className="tabular text-right">−{fmtEUR(p.labour)}</span>
        <span className="text-ink-2">Overhead pool</span><span className="tabular text-right">−{fmtEUR(p.overhead)}</span>
        <span className="font-semibold">Net profit</span><span className={cx('tabular text-right font-semibold', p.profit.isNegative() && 'text-critical')}>{fmtEUR(p.profit)}</span>
      </div>
      <div className="text-xs text-ink-2">{sales.portions.toLocaleString('en-IE')} portions · VAT {sales.vat.map((v) => `${v.rate}%: ${fmtEUR(v.vat)}`).join(', ')}</div>
      {p.labour.isZero() && <Callout tone="warn">No labour cost has been booked for this month yet. Import payroll first for a complete P&amp;L.</Callout>}
    </div>
  )
}
