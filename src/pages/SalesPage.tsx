import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, ChevronLeft, ChevronRight, FileUp, Lock, Minus, Plus, Upload, XCircle } from 'lucide-react'
import { actions } from '../state/store'
import { useSalesState, useSharedState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { Badge, Button, Callout, Card, CardTitle, Input, PageHeader, Select, Tabs, Td, Th, cx } from '../ui/kit'
import { CHART, TooltipBox, axisProps } from '../ui/charts'
import { D, cents, fmtEUR, netFromGross, sum } from '../domain/shared/money'
import { TODAY, WEEKDAYS, addDays, fmtDate, fmtMonth, monthDays, monthOf, weekday } from '../domain/shared/dates'
import { parseSalesCsv, portionsByItem, salesForMonth, salesMonths, saleNet, type CsvRow } from '../domain/sales/sales'
import { VAT_RATES } from '../domain/menuCosting/costing'
import { useMenuCatalogue, usePeriodStatus } from '../state/published'

type Tab = 'entry' | 'csv' | 'history'

export default function SalesPage() {
  const [tab, setTab] = useState<Tab>('entry')
  return (
    <>
      <PageHeader eyebrow="Sales" title="Sales"
        subtitle="Portions sold drive revenue, overhead allocation and labour per dish, so they are needed from day one. Enter them daily, import a CSV from your till, or (phase 2) connect your POS." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'entry', label: 'Daily entry' }, { value: 'csv', label: 'Import CSV' }, { value: 'history', label: 'History' }]} />
      {tab === 'entry' && <DailyEntry />}
      {tab === 'csv' && <CsvImport />}
      {tab === 'history' && <History />}
    </>
  )
}

function DailyEntry() {
  const s = { ...useSalesState(), ...useSharedState(), ...useMenuCatalogue() }
  const monthLocked = usePeriodStatus()
  const { attempt } = useApp()
  const [date, setDate] = useState(TODAY)
  const items = s.menuItems.filter((m) => !m.archived)
  const locked = monthLocked(monthOf(date))
  const existing = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of s.sales) if (r.date === date && r.source === 'manual') out[r.menuItemId] = (out[r.menuItemId] ?? 0) + r.quantity
    return out
  }, [s.sales, date])
  const imported = useMemo(() => s.sales.filter((r) => r.date === date && r.source !== 'manual').reduce((a, r) => a + r.quantity, 0), [s.sales, date])
  const [qty, setQty] = useState<Record<string, number>>(existing)
  useEffect(() => setQty(existing), [existing])

  const dirty = JSON.stringify(qty) !== JSON.stringify(existing)
  const total = Object.values(qty).reduce((a, b) => a + (b || 0), 0)
  const net = sum(items.map((m) => {
    const v = m
    return cents(netFromGross(v.grossPrice, VAT_RATES[v.vatCategory])).times(qty[m.id] ?? 0)
  }))

  // E1: is the manager entering sales daily? Last 14 days.
  const strip = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i - 13))
  const daysWithSales = new Set(s.sales.map((r) => r.date))
  const last7 = strip.slice(-8, -1).filter((d) => daysWithSales.has(d)).length

  const groups = (['Starter', 'Main', 'Dessert', 'Drink'] as const).map((c) => ({ c, items: items.filter((m) => m.category === c) })).filter((g) => g.items.length)

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></Button>
            <Input type="date" value={date} max={TODAY} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
            <Button size="sm" variant="ghost" disabled={date >= TODAY} onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={16} /></Button>
            <span className="ml-1 text-sm text-ink-2">{WEEKDAYS[weekday(date)]} {fmtDate(date)}</span>
          </div>
          {locked ? <Badge tone="neutral" icon={<Lock size={11} />}>{fmtMonth(monthOf(date))} is closed</Badge> : Object.keys(existing).length ? <Badge tone="good" icon={<CheckCircle2 size={11} />}>Entered</Badge> : <Badge tone="warn">Not entered yet</Badge>}
        </div>
        {locked && <div className="border-b border-line p-4"><Callout tone="info" icon={<Lock size={16} />} title="This period is closed">Closed months are immutable (7-year retention). Corrections go into the current period.</Callout></div>}
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <div key={g.c} className="px-4 py-3">
              <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{g.c}s</div>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {g.items.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{m.name}</div><div className="text-xs text-ink-3">{fmtEUR(D(m.grossPrice))}</div></div>
                    <div className="flex items-center gap-1">
                      <button disabled={locked} onClick={() => setQty({ ...qty, [m.id]: Math.max(0, (qty[m.id] ?? 0) - 1) })} className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-2 hover:bg-slate-50 disabled:opacity-40" aria-label={`Fewer ${m.name}`}><Minus size={14} /></button>
                      <input disabled={locked} type="number" min={0} value={qty[m.id] ?? ''} placeholder="0" onChange={(e) => setQty({ ...qty, [m.id]: Math.max(0, Math.floor(Number(e.target.value))) })}
                        className="tabular h-8 w-16 rounded-md border border-line text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50" />
                      <button disabled={locked} onClick={() => setQty({ ...qty, [m.id]: (qty[m.id] ?? 0) + 1 })} className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-2 hover:bg-slate-50 disabled:opacity-40" aria-label={`More ${m.name}`}><Plus size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-slate-50/70 px-4 py-3">
          <div className="text-sm text-ink-2"><b className="tabular text-ink">{total}</b> portions · net revenue <b className="tabular text-ink">{fmtEUR(net)}</b>{imported > 0 && <span className="ml-2 text-xs">(+{imported} imported by CSV)</span>}</div>
          <div className="flex gap-2">
            {dirty && <Button variant="ghost" onClick={() => setQty(existing)}>Discard</Button>}
            <Button variant="primary" disabled={locked || !dirty} onClick={() => attempt(() => actions.recordDailySales(date, qty), 'Sales saved', `${total} portions for ${fmtDate(date)}. Dish margins updated.`)}>Save day</Button>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardTitle title="Entry streak" subtitle="Experiment E1: do managers enter sales at least 4 days a week?" />
          <div className="grid grid-cols-7 gap-1.5">
            {strip.map((d) => {
              const has = daysWithSales.has(d)
              return (
                <button key={d} onClick={() => setDate(d)} title={fmtDate(d)} className={cx('flex flex-col items-center rounded-md py-1.5 text-[10px] transition', d === date ? 'ring-2 ring-brand-500' : '', has ? 'bg-brand-50 text-brand-700' : d === TODAY ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-ink-3')}>
                  <span>{WEEKDAYS[weekday(d)].slice(0, 2)}</span>
                  <span className="text-xs font-semibold">{Number(d.slice(-2))}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 text-sm text-ink-2"><b className="text-ink">{last7} of 7</b> days entered last week {last7 >= 4 ? <Badge tone="good">On track</Badge> : <Badge tone="warn">Below 4/week</Badge>}</div>
        </Card>
        <Card>
          <CardTitle title="POS connection" subtitle="Phase 2 · one adapter per POS vendor" />
          {s.settings.flags.posIntegration ? (
            s.settings.posOutage
              ? <Callout tone="warn" title="POS unreachable">Last sync {fmtDate(s.settings.lastPosSync.slice(0, 10))}. Costing keeps using stored sales and shows their age.</Callout>
              : <Callout tone="good" title="Connected">Sales arrive automatically after closing time.</Callout>
          ) : <p className="text-sm text-ink-2">Not connected. Enable the POS integration flag in Settings to preview the phase-2 behaviour.</p>}
        </Card>
      </div>
    </div>
  )
}

const EXAMPLE = `date,item,quantity
2026-10-28,Seafood Risotto,9
2026-10-28,Margherita pizza,21
2026-10-28,Espresso,14
2026-10-28,Truffle fries,6
2026-10-28,House red wine,25
2026-10-28,Tiramisu,abc`

function CsvImport() {
  const s = { ...useSalesState(), ...useSharedState(), ...useMenuCatalogue() }
  const monthLocked = usePeriodStatus()
  const { attempt } = useApp()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<CsvRow[] | null>(null)
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const items = s.menuItems.filter((m) => !m.archived)

  const parse = (t: string) => { setText(t); setRows(parseSalesCsv(t, items)); setMapping({}) }
  const resolved = (rows ?? []).map((r) => ({ ...r, target: r.matchedItemId ?? mapping[r.line] ?? null, locked: !r.error && monthLocked(monthOf(r.date)) }))
  const importable = resolved.filter((r) => !r.error && !r.locked && r.target && r.target !== 'skip')
  const unmatched = resolved.filter((r) => !r.error && !r.matchedItemId)

  const onFile = (f: File | undefined) => { if (f) f.text().then(parse) }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-1">
        <CardTitle title="Upload or paste" subtitle="Columns: date (YYYY-MM-DD), item name, quantity. Comma, semicolon or tab separated." />
        <label className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-slate-50/50 px-4 py-6 text-center hover:border-brand-500 hover:bg-brand-50/40">
          <FileUp size={22} className="mb-2 text-ink-3" />
          <span className="text-sm font-medium">Choose a CSV file</span>
          <span className="text-xs text-ink-3">exported from your till or spreadsheet</span>
          <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="date,item,quantity" className="w-full rounded-lg border border-line p-3 font-mono text-xs outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100" />
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" onClick={() => parse(EXAMPLE)}>Load example</Button>
          <Button className="flex-1" disabled={!text.trim()} onClick={() => parse(text)}>Check file</Button>
        </div>
      </Card>

      <Card className="xl:col-span-2" padded={false}>
        <div className="p-5 pb-3"><CardTitle title="Preview" subtitle="Unmatched lines are flagged. Map them to a dish or skip them; nothing is imported silently." /></div>
        {!rows ? <div className="px-5 pb-8 text-sm text-ink-3">Upload a file or load the example to see the preview.</div> : (
          <>
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              <Badge tone="good">{resolved.filter((r) => r.matchedItemId).length} matched</Badge>
              {unmatched.length > 0 && <Badge tone="warn">{unmatched.length} unmatched</Badge>}
              {resolved.some((r) => r.error) && <Badge tone="bad">{resolved.filter((r) => r.error).length} invalid</Badge>}
              {resolved.some((r) => r.locked) && <Badge tone="neutral">{resolved.filter((r) => r.locked).length} in a closed month</Badge>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr><Th>Line</Th><Th>Date</Th><Th>Item in file</Th><Th className="text-right">Qty</Th><Th>Matches dish</Th></tr></thead>
                <tbody>
                  {resolved.map((r) => (
                    <tr key={r.line} className={r.error ? 'bg-red-50/40' : !r.matchedItemId ? 'bg-amber-50/40' : ''}>
                      <Td className="text-xs text-ink-3">{r.line}</Td>
                      <Td className="tabular">{r.date}</Td>
                      <Td>{r.itemName}</Td>
                      <Td className="tabular text-right">{Number.isFinite(r.quantity) ? r.quantity : '—'}</Td>
                      <Td>
                        {r.error ? <span className="inline-flex items-center gap-1 text-xs text-critical"><XCircle size={13} />{r.error}</span>
                          : r.locked ? <Badge tone="neutral" icon={<Lock size={10} />}>Month closed</Badge>
                          : r.matchedItemId ? <span className="inline-flex items-center gap-1 text-sm text-good-text"><CheckCircle2 size={14} />{items.find((m) => m.id === r.matchedItemId)?.name}</span>
                          : (
                            <Select className="h-8 text-xs" value={mapping[r.line] ?? ''} onChange={(e) => setMapping({ ...mapping, [r.line]: e.target.value })}>
                              <option value="">Unmatched: choose…</option>
                              <option value="skip">Skip this line</option>
                              {items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </Select>
                          )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line bg-slate-50/70 px-5 py-3">
              <span className="text-sm text-ink-2">{importable.length} line(s) · {importable.reduce((a, r) => a + r.quantity, 0)} portions ready</span>
              <Button variant="primary" icon={<Upload size={15} />} disabled={!importable.length || unmatched.some((r) => !mapping[r.line])}
                onClick={() => attempt(() => { actions.importSales(importable.map((r) => ({ date: r.date, menuItemId: r.target!, quantity: r.quantity }))); setRows(null); setText('') }, 'Sales imported', 'ItemsSold published to Menu Costing and Finance.')}>
                Import
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function History() {
  const s = { ...useSalesState(), ...useSharedState(), ...useMenuCatalogue() }
  const monthLocked = usePeriodStatus()
  const months = salesMonths(s.sales)
  const [month, setMonth] = useState(months.at(-1) ?? monthOf(TODAY))
  const ms = salesForMonth(s.sales, month)
  const portions = portionsByItem(s.sales, month)
  const days = monthDays(month).filter((d) => d < TODAY || monthOf(d) < monthOf(TODAY))
  const daily = days.map((d) => {
    const recs = s.sales.filter((r) => r.date === d)
    return { date: d, label: String(Number(d.slice(-2))), portions: recs.reduce((a, r) => a + r.quantity, 0), net: sum(recs.map(saleNet)).toNumber(), wd: WEEKDAYS[weekday(d)] }
  })
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-48">{months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}</Select>
        <span className="text-sm text-ink-2">{ms.portions.toLocaleString('en-IE')} portions · {fmtEUR(ms.net, { whole: true })} net · {fmtEUR(ms.gross.minus(ms.net), { whole: true })} VAT</span>
        {monthLocked(month) && <Badge icon={<Lock size={10} />}>Closed</Badge>}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle title="Portions per day" subtitle="Weekends are busier; the forecast in Insights uses this pattern." />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" {...axisProps} interval={1} />
                <YAxis {...axisProps} axisLine={false} width={40} />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={({ active, payload }) => active && payload?.length ? (
                  <TooltipBox title={`${payload[0].payload.wd} ${fmtDate(payload[0].payload.date)}`} rows={[
                    { label: 'Portions', value: payload[0].payload.portions, color: CHART.series[0], strong: true },
                    { label: 'Net revenue', value: fmtEUR(payload[0].payload.net, { whole: true }) },
                  ]} />
                ) : null} />
                <Bar isAnimationActive={false} dataKey="portions" fill={CHART.series[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-2" padded={false}>
          <table className="w-full">
            <thead><tr><Th>Dish</Th><Th className="text-right">Portions</Th><Th className="text-right">Net revenue</Th></tr></thead>
            <tbody>
              {s.menuItems.filter((m) => portions.get(m.id)).sort((a, b) => (portions.get(b.id) ?? 0) - (portions.get(a.id) ?? 0)).map((m) => (
                <tr key={m.id}>
                  <Td>{m.name}</Td>
                  <Td className="tabular text-right">{portions.get(m.id)}</Td>
                  <Td className="tabular text-right">{fmtEUR(sum(s.sales.filter((r) => r.menuItemId === m.id && monthOf(r.date) === month).map(saleNet)), { whole: true })}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line px-3 py-2 text-xs text-ink-2">VAT: {ms.vat.map((v) => `${v.rate}% on ${fmtEUR(v.net, { whole: true })}`).join(' · ')}</div>
        </Card>
      </div>
    </>
  )
}
