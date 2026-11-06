import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, Minus, PackagePlus, Plus, Search, ShieldAlert } from 'lucide-react'
import { actions } from '../state/store'
import { useInventoryState, useSharedState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { Badge, Button, Callout, Card, Drawer, EmptyState, Field, Freshness, Input, Modal, PageHeader, Progress, Segmented, Select, Tabs, Td, Th, Toggle, cx } from '../ui/kit'
import { CHART, TooltipBox, axisProps } from '../ui/charts'
import { D, fmtEUR, fmtPct } from '../domain/shared/money'
import { TODAY, daysBetween, fmtDate } from '../domain/shared/dates'
import { checkNewPrice, isLowStock, priceHistory, purchaseUnitsFor, toBaseUnitPrice } from '../domain/inventory/inventory'
import { getPublishedCosting, previewIngredientPrice, useIngredientUsage } from '../state/published'
import type { BaseUnit, Ingredient, PurchaseUnit } from '../domain/types'

type Tab = 'ingredients' | 'stock' | 'suppliers'

export default function InventoryPage() {
  const ingredientUsage = useIngredientUsage()
  const s = { ...useInventoryState(), ...useSharedState() }
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'ingredients'
  const openId = params.get('ingredient')
  const [q, setQ] = useState('')
  const [staleOnly, setStaleOnly] = useState(params.get('filter') === 'stale')
  const [adding, setAdding] = useState(false)

  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); p.delete('ingredient'); return p })
  const open = (id: string | null) => setParams((p) => { if (id) p.set('ingredient', id); else p.delete('ingredient'); return p })

  const rows = useMemo(() => s.ingredients.filter((i) => !i.archived).map((ing) => {
    const hist = priceHistory(s.prices, ing.id)
    const last = hist.at(-1)
    const prev = hist.at(-2)
    const days = last ? daysBetween(last.date, TODAY) : 999
    const usedIn = ingredientUsage(ing.id)
    return {
      ing, last, prev, days, usedIn, stale: days > s.settings.staleAfterDays,
      change: last && prev ? D(last.price).div(prev.price).minus(1).times(100).toNumber() : null,
      supplier: s.suppliers.find((x) => x.id === ing.supplierId)?.name ?? '—',
    }
  }).sort((a, b) => a.ing.name.localeCompare(b.ing.name)), [s])

  const visible = rows.filter((r) => (!staleOnly || r.stale) && (r.ing.name.toLowerCase().includes(q.toLowerCase()) || r.ing.category.toLowerCase().includes(q.toLowerCase())))
  const low = rows.filter((r) => isLowStock(r.ing))
  const staleCount = rows.filter((r) => r.stale).length

  return (
    <>
      <PageHeader eyebrow="Inventory & Procurement" title="Ingredients & stock"
        subtitle="Supplier prices with full history. Every price change recalculates the dishes that use it. Old prices are never overwritten."
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add ingredient</Button>} />

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'ingredients', label: 'Ingredients & prices', count: rows.length },
        { value: 'stock', label: 'Stock levels', count: low.length, hidden: !s.settings.flags.inventoryAlerts },
        { value: 'suppliers', label: 'Suppliers', count: s.suppliers.length },
      ]} />

      {tab === 'ingredients' && (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute top-2.5 left-3 text-ink-3" />
              <Input placeholder="Search ingredient or category" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-2"><Toggle checked={staleOnly} onChange={() => setStaleOnly(!staleOnly)} label="Stale only" /> Only prices older than {s.settings.staleAfterDays} days {staleCount > 0 && <Badge tone="warn">{staleCount}</Badge>}</label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr><Th>Ingredient</Th><Th>Supplier</Th><Th className="text-right">Current price</Th><Th className="text-right">Per base unit</Th><Th className="text-right">Change</Th><Th>Last updated</Th><Th>Used in</Th></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.ing.id} onClick={() => open(r.ing.id)} className={cx('cursor-pointer hover:bg-slate-50', r.stale && 'bg-amber-50/30')}>
                    <Td><div className="font-medium text-ink">{r.ing.name}</div><div className="text-xs text-ink-3">{r.ing.category}</div></Td>
                    <Td className="text-ink-2">{r.supplier}</Td>
                    <Td className="tabular text-right font-medium">{r.last ? `${fmtEUR(D(r.last.price))} / ${r.ing.purchaseUnit}` : '—'}</Td>
                    <Td className="tabular text-right text-xs text-ink-2">{r.last ? `€${toBaseUnitPrice(D(r.last.price), r.ing.purchaseUnit).toFixed(4)} / ${r.ing.baseUnit}` : ''}</Td>
                    <Td className="text-right">{r.change === null ? <span className="text-xs text-ink-3">—</span> : (
                      <span className={cx('tabular inline-flex items-center gap-0.5 text-xs font-medium', r.change > 0 ? 'text-critical' : r.change < 0 ? 'text-good-text' : 'text-ink-2')}>
                        {r.change > 0 ? <ArrowUpRight size={13} /> : r.change < 0 ? <ArrowDownRight size={13} /> : <Minus size={13} />}{fmtPct(Math.abs(r.change))}
                      </span>
                    )}</Td>
                    <Td><Freshness days={r.days} staleAfter={s.settings.staleAfterDays} /></Td>
                    <Td className="text-xs text-ink-2">{r.usedIn.length ? `${r.usedIn.length} dish${r.usedIn.length > 1 ? 'es' : ''}` : <span className="text-ink-3">Not used</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && <EmptyState title="No ingredients match">Try another search or turn off the stale filter.</EmptyState>}
          </div>
        </Card>
      )}

      {tab === 'stock' && <StockTab rows={rows.map((r) => r.ing)} />}
      {tab === 'suppliers' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {s.suppliers.map((sup) => {
            const ings = rows.filter((r) => r.ing.supplierId === sup.id)
            const lastDate = ings.map((r) => r.last?.date ?? '').sort().at(-1)
            return (
              <Card key={sup.id}>
                <div className="mb-3 flex items-center gap-2.5"><div className="rounded-lg bg-slate-100 p-2 text-ink-2"><Building2 size={16} /></div><div><div className="text-sm font-semibold">{sup.name}</div><div className="text-xs text-ink-3">{sup.contact}</div></div></div>
                <div className="text-xs text-ink-2">{ings.length} ingredients · last price {lastDate ? fmtDate(lastDate) : '—'}</div>
                <div className="mt-3 flex flex-wrap gap-1">{ings.map((r) => <Badge key={r.ing.id} tone={r.stale ? 'warn' : 'neutral'}>{r.ing.name}</Badge>)}</div>
              </Card>
            )
          })}
          <Card className="md:col-span-2 xl:col-span-4">
            <Callout tone="info" title="Supplier ordering is out of scope">Prices are entered from invoices or, in a later phase, read from e-invoices. Orders stay with your supplier’s own system.</Callout>
          </Card>
        </div>
      )}

      {openId && <IngredientDrawer id={openId} onClose={() => open(null)} />}
      {adding && <AddIngredient onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); open(id) }} />}
    </>
  )
}

function IngredientDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const s = { ...useInventoryState(), ...useSharedState() }
  const { basisMonth, toast } = useApp()
  const ing = s.ingredients.find((i) => i.id === id)
  const hist = priceHistory(s.prices, id)
  const last = hist.at(-1)
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(TODAY)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const valid = /^\d+(\.\d{1,2})?$/.test(price) && Number(price) > 0
  const check = valid ? checkNewPrice(last ? D(last.price) : undefined, D(price), ing?.purchaseUnit ?? 'kg') : null

  // Preview: cost the menu with the new price added, without saving it.
  const impact = useMemo(() => {
    if (!valid || !ing) return []
    const before = getPublishedCosting(basisMonth).costing
    const after = previewIngredientPrice({ id: 'preview', ingredientId: id, date, price, source: 'manual' }, basisMonth)
    return after.map((a) => ({ a, b: before.find((x) => x.itemId === a.itemId)! })).filter(({ a, b }) => !a.margin.eq(b.margin))
  }, [valid, s, basisMonth, id, date, price, ing])

  if (!ing) return null
  const chart = hist.map((h) => ({ date: h.date, label: fmtDate(h.date), price: Number(h.price) }))
  if (last) chart.push({ date: TODAY, label: 'Today', price: Number(last.price) })

  const save = () => {
    if (!valid || !check || check.level === 'error' || (check.level === 'warning' && !confirmed)) return
    actions.recordPrice(id, date, price, note || undefined)
    toast('Price recorded', `${impact.length} dish${impact.length === 1 ? '' : 'es'} recalculated. The previous price stays in the history.`)
    setPrice(''); setNote(''); setConfirmed(false)
  }

  return (
    <Drawer title={ing.name} subtitle={`${ing.category} · ${s.suppliers.find((x) => x.id === ing.supplierId)?.name} · bought per ${ing.purchaseUnit}, used in ${ing.baseUnit}`} onClose={onClose}
      footer={<Button variant="ghost" onClick={() => { actions.setArchivedIngredient(id, true); onClose() }}>Archive ingredient</Button>}>
      <div className="mb-5 h-44">
        <ResponsiveContainer>
          <LineChart data={chart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} axisLine={false} width={50} tickFormatter={(v) => `€${v}`} domain={['auto', 'auto']} />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ label: `Price / ${ing.purchaseUnit}`, value: fmtEUR(payload[0].payload.price), color: CHART.series[0] }]} /> : null} />
            <Line isAnimationActive={false} type="stepAfter" dataKey="price" stroke={CHART.series[0]} strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-6 rounded-xl border border-line p-4">
        <div className="mb-3 text-sm font-semibold">Record a new price</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Price per ${ing.purchaseUnit}`}>
            <div className="relative"><span className="absolute top-2 left-3 text-sm text-ink-3">€</span><Input className="pl-7" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value.replace(',', '.')); setConfirmed(false) }} placeholder={last?.price} /></div>
          </Field>
          <Field label="Invoice date"><Input type="date" max={TODAY} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note (optional)" className="col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. invoice number" /></Field>
        </div>
        {check && (
          <div className="mt-3">
            {check.level === 'warning' ? (
              <Callout tone="warn" icon={<ShieldAlert size={16} />} title="Check the unit before saving">
                {check.message}
                <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-amber-600" /> I checked: this is the price per {ing.purchaseUnit}</label>
              </Callout>
            ) : check.level === 'error' ? <Callout tone="bad">{check.message}</Callout> : <div className="text-xs text-ink-2">{check.message} = €{toBaseUnitPrice(D(price), ing.purchaseUnit).toFixed(4)} per {ing.baseUnit}.</div>}
          </div>
        )}
        {impact.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <div className="mb-1.5 text-xs font-medium text-ink-2">Effect on margin per portion</div>
            {impact.map(({ a, b }) => (
              <div key={a.itemId} className="flex justify-between py-0.5 text-sm">
                <span>{a.name}</span>
                <span className="tabular"><span className="text-ink-3">{fmtEUR(b.margin)}</span> → <span className={cx('font-medium', a.margin.isNegative() ? 'text-critical' : 'text-ink')}>{fmtEUR(a.margin)}</span></span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end"><Button variant="primary" disabled={!valid || check?.level === 'error' || (check?.level === 'warning' && !confirmed)} onClick={save}>Save price</Button></div>
      </div>

      <div className="text-sm font-semibold">Price history</div>
      <p className="mb-2 text-xs text-ink-3">Kept for trends, audits and future forecasting.</p>
      <table className="w-full text-sm">
        <thead><tr><Th>Date</Th><Th className="text-right">Price</Th><Th>Source</Th></tr></thead>
        <tbody>
          {[...hist].reverse().map((h, i) => (
            <tr key={h.id}>
              <Td>{fmtDate(h.date)} {i === 0 && <Badge tone="brand" className="ml-1">Current</Badge>}</Td>
              <Td className="tabular text-right">{fmtEUR(D(h.price))} / {ing.purchaseUnit}</Td>
              <Td className="text-xs text-ink-2 capitalize">{h.source}{h.note ? ` · ${h.note}` : ''}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Drawer>
  )
}

function StockTab({ rows }: { rows: Ingredient[] }) {
  const { toast } = useApp()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const sorted = [...rows].sort((a, b) => a.stock / Math.max(a.reorderLevel, 1) - b.stock / Math.max(b.reorderLevel, 1))
  const fmtQty = (n: number, unit: string) => (unit === 'pcs' ? `${n} pcs` : n >= 1000 ? `${(n / 1000).toLocaleString('en-IE', { maximumFractionDigits: 1 })} ${unit === 'g' ? 'kg' : 'L'}` : `${n} ${unit}`)
  return (
    <Card padded={false}>
      <div className="border-b border-line p-4"><Callout tone="info" title="Stock alerts (experiment E5)">Items at or below their reorder level raise a StockBelowThreshold event. Enter a count after your stocktake to update.</Callout></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr><Th>Ingredient</Th><Th className="w-64">Level</Th><Th className="text-right">In stock</Th><Th className="text-right">Reorder at</Th><Th className="w-48">Stocktake count</Th></tr></thead>
          <tbody>
            {sorted.map((i) => {
              const low = isLowStock(i)
              const pct = (i.stock / (i.reorderLevel * 2)) * 100
              return (
                <tr key={i.id} className={low ? 'bg-red-50/40' : ''}>
                  <Td><div className="flex items-center gap-2 font-medium">{i.name}{low && <Badge tone="bad" icon={<AlertTriangle size={10} />}>Reorder</Badge>}</div></Td>
                  <Td><Progress value={pct} tone={low ? 'bad' : pct < 65 ? 'warn' : 'brand'} /></Td>
                  <Td className="tabular text-right">{fmtQty(i.stock, i.baseUnit)}</Td>
                  <Td className="tabular text-right text-ink-2">{fmtQty(i.reorderLevel, i.baseUnit)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Input type="number" min={0} placeholder={i.baseUnit} value={counts[i.id] ?? ''} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} className="h-8" />
                      <Button size="sm" disabled={counts[i.id] === undefined || counts[i.id] === ''} onClick={() => { actions.setStock(i.id, Number(counts[i.id])); setCounts({ ...counts, [i.id]: '' }); toast('Stock updated', i.name) }}>Save</Button>
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function AddIngredient({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const s = { ...useInventoryState(), ...useSharedState() }
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Pantry')
  const [supplierId, setSupplier] = useState(s.suppliers[0].id)
  const [baseUnit, setBase] = useState<BaseUnit>('g')
  const [purchaseUnit, setPurchase] = useState<PurchaseUnit>('kg')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [reorder, setReorder] = useState('0')
  const valid = name.trim() && /^\d+(\.\d{1,2})?$/.test(price) && Number(price) > 0
  const cats = [...new Set(s.ingredients.map((i) => i.category))]
  return (
    <Modal title="Add ingredient" subtitle="Base units keep recipes exact: grams, millilitres or pieces." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} icon={<PackagePlus size={15} />}
        onClick={() => onAdded(actions.addIngredient({ name: name.trim(), category, supplierId, baseUnit, purchaseUnit, stock: Number(stock), reorderLevel: Number(reorder) }, price))}>Add ingredient</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Black truffle" /></Field>
        <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Supplier"><Select value={supplierId} onChange={(e) => setSupplier(e.target.value)}>{s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Recipe unit (base)">
          <Segmented value={baseUnit} onChange={(b) => { setBase(b); setPurchase(purchaseUnitsFor(b)[0]) }} options={[{ value: 'g', label: 'grams' }, { value: 'ml', label: 'ml' }, { value: 'pcs', label: 'pieces' }]} />
        </Field>
        <Field label="Bought per"><Select value={purchaseUnit} onChange={(e) => setPurchase(e.target.value as PurchaseUnit)}>{purchaseUnitsFor(baseUnit).map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label={`Price per ${purchaseUnit}`} className="col-span-2"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} placeholder="0.00" /></Field>
        <Field label={`In stock (${baseUnit})`}><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
        <Field label={`Reorder level (${baseUnit})`}><Input type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
