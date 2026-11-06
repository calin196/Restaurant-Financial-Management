import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, Calculator, FlaskConical, History, Pencil, RotateCcw, Timer } from 'lucide-react'
import { actions } from '../state/store'
import { useMenuState, useSharedState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { useCosting } from '../ui/hooks'
import { Badge, Button, Callout, Card, CardTitle, EmptyState, Freshness, Input, PageHeader, Stat, cx } from '../ui/kit'
import { CHART, Legend } from '../ui/charts'
import DishEditor from '../ui/DishEditor'
import { MarginPill } from './MenuPage'
import { D, fmtEUR, fmtPct, type Dec } from '../domain/shared/money'
import { fmtDate, fmtMonth } from '../domain/shared/dates'
import { POLICY_LABELS, currentVersion, whatIf } from '../domain/menuCosting/costing'
import { useDishSalesHistory } from '../state/published'

export default function DishPage() {
  const { id } = useParams()
  const s = { ...useMenuState(), ...useSharedState() }
  const nav = useNavigate()
  const { basisMonth, toast } = useApp()
  const { costing, inputs } = useCosting()
  const item = s.menuItems.find((m) => m.id === id)
  const c = costing.find((x) => x.itemId === id)
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState<string | null>(null)
  const [prep, setPrep] = useState<number | null>(null)

  const history = useDishSalesHistory(id ?? '')

  if (!item) return <Card><EmptyState title="Dish not found"><Link to="/menu" className="text-brand-700 underline">Back to the menu</Link></EmptyState></Card>
  if (item.archived || !c)
    return (
      <Card>
        <EmptyState icon={<Archive size={20} />} title={`${item.name} is archived`}>
          Its recipe versions and sales history are kept. <button className="font-medium text-brand-700 underline" onClick={() => actions.setArchivedMenuItem(item.id, false)}>Restore it</button> to cost it again.
        </EmptyState>
      </Card>
    )

  const v = currentVersion(item)
  const sim = price !== null || prep !== null
  const simPrice = price ?? v.grossPrice
  const simPrep = prep ?? v.prepMinutes
  const validSim = /^\d+(\.\d{1,2})?$/.test(simPrice) && Number(simPrice) > 0
  const w = validSim ? whatIf(s.menuItems, item, inputs, { grossPrice: simPrice, prepMinutes: simPrep }) : c

  const applySim = () => {
    actions.saveMenuItem(item.id, item, { ...v, grossPrice: D(simPrice).toFixed(2), prepMinutes: simPrep, note: 'Applied from what-if simulator' })
    setPrice(null); setPrep(null)
    toast('New version saved', `${item.name} now costs out at ${fmtEUR(w.margin)} margin per portion.`)
  }

  return (
    <>
      <Link to="/menu" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Menu & profitability</Link>
      <PageHeader
        title={item.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {item.category} · {fmtEUR(c.grossPrice)} on the menu ({c.vatRate}% VAT) · prepared by {c.labour.roleName.toLowerCase()}
          {c.margin.isNegative() ? <Badge tone="bad">Loss-making</Badge> : <Badge tone="good">Profitable</Badge>}
        </span>}
        actions={<>
          <Button icon={<Archive size={15} />} variant="ghost" onClick={() => { actions.setArchivedMenuItem(item.id, true); toast('Dish archived', 'History and sales are kept.'); nav('/menu') }}>Archive</Button>
          <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>Edit recipe & price</Button>
        </>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Net price" value={fmtEUR(c.netPrice)} sub={`${fmtEUR(c.grossPrice)} ÷ ${(1 + c.vatRate / 100).toFixed(2)} (VAT)`} />
        <Stat label="True cost per portion" value={fmtEUR(c.trueCost)} sub={`Food cost alone: ${fmtEUR(c.ingredientCost)} (${fmtPct(c.foodCostPct, 0)})`} />
        <Stat label="Margin per portion" value={fmtEUR(c.margin)} tone={c.margin.isNegative() ? 'bad' : 'good'} sub={<MarginPill pct={c.marginPct} />} />
        <Stat label={`Profit in ${fmtMonth(basisMonth)}`} value={fmtEUR(c.periodProfit, { whole: true })} tone={c.periodProfit.isNegative() ? 'bad' : 'neutral'} sub={`${c.portions} portions sold`} />
      </div>

      <Card className="mb-6">
        <CardTitle title="Where the net price goes" subtitle="Each portion’s net price against its three cost components" />
        <PriceBar net={c.netPrice} parts={[
          { label: 'Ingredients', v: c.ingredientCost, color: CHART.series[0] },
          { label: 'Labour', v: c.labour.cost, color: CHART.series[1] },
          { label: 'Overhead', v: c.overhead.cost, color: CHART.series[4] },
        ]} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-5 pb-0"><CardTitle icon={<Calculator size={16} />} title="How this number was calculated" subtitle="Every input, its source and its age. Each component is rounded to the cent." /></div>
          <Section title="1 · Ingredients" total={c.ingredientCost} note="Inventory: latest price per base unit · quantity ÷ yield = quantity bought">
            <table className="w-full text-sm">
              <thead className="text-[11px] tracking-wide text-ink-3 uppercase">
                <tr><th className="py-1.5 text-left font-medium">Ingredient</th><th className="py-1.5 text-right font-medium">Qty</th><th className="py-1.5 text-right font-medium">Yield</th><th className="py-1.5 text-right font-medium">Price</th><th className="py-1.5 pl-3 text-left font-medium">Price date</th><th className="py-1.5 text-right font-medium">Cost</th></tr>
              </thead>
              <tbody>
                {c.ingredients.map((l) => (
                  <tr key={l.ingredientId} className="border-t border-line/60">
                    <td className="py-2"><Link to={`/inventory?ingredient=${l.ingredientId}`} className="text-ink hover:text-brand-700 hover:underline">{l.name}</Link></td>
                    <td className="tabular py-2 text-right text-ink-2">{l.quantity} {l.unit}</td>
                    <td className="tabular py-2 text-right text-ink-2">{l.yieldPct}%</td>
                    <td className="tabular py-2 text-right text-ink-2">{l.purchasePrice ? `${fmtEUR(l.purchasePrice)}/${l.purchaseUnit}` : <Badge tone="bad">No price</Badge>}</td>
                    <td className="py-2 pl-3">{l.ageDays !== null && <Freshness days={l.ageDays} staleAfter={s.settings.staleAfterDays} />}</td>
                    <td className="tabular py-2 text-right" title="Exact cost before rounding">€{l.cost.toFixed(4).slice(0, -2)}<span className="text-ink-3">{l.cost.toFixed(4).slice(-2)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="2 · Labour" total={c.labour.cost} note="Workforce: employer cost per hour for the role, never an individual wage">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span className="tabular rounded-md bg-slate-100 px-2 py-1 text-ink">{fmtEUR(c.labour.rate)}/h</span> {c.labour.roleName} rate ×
              <span className="tabular rounded-md bg-slate-100 px-2 py-1 text-ink">{c.labour.minutes} min</span> ÷ 60
              {c.labour.estimate && <Badge tone="warn" icon={<Timer size={10} />}>Prep time is an estimate</Badge>}
            </div>
          </Section>
          <Section title="3 · Overhead" total={c.overhead.cost} note={`Finance: overhead pool of ${fmtMonth(basisMonth)} · policy chosen by the manager`}>
            <div className="text-sm text-ink-2">
              <Badge tone="brand">{POLICY_LABELS[c.overhead.policy].name}</Badge>
              <span className="tabular ml-2">{c.overhead.formula}</span>
            </div>
          </Section>
          <div className="flex items-center justify-between border-t-2 border-ink/80 px-5 py-3.5 text-sm">
            <span className="font-medium text-ink">Net price {fmtEUR(c.netPrice)} − true cost {fmtEUR(c.trueCost)}</span>
            <span className={cx('tabular text-base font-semibold', c.margin.isNegative() ? 'text-critical' : 'text-good-text')}>{fmtEUR(c.margin)} per portion</span>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle icon={<FlaskConical size={16} />} title="What if…" subtitle="Try a new price or prep time. Nothing changes until you apply it." />
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-2"><span>Menu price (incl. VAT)</span><span className="tabular text-ink">{validSim ? fmtEUR(D(simPrice)) : '—'}</span></div>
                <input type="range" min={Math.max(1, Math.floor(Number(v.grossPrice) * 0.6))} max={Math.ceil(Number(v.grossPrice) * 1.5)} step={0.5}
                  value={Number(simPrice) || 0} onChange={(e) => setPrice(Number(e.target.value).toFixed(2))} className="w-full accent-brand-600" />
                <Input className="mt-2" inputMode="decimal" value={simPrice} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-2"><span>Prep time</span><span className="tabular text-ink">{simPrep} min</span></div>
                <input type="range" min={0} max={Math.max(30, v.prepMinutes * 2)} value={simPrep} onChange={(e) => setPrep(Number(e.target.value))} className="w-full accent-brand-600" />
              </div>
              <div className="rounded-lg bg-slate-50 p-3.5">
                <Row label="Net price" a={c.netPrice} b={w.netPrice} />
                <Row label="Labour" a={c.labour.cost} b={w.labour.cost} />
                <Row label="Overhead" a={c.overhead.cost} b={w.overhead.cost} />
                <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
                  <span className="text-sm font-medium text-ink">Margin</span>
                  <span className={cx('tabular text-lg font-semibold', w.margin.isNegative() ? 'text-critical' : 'text-good-text')}>{fmtEUR(w.margin)}</span>
                </div>
                {sim && validSim && (
                  <div className="mt-1 text-right text-xs text-ink-2">
                    {fmtEUR(w.margin.minus(c.margin), { sign: true })} per portion · {fmtEUR(w.margin.minus(c.margin).times(c.portions), { sign: true, whole: true })}/month at {c.portions} portions
                  </div>
                )}
              </div>
              {sim && (
                <div className="flex gap-2">
                  <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => { setPrice(null); setPrep(null) }}>Reset</Button>
                  <Button variant="primary" className="flex-1" disabled={!validSim} onClick={applySim}>Apply as new version</Button>
                </div>
              )}
              {sim && <p className="text-[11px] text-ink-3">Sales volume is kept constant; a higher price may sell fewer portions.</p>}
            </div>
          </Card>

          <Card>
            <CardTitle icon={<History size={16} />} title="Versions" subtitle="Recipes and prices are versioned, never overwritten" />
            <ol className="relative space-y-3 border-l border-line pl-4">
              {[...item.versions].reverse().map((ver, i) => (
                <li key={i} className="text-sm">
                  <span className={cx('absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white', i === 0 ? 'bg-brand-600' : 'bg-slate-300')} />
                  <div className="flex items-center gap-2 font-medium text-ink">{fmtEUR(D(ver.grossPrice))} · {ver.prepMinutes} min {i === 0 && <Badge tone="brand">Current</Badge>}</div>
                  <div className="text-xs text-ink-2">From {fmtDate(ver.validFrom)} · {ver.recipe.length} ingredients{ver.note ? ` · ${ver.note}` : ''}</div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardTitle title="Portions sold per month" />
            <div className="space-y-1.5">
              {history.map((h) => {
                const max = Math.max(...history.map((x) => x.n), 1)
                return (
                  <div key={h.month} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-ink-2">{fmtMonth(h.month, true)}</span>
                    <div className="h-2.5 flex-1 rounded-sm bg-slate-100"><div className="h-full rounded-sm" style={{ width: `${(h.n / max) * 100}%`, background: h.month === basisMonth ? CHART.series[0] : '#9ec5f4' }} /></div>
                    <span className="tabular w-10 text-right text-ink">{h.n}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>

      {c.margin.isNegative() && (
        <div className="mt-6">
          <Callout tone="bad" title="Why this dish loses money">
            Food cost alone ({fmtPct(c.foodCostPct, 0)}) makes it look fine. Labour takes {fmtPct(c.labourPct, 0)} of the net price because of {c.labour.minutes} minutes of preparation.
            {s.settings.flags.aiSuggestions && <> See <Link to="/insights" className="font-semibold underline">Insights</Link> for suggested fixes.</>}
          </Callout>
        </div>
      )}

      {editing && <DishEditor item={item} onClose={() => setEditing(false)} />}
    </>
  )
}

function Section({ title, total, note, children }: { title: string; total: Dec; note: string; children: ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="text-[11px] text-ink-3">{note}</div>
        </div>
        <div className="tabular text-sm font-semibold text-ink">{fmtEUR(total)}</div>
      </div>
      {children}
    </div>
  )
}

function Row({ label, a, b }: { label: string; a: Dec; b: Dec }) {
  const changed = !a.eq(b)
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="tabular">{changed && <span className="mr-2 text-ink-3 line-through">{fmtEUR(a)}</span>}<span className={changed ? 'font-medium text-ink' : 'text-ink'}>{fmtEUR(b)}</span></span>
    </div>
  )
}

function PriceBar({ net, parts }: { net: Dec; parts: { label: string; v: Dec; color: string }[] }) {
  const cost = parts.reduce((a, p) => a + p.v.toNumber(), 0)
  const n = net.toNumber()
  const scale = Math.max(cost, n)
  const margin = n - cost
  return (
    <div>
      <div className="relative pt-6">
        <div className="absolute top-0 text-[11px] font-medium text-ink" style={{ left: `calc(${(n / scale) * 100}% - 1px)`, transform: n / scale > 0.85 ? 'translateX(-100%)' : undefined }}>
          <span className="whitespace-nowrap px-1">Net price {fmtEUR(net)}</span>
        </div>
        <div className="flex h-9 w-full gap-[2px]">
          {parts.map((p) => (
            <div key={p.label} className="flex h-full items-center justify-center overflow-hidden text-[11px] font-medium text-white first:rounded-l-md" style={{ width: `${(p.v.toNumber() / scale) * 100}%`, background: p.color }} title={`${p.label}: ${fmtEUR(p.v)}`}>
              {p.v.toNumber() / scale > 0.12 && fmtEUR(p.v)}
            </div>
          ))}
          {margin > 0 && (
            <div className="flex h-full items-center justify-center rounded-r-md border-2 border-dashed border-good/60 bg-emerald-50 text-[11px] font-medium text-good-text" style={{ width: `${(margin / scale) * 100}%` }}>
              {margin / scale > 0.08 && fmtEUR(margin)}
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute top-5 bottom-0 w-0.5 bg-ink" style={{ left: `${(n / scale) * 100}%` }} />
        {margin < 0 && (
          <div className="pointer-events-none absolute top-6 h-9 rounded-r-md bg-[repeating-linear-gradient(45deg,rgba(208,59,59,.0),rgba(208,59,59,.0)_4px,rgba(255,255,255,.55)_4px,rgba(255,255,255,.55)_7px)]" style={{ left: `${(n / scale) * 100}%`, right: 0 }} title={`Cost above price: ${fmtEUR(-margin)}`} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Legend items={[...parts.map((p) => ({ label: p.label, color: p.color })), margin >= 0 ? { label: 'Margin', color: '#0ca30c', dashed: true } : { label: `Loss ${fmtEUR(-margin)} (hatched: cost above price)`, color: '#d03b3b' }]} />
      </div>
    </div>
  )
}
