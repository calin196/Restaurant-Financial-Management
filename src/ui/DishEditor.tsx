import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { actions } from '../state/store'
import { useRecipeOptions } from '../state/published'
import { useApp } from './AppContext'
import { Button, Callout, Field, Input, Modal, Select, cx } from './kit'
import { D, cents, fmtEUR, netFromGross } from '../domain/shared/money'
import { VAT_RATES, currentVersion } from '../domain/menuCosting/costing'
import type { MenuItem, RecipeLine, VatCategory } from '../domain/types'

export default function DishEditor({ item, onClose, onSaved }: { item?: MenuItem; onClose: () => void; onSaved?: (id: string) => void }) {
  const s = useRecipeOptions()
  const { toast } = useApp()
  const v = item ? currentVersion(item) : undefined
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<MenuItem['category']>(item?.category ?? 'Main')
  const [grossPrice, setGrossPrice] = useState(v?.grossPrice ?? '')
  const [vatCategory, setVat] = useState<VatCategory>(v?.vatCategory ?? 'food')
  const [prepMinutes, setPrep] = useState(String(v?.prepMinutes ?? 10))
  const [prepIsEstimate, setEstimate] = useState(v?.prepIsEstimate ?? true)
  const [labourRoleId, setRole] = useState(v?.labourRoleId ?? 'kitchen')
  const [recipe, setRecipe] = useState<RecipeLine[]>(v?.recipe ?? [])
  const [tried, setTried] = useState(false)

  const prices = s.prices
  const ingredients = [...s.ingredients].sort((a, b) => a.name.localeCompare(b.name))

  const lineCost = (l: RecipeLine) => {
    const p = prices.get(l.ingredientId)
    return p && l.yieldPct > 0 ? p.pricePerBaseUnit.times(l.quantity || 0).div(l.yieldPct / 100) : D(0)
  }
  const foodCost = cents(recipe.reduce((a, l) => a.plus(lineCost(l)), D(0)))
  const validPrice = /^\d+(\.\d{1,2})?$/.test(grossPrice) && Number(grossPrice) > 0
  const net = validPrice ? cents(netFromGross(grossPrice, VAT_RATES[vatCategory])) : null
  const errors = {
    name: !name.trim() ? 'Name is required' : undefined,
    price: !validPrice ? 'Enter a price like 14.50' : undefined,
    prep: !(Number(prepMinutes) >= 0) ? 'Minutes must be 0 or more' : undefined,
    recipe: recipe.length === 0 ? 'Add at least one ingredient' : recipe.some((l) => !(l.quantity > 0) || !(l.yieldPct > 0 && l.yieldPct <= 100)) ? 'Every line needs a quantity and a yield between 1 and 100%' : undefined,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const save = () => {
    setTried(true)
    if (hasErrors) return
    const id = actions.saveMenuItem(item?.id ?? null, { name: name.trim(), category }, {
      grossPrice: D(grossPrice).toFixed(2), vatCategory, prepMinutes: Number(prepMinutes), prepIsEstimate, labourRoleId, recipe,
    })
    toast(item ? 'Dish updated' : 'Dish added', item ? 'A new recipe version was saved; older versions are kept.' : 'Costs are calculated from current prices.')
    onSaved?.(id)
    onClose()
  }

  const setLine = (i: number, patch: Partial<RecipeLine>) => setRecipe(recipe.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  return (
    <Modal wide title={item ? `Edit ${item.name}` : 'New menu item'} subtitle="Changes create a new recipe version from today. History is never overwritten." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{item ? 'Save new version' : 'Add to menu'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Name" className="sm:col-span-3" error={tried ? errors.name : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Truffle Tagliatelle" autoFocus />
        </Field>
        <Field label="Category" className="sm:col-span-3">
          <Select value={category} onChange={(e) => setCategory(e.target.value as MenuItem['category'])}>
            {['Starter', 'Main', 'Dessert', 'Drink'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Menu price (incl. VAT)" className="sm:col-span-2" error={tried ? errors.price : undefined} hint={net ? `Net ${fmtEUR(net)}` : undefined}>
          <div className="relative"><span className="absolute top-2 left-3 text-sm text-ink-3">€</span><Input className="pl-7" inputMode="decimal" value={grossPrice} onChange={(e) => setGrossPrice(e.target.value.replace(',', '.'))} placeholder="0.00" /></div>
        </Field>
        <Field label="VAT category" className="sm:col-span-2" hint="Reduced rate for food and soft drinks">
          <Select value={vatCategory} onChange={(e) => setVat(e.target.value as VatCategory)}>
            <option value="food">Food & non-alcoholic (9%)</option>
            <option value="alcohol">Alcohol (21%)</option>
          </Select>
        </Field>
        <Field label="Prepared by" className="sm:col-span-2" hint="Labour uses this role’s hourly rate">
          <Select value={labourRoleId} onChange={(e) => setRole(e.target.value)}>
            {s.roles.map((r) => <option key={r.id} value={r.id}>{r.name} · {fmtEUR(D(r.ratePerHour))}/h</option>)}
          </Select>
        </Field>
        <Field label="Prep time per portion (minutes)" className="sm:col-span-3" error={tried ? errors.prep : undefined}>
          <Input type="number" min={0} value={prepMinutes} onChange={(e) => setPrep(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm text-ink-2 sm:col-span-3">
          <input type="checkbox" checked={prepIsEstimate} onChange={(e) => setEstimate(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Prep time is an estimate (not measured)
        </label>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">Recipe per portion</div>
          <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={() => setRecipe([...recipe, { ingredientId: ingredients[0]?.id ?? '', quantity: 0, yieldPct: 100 }])}>Add ingredient</Button>
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
              <tr><th className="px-3 py-2 text-left">Ingredient</th><th className="w-28 px-2 py-2 text-left">Qty served</th><th className="w-24 px-2 py-2 text-left">Yield %</th><th className="w-24 px-3 py-2 text-right">Cost</th><th className="w-10" /></tr>
            </thead>
            <tbody>
              {recipe.map((l, i) => {
                const ing = s.ingredients.find((x) => x.id === l.ingredientId)
                return (
                  <tr key={i} className="border-t border-line">
                    <td className="px-2 py-1.5"><Select value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })}>{ingredients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></td>
                    <td className="px-2 py-1.5"><div className="relative"><Input type="number" min={0} step="any" value={l.quantity || ''} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="pr-9" /><span className="absolute top-2 right-2.5 text-xs text-ink-3">{ing?.baseUnit}</span></div></td>
                    <td className="px-2 py-1.5"><Input type="number" min={1} max={100} value={l.yieldPct} onChange={(e) => setLine(i, { yieldPct: Number(e.target.value) })} title="Usable share after trimming or cooking loss" /></td>
                    <td className="tabular px-3 py-1.5 text-right text-ink-2">{fmtEUR(cents(lineCost(l)))}</td>
                    <td className="px-1"><button onClick={() => setRecipe(recipe.filter((_, j) => j !== i))} className="rounded p-1.5 text-ink-3 hover:bg-red-50 hover:text-critical" aria-label="Remove line"><Trash2 size={15} /></button></td>
                  </tr>
                )
              })}
              {recipe.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-ink-3">No ingredients yet</td></tr>}
            </tbody>
            <tfoot><tr className="border-t border-line bg-slate-50/70"><td colSpan={3} className="px-3 py-2 text-right text-xs font-medium text-ink-2">Ingredient cost per portion</td><td className="tabular px-3 py-2 text-right font-semibold">{fmtEUR(foodCost)}</td><td /></tr></tfoot>
          </table>
        </div>
        {tried && errors.recipe && <div className="mt-1.5 text-xs text-critical">{errors.recipe}</div>}
        {net && foodCost.gt(0) && (
          <div className={cx('mt-3')}>
            <Callout tone="info">Food cost is {foodCost.div(net).times(100).toFixed(0)}% of the net price. Labour and overhead are added on the dish page.</Callout>
          </div>
        )}
      </div>
    </Modal>
  )
}
