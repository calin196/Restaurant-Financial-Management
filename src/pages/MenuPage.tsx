import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp, Archive, Info, Plus, Search, Timer } from 'lucide-react'
import { actions } from '../state/store'
import { useMenuState, useSharedState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { useAllPolicies, useCosting } from '../ui/hooks'
import { Badge, Button, Callout, Card, CardTitle, Input, PageHeader, Segmented, Td, Th, cx } from '../ui/kit'
import DishEditor from '../ui/DishEditor'
import { fmtEUR, fmtPct } from '../domain/shared/money'
import { fmtMonth } from '../domain/shared/dates'
import { POLICY_LABELS, type CostBreakdown } from '../domain/menuCosting/costing'
import type { AllocationPolicy } from '../domain/types'

type SortKey = 'name' | 'netPrice' | 'ingredientCost' | 'labour' | 'overhead' | 'trueCost' | 'margin' | 'marginPct' | 'portions' | 'periodProfit' | 'foodCostPct' | 'foodOnlyMargin'

const val = (c: CostBreakdown, k: SortKey): number | string => {
  switch (k) {
    case 'name': return c.name
    case 'labour': return c.labour.cost.toNumber()
    case 'overhead': return c.overhead.cost.toNumber()
    case 'marginPct': return c.marginPct
    case 'foodCostPct': return c.foodCostPct
    case 'portions': return c.portions
    default: return (c[k] as { toNumber(): number }).toNumber()
  }
}

export default function MenuPage() {
  const s = { ...useMenuState(), ...useSharedState() }
  const { basisMonth } = useApp()
  const { costing, inputs } = useCosting()
  const all = useAllPolicies()
  const nav = useNavigate()
  const [view, setView] = useState<'true' | 'food'>(s.settings.flags.trueCostView ? 'true' : 'food')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'margin', dir: 1 })
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'All' | 'Starter' | 'Main' | 'Dessert' | 'Drink'>('All')
  const [editing, setEditing] = useState(false)
  const [compare, setCompare] = useState(false)

  const rows = useMemo(() => {
    const filtered = costing.filter((c) => (cat === 'All' || c.category === cat) && c.name.toLowerCase().includes(q.toLowerCase()))
    return filtered.sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key)
      return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sort.dir
    })
  }, [costing, sort, q, cat])
  const archived = s.menuItems.filter((m) => m.archived)

  const header = (key: SortKey, label: string, right = true) => (
    <Th className={right ? 'text-right' : ''} active={sort.key === key} onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 })}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</span>
    </Th>
  )

  const totals = rows.reduce((a, c) => ({ rev: a.rev + c.periodRevenue.toNumber(), profit: a.profit + c.periodProfit.toNumber(), portions: a.portions + c.portions }), { rev: 0, profit: 0, portions: 0 })

  return (
    <>
      <PageHeader
        eyebrow="Menu Costing & Profitability"
        title="Menu & profitability"
        subtitle={<>True cost per dish = ingredients + labour (prep minutes × role rate) + allocated overhead. Volumes and the overhead pool come from <b className="font-medium text-ink">{fmtMonth(basisMonth)}</b>; ingredient prices are the latest known.</>}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing(true)}>New dish</Button>}
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">Overhead allocation policy <Badge tone="brand">Your choice</Badge></div>
            <p className="mt-1 text-xs text-ink-2">{POLICY_LABELS[s.settings.allocationPolicy].explain} Pool for {fmtMonth(basisMonth)}: <b className="font-semibold text-ink">{fmtEUR(inputs.overheadPool)}</b>.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Segmented<AllocationPolicy> value={s.settings.allocationPolicy} onChange={actions.setPolicy}
              options={(Object.keys(POLICY_LABELS) as AllocationPolicy[]).map((p) => ({ value: p, label: POLICY_LABELS[p].name, title: POLICY_LABELS[p].short }))} />
            <button onClick={() => setCompare(!compare)} className="text-xs font-medium text-brand-700 hover:underline">{compare ? 'Hide' : 'Compare'} all three policies</button>
          </div>
        </div>
        {compare && (
          <div className="anim-fade mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead><tr><Th>Dish</Th>{(Object.keys(POLICY_LABELS) as AllocationPolicy[]).map((p) => <Th key={p} className="text-right">{POLICY_LABELS[p].name}</Th>)}<Th className="text-right">Spread</Th></tr></thead>
              <tbody>
                {all.perPortion.map((c) => {
                  const ms = (Object.keys(all) as AllocationPolicy[]).map((p) => all[p].find((x) => x.itemId === c.itemId)!.margin)
                  const spread = Math.max(...ms.map((m) => m.toNumber())) - Math.min(...ms.map((m) => m.toNumber()))
                  return (
                    <tr key={c.itemId}>
                      <Td>{c.name}</Td>
                      {ms.map((m, i) => <Td key={i} className={cx('tabular text-right', m.isNegative() && 'font-medium text-critical')}>{fmtEUR(m)}</Td>)}
                      <Td className="tabular text-right text-ink-2">{fmtEUR(spread)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="border-t border-line bg-slate-50/70 px-3 py-2 text-xs text-ink-2">Margin per portion under each policy (experiment E3). A large spread means the policy choice changes the decision for that dish.</div>
          </div>
        )}
      </Card>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute top-2.5 left-3 text-ink-3" />
            <Input placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Segmented size="sm" value={cat} onChange={setCat} options={(['All', 'Starter', 'Main', 'Dessert', 'Drink'] as const).map((c) => ({ value: c, label: c }))} />
          <div className="flex-1" />
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'food', label: 'Food cost only' }, { value: 'true', label: 'True cost' }]} />
        </div>
        {view === 'food' && (
          <div className="border-b border-line p-4">
            <Callout tone="warn" title="This is the view a food-cost spreadsheet gives you">
              Every dish looks profitable here. Switch to <button className="font-semibold underline" onClick={() => setView('true')}>True cost</button> to include labour and overhead.
            </Callout>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr>
                {header('name', 'Dish', false)}
                {header('netPrice', 'Net price')}
                {header('ingredientCost', 'Ingredients')}
                {view === 'true' ? (
                  <>
                    {header('labour', 'Labour')}
                    {header('overhead', 'Overhead')}
                    {header('trueCost', 'True cost')}
                    {header('margin', 'Margin')}
                    {header('marginPct', 'Margin %')}
                  </>
                ) : (
                  <>
                    {header('foodCostPct', 'Food cost %')}
                    {header('foodOnlyMargin', 'Gross margin')}
                  </>
                )}
                {header('portions', 'Sold')}
                {view === 'true' && header('periodProfit', `${fmtMonth(basisMonth, true)} profit`)}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const loss = view === 'true' && c.margin.isNegative()
                return (
                  <tr key={c.itemId} onClick={() => nav(`/menu/${c.itemId}`)} className={cx('cursor-pointer transition hover:bg-slate-50', loss && 'bg-red-50/50 hover:bg-red-50')}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className={cx('h-7 w-1 rounded-full', loss ? 'bg-critical' : 'bg-transparent')} />
                        <div>
                          <div className="font-medium text-ink">{c.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                            {c.category}
                            {loss && <Badge tone="bad">Loss</Badge>}
                            {c.labour.estimate && view === 'true' && <Badge tone="neutral" icon={<Timer size={10} />} title="Prep time is an estimate">Est.</Badge>}
                            {c.staleInputs > 0 && <Badge tone="warn" icon={<AlertTriangle size={10} />} title={`${c.staleInputs} ingredient price(s) older than ${s.settings.staleAfterDays} days`}>Stale price</Badge>}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td className="tabular text-right">{fmtEUR(c.netPrice)}</Td>
                    <Td className="tabular text-right">{fmtEUR(c.ingredientCost)}</Td>
                    {view === 'true' ? (
                      <>
                        <Td className="tabular text-right">{fmtEUR(c.labour.cost)}</Td>
                        <Td className="tabular text-right">{fmtEUR(c.overhead.cost)}</Td>
                        <Td className="tabular text-right font-medium">{fmtEUR(c.trueCost)}</Td>
                        <Td className={cx('tabular text-right font-semibold', c.margin.isNegative() ? 'text-critical' : 'text-ink')}>{fmtEUR(c.margin)}</Td>
                        <Td className="text-right"><MarginPill pct={c.marginPct} /></Td>
                      </>
                    ) : (
                      <>
                        <Td className="tabular text-right">{fmtPct(c.foodCostPct)}</Td>
                        <Td className="tabular text-right font-semibold text-good-text">{fmtEUR(c.foodOnlyMargin)}</Td>
                      </>
                    )}
                    <Td className="tabular text-right text-ink-2">{c.portions.toLocaleString('en-IE')}</Td>
                    {view === 'true' && <Td className={cx('tabular text-right font-medium', c.periodProfit.isNegative() ? 'text-critical' : 'text-ink')}>{fmtEUR(c.periodProfit, { whole: true })}</Td>}
                  </tr>
                )
              })}
            </tbody>
            {view === 'true' && (
              <tfoot>
                <tr className="bg-slate-50/80 text-sm">
                  <Td className="font-medium">Total ({rows.length} dishes)</Td>
                  <Td colSpan={7} className="text-right text-xs text-ink-2">Net revenue {fmtEUR(totals.rev, { whole: true })} · margin {fmtPct(totals.rev ? (totals.profit / totals.rev) * 100 : 0)}</Td>
                  <Td className="tabular text-right font-medium">{totals.portions.toLocaleString('en-IE')}</Td>
                  <Td className={cx('tabular text-right font-semibold', totals.profit < 0 ? 'text-critical' : '')}>{fmtEUR(totals.profit, { whole: true })}</Td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="mt-4 flex items-start gap-2 text-xs text-ink-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        Each cost component is rounded to the cent, so the numbers can be checked by hand. Labour uses an aggregated rate per role; no individual wages are used.
      </div>

      {archived.length > 0 && (
        <Card className="mt-6">
          <CardTitle title="Archived dishes" icon={<Archive size={16} />} subtitle="Archived dishes keep their history and sales; nothing is deleted." />
          <div className="flex flex-wrap gap-2">
            {archived.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                <Link to={`/menu/${m.id}`} className="text-ink hover:underline">{m.name}</Link>
                <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => actions.setArchivedMenuItem(m.id, false)}>Restore</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing && <DishEditor onClose={() => setEditing(false)} onSaved={(id) => nav(`/menu/${id}`)} />}
    </>
  )
}

export function MarginPill({ pct }: { pct: number }) {
  const tone = pct < 0 ? 'bad' : pct < 5 ? 'warn' : 'good'
  return <Badge tone={tone} className="tabular">{fmtPct(pct)}</Badge>
}
