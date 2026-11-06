import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, CalendarClock, ChefHat, Database, Euro, PackageX, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useSharedState, useFinanceState } from '../state/sliceHooks'
import { useFinanceReports, useInventoryHealth } from '../state/published'
import { useRosterStatus } from '../state/workforce'
import { useApp } from '../ui/AppContext'
import { useCosting } from '../ui/hooks'
import { Badge, Callout, Card, CardTitle, Freshness, PageHeader, Stat } from '../ui/kit'
import { CHART, Legend, StackedShare, TooltipBox, axisProps } from '../ui/charts'
import { fmtEUR, fmtPct } from '../domain/shared/money'
import { TODAY, addMonths, daysBetween, fmtDate, fmtMonth, startOfWeek } from '../domain/shared/dates'
import { budgetStatus } from '../domain/finance/finance'
import { POLICY_LABELS } from '../domain/menuCosting/costing'
import { currentMonth } from '../state/selectors'
import { unallocatedLabour } from '../domain/insights/insights'

export default function Dashboard() {
  const s = useSharedState()
  const { budgets: budgetRecords } = useFinanceState()
  const reports = useFinanceReports()
  const { stale, lowStock, lastSale } = useInventoryHealth()
  const { basisMonth } = useApp()
  const { costing } = useCosting()

  const pnl = useMemo(() => reports.pnl(basisMonth), [reports, basisMonth])
  const prevPnl = useMemo(() => reports.pnl(addMonths(basisMonth, -1)), [reports, basisMonth])
  const budgets = budgetStatus(budgetRecords, pnl).filter((b) => b.exceeded)
  const losers = costing.filter((c) => c.margin.isNegative()).sort((a, b) => a.periodProfit.cmp(b.periodProfit))
  const hiddenLosers = losers.filter((c) => c.foodOnlyMargin.isPositive())
  const thisWeek = startOfWeek(TODAY)
  const { violationCount, published: weekPublished } = useRosterStatus(thisWeek)

  // Dishes carry prep time only, so part of the booked labour reaches no dish.
  const labourRows = useMemo(() => reports.reconciliation(basisMonth), [reports, basisMonth])
  const unallocated = unallocatedLabour(labourRows)
  const labourGap = unallocated.isPositive()

  const totalProfit = costing.reduce((a, c) => a + c.periodProfit.toNumber(), 0)
  const totalRev = costing.reduce((a, c) => a + c.periodRevenue.toNumber(), 0)

  const marginData = [...costing]
    .sort((a, b) => b.margin.cmp(a.margin))
    .map((c) => ({ id: c.itemId, name: c.name, margin: +c.margin.toFixed(2), pct: c.marginPct, monthly: c.periodProfit.toNumber(), portions: c.portions }))

  const trend = reports.months.filter((m) => m < currentMonth).map((m) => {
    const p = reports.pnl(m)
    return { month: fmtMonth(m, true), revenue: p.revenue.toNumber(), profit: p.profit.toNumber(), costs: p.revenue.minus(p.profit).toNumber() }
  })

  const parts = [
    { label: 'Ingredients', value: pnl.cogs.toNumber(), color: CHART.series[0] },
    { label: 'Labour', value: pnl.labour.toNumber(), color: CHART.series[1] },
    { label: 'Rent', value: pnl.overheadByCategory.get('Rent')?.toNumber() ?? 0, color: CHART.series[2] },
    { label: 'Utilities', value: pnl.overheadByCategory.get('Utilities')?.toNumber() ?? 0, color: CHART.series[3] },
    { label: 'External services', value: pnl.overheadByCategory.get('External services')?.toNumber() ?? 0, color: CHART.series[4] },
    { label: 'Other general', value: pnl.overheadByCategory.get('Other general')?.toNumber() ?? 0, color: CHART.series[6] },
  ]
  const costTotal = parts.reduce((a, p) => a + p.value, 0)

  const revDelta = prevPnl.revenue.isZero() ? 0 : pnl.revenue.minus(prevPnl.revenue).div(prevPnl.revenue).times(100).toNumber()

  return (
    <>
      <PageHeader
        eyebrow={`Costing basis · ${fmtMonth(basisMonth)}`}
        title="Good morning, Eva"
        subtitle={<>The true cost and profit of every dish, including labour and overhead. Overhead is allocated <b className="font-medium text-ink">{POLICY_LABELS[s.settings.allocationPolicy].name.toLowerCase()}</b>; change it in Menu &amp; profitability.</>}
      />

      {(hiddenLosers.length > 0 || budgets.length > 0 || labourGap) && (
        <div className="mb-6 grid gap-3 xl:grid-cols-2">
          {hiddenLosers.slice(0, 1).map((c) => (
            <Callout key={c.itemId} tone="bad" icon={<TrendingDown size={16} />} title={`${c.name} loses ${fmtEUR(c.margin.abs())} on every portion`}
              action={<Link to={`/menu/${c.itemId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 hover:underline">See why <ArrowRight size={13} /></Link>}>
              Food cost is only {c.foodCostPct.toFixed(0)}% of the net price, so it looks profitable, but labour ({c.labourPct.toFixed(0)}%) and overhead push it to {fmtEUR(c.periodProfit, { whole: true })} in {fmtMonth(basisMonth)}.
            </Callout>
          ))}
          {labourGap && (
            <Callout tone="warn" icon={<AlertTriangle size={16} />} title={`${fmtEUR(unallocated, { whole: true })} of the labour paid in ${fmtMonth(basisMonth)} is carried by no dish`}
              action={<Link to="/finance" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline">P&amp;L <ArrowRight size={13} /></Link>}>
              A dish only carries its preparation time, so the menu profit below is that much too optimistic. Charged against booked, per role: {labourRows.map((r) => `${r.roleName} ${r.absorbedPct === null ? 'nothing booked' : fmtPct(r.absorbedPct, 0)}`).join(' · ')}.
            </Callout>
          )}
          {budgets.length > 0 && (
            <Callout tone="warn" title={`${budgets.length} budget${budgets.length > 1 ? 's' : ''} exceeded in ${fmtMonth(basisMonth)}`}
              action={<Link to="/finance?tab=budget" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline">Budget <ArrowRight size={13} /></Link>}>
              {budgets.map((b) => `${b.category}: ${fmtEUR(b.actual, { whole: true })} of ${fmtEUR(b.budget, { whole: true })} (${b.usedPct.toFixed(0)}%)`).join(' · ')}
            </Callout>
          )}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net revenue" icon={<Euro size={15} />} value={fmtEUR(pnl.revenue, { whole: true })}
          sub={<span className={revDelta >= 0 ? 'text-good-text' : 'text-critical'}>{revDelta >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(revDelta))} vs {fmtMonth(addMonths(basisMonth, -1), true)}</span>} />
        <Stat label="Restaurant profit (P&L)" icon={<Wallet size={15} />} value={fmtEUR(pnl.profit, { whole: true })} tone={pnl.profit.isNegative() ? 'bad' : 'neutral'}
          sub={`${fmtPct(pnl.marginPct)} of net revenue after all costs`} />
        <Stat label="Menu profit (allocated)" icon={<ChefHat size={15} />} value={fmtEUR(totalProfit, { whole: true })} tone={totalProfit < 0 ? 'bad' : 'neutral'}
          sub={`${fmtPct(totalRev ? (totalProfit / totalRev) * 100 : 0)} margin after prep labour and overhead`} />
        <Stat label="Loss-making dishes" icon={<TrendingDown size={15} />} value={<>{losers.length}<span className="text-base font-normal text-ink-3"> / {costing.length}</span></>} tone={losers.length ? 'bad' : 'good'}
          sub={losers.length ? `${fmtEUR(losers.reduce((a, c) => a + c.periodProfit.toNumber(), 0), { whole: true })} lost in ${fmtMonth(basisMonth, true)}` : 'Every dish covers its true cost'} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle title="True margin per portion" subtitle="Net price minus ingredients, labour and allocated overhead. Click a bar for the breakdown."
            actions={<Link to="/menu" className="text-xs font-medium text-brand-700 hover:underline">All dishes</Link>} />
          <div style={{ height: Math.max(260, marginData.length * 34) }}>
            <ResponsiveContainer>
              <BarChart data={marginData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" {...axisProps} tickFormatter={(v) => `€${v}`} />
                <YAxis type="category" dataKey="name" width={170} {...axisProps} axisLine={false} tick={{ fill: '#52514e', fontSize: 12 }} />
                <ReferenceLine x={0} stroke="#9a9993" />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as (typeof marginData)[number]
                  return <TooltipBox title={d.name} rows={[
                    { label: 'Margin / portion', value: fmtEUR(d.margin), strong: true },
                    { label: 'Margin %', value: fmtPct(d.pct) },
                    { label: 'Portions sold', value: d.portions },
                    { label: `${fmtMonth(basisMonth, true)} total`, value: fmtEUR(d.monthly, { whole: true }) },
                  ]} />
                }} />
                <Bar isAnimationActive={false} dataKey="margin" radius={[0, 4, 4, 0]} maxBarSize={18} onClick={(d) => { window.location.hash = `#/menu/${(d as unknown as { id: string }).id}` }} className="cursor-pointer">
                  {marginData.map((d) => <Cell key={d.id} fill={d.margin < 0 ? CHART.negative : CHART.positive} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2"><Legend items={[{ label: 'Profitable', color: CHART.positive }, { label: 'Loss-making', color: CHART.negative }]} /></div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle title="Where the money goes" subtitle={`All costs in ${fmtMonth(basisMonth)} · ${fmtEUR(costTotal, { whole: true })}`}
            actions={<Link to="/finance" className="text-xs font-medium text-brand-700 hover:underline">P&amp;L</Link>} />
          <StackedShare parts={parts} total={costTotal} format={(v) => fmtEUR(v, { whole: true })} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle title="Revenue and profit by month" subtitle="Completed months: net revenue and profit after ingredients, labour and overhead." />
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ left: 4, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => `€${Math.round(v / 1000)}k`} width={48} />
                <ReferenceLine y={0} stroke="#9a9993" />
                <Tooltip cursor={{ stroke: CHART.muted }} content={({ active, payload, label }) => active && payload?.length ? (
                  <TooltipBox title={label} rows={[
                    { label: 'Net revenue', value: fmtEUR(payload[0].payload.revenue, { whole: true }), color: CHART.series[0] },
                    { label: 'Profit', value: fmtEUR(payload[0].payload.profit, { whole: true }), color: CHART.series[2], strong: true },
                  ]} />
                ) : null} />
                <Line isAnimationActive={false} dataKey="revenue" stroke={CHART.series[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
                <Line isAnimationActive={false} dataKey="profit" stroke={CHART.series[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2"><Legend items={[{ label: 'Net revenue', color: CHART.series[0] }, { label: 'Profit', color: CHART.series[2] }]} /></div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle title="Data health" icon={<Database size={16} />} subtitle="Stale inputs give confident but wrong margins." />
          <ul className="space-y-3 text-sm">
            <HealthRow ok={!!lastSale && daysBetween(lastSale, TODAY) <= 1} icon={<CalendarClock size={15} />}
              title="Daily sales" detail={lastSale ? `Last entry ${fmtDate(lastSale)}` : 'No sales yet'} to="/sales"
              badge={lastSale ? <Freshness days={daysBetween(lastSale, TODAY)} staleAfter={1} /> : undefined} />
            <HealthRow ok={stale.length === 0} icon={<AlertTriangle size={15} />}
              title={stale.length ? `${stale.length} ingredient price${stale.length > 1 ? 's' : ''} older than ${s.settings.staleAfterDays} days` : 'All ingredient prices are recent'}
              detail={stale.slice(0, 3).map((x) => x.ing.name).join(', ')} to="/inventory?filter=stale" />
            {s.settings.flags.inventoryAlerts && (
              <HealthRow ok={lowStock.length === 0} icon={<PackageX size={15} />}
                title={lowStock.length ? `${lowStock.length} item${lowStock.length > 1 ? 's' : ''} below reorder level` : 'Stock levels fine'}
                detail={lowStock.slice(0, 3).map((i) => i.name).join(', ')} to="/inventory?tab=stock" />
            )}
            <HealthRow ok={weekPublished === true && violationCount === 0} icon={<CalendarClock size={15} />}
              title={weekPublished ? 'This week’s roster is published' : 'This week’s roster is still a draft'}
              detail={violationCount ? `${violationCount} working-time warning${violationCount > 1 ? 's' : ''} to resolve before publishing` : 'No working-time warnings'} to="/workforce" />
          </ul>
          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-ink-2">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-ink"><TrendingUp size={13} /> Biggest earners in {fmtMonth(basisMonth, true)}</div>
            {[...costing].sort((a, b) => b.periodProfit.cmp(a.periodProfit)).slice(0, 3).map((c) => (
              <div key={c.itemId} className="flex justify-between py-0.5"><span>{c.name}</span><span className="tabular font-medium text-ink">{fmtEUR(c.periodProfit, { whole: true })}</span></div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

function HealthRow({ ok, icon, title, detail, to, badge }: { ok: boolean; icon: ReactNode; title: string; detail?: string; to: string; badge?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="group flex items-start gap-3 rounded-lg p-1 -m-1 hover:bg-slate-50">
        <span className={ok ? 'mt-0.5 text-good' : 'mt-0.5 text-amber-500'}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium text-ink">{title} {badge}</span>
          {detail && <span className="block truncate text-xs text-ink-2">{detail}</span>}
        </span>
        {!ok && <Badge tone="warn">Check</Badge>}
      </Link>
    </li>
  )
}
