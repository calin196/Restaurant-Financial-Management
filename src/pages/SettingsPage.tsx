import { useState } from 'react'
import { Download, FlaskConical, RefreshCcw, Store } from 'lucide-react'
import { actions, exportDemoJson } from '../state/store'
import { useSharedState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { Badge, Button, Callout, Card, CardTitle, Field, Input, Modal, PageHeader, Segmented, Toggle } from '../ui/kit'
import { POLICY_LABELS } from '../domain/menuCosting/costing'
import type { AllocationPolicy, Settings } from '../domain/types'

const FLAGS: { key: keyof Settings['flags']; exp: string; title: string; text: string; phase: string }[] = [
  { key: 'trueCostView', exp: 'E2', title: 'Open the menu in true-cost view', text: 'Do managers understand allocated cost? When off, the menu opens in the food-cost view first.', phase: 'Phase 1' },
  { key: 'inventoryAlerts', exp: 'E5', title: 'Stock alerts', text: 'Show stock levels and below-threshold alerts. Dropped if managers ignore them.', phase: 'Phase 2' },
  { key: 'aiSuggestions', exp: 'E4', title: 'AI suggestions and demand forecast', text: 'Advice with reason and confidence. Dropped if acceptance stays below 20%.', phase: 'Phase 3' },
  { key: 'posIntegration', exp: '—', title: 'POS integration (preview)', text: 'Sales arrive from the till automatically instead of by hand or CSV.', phase: 'Phase 2' },
]

export default function SettingsPage() {
  const s = useSharedState()
  const { toast } = useApp()
  const [name, setName] = useState(s.settings.restaurantName)
  const [resetting, setResetting] = useState(false)

  const exportAll = () => {
    const url = URL.createObjectURL(new Blob([exportDemoJson()], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'truecost-data-export.json'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader eyebrow="System" title="Settings" subtitle="Restaurant details, costing defaults and the feature flags behind each experiment." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle icon={<Store size={16} />} title="Restaurant" />
          <div className="flex gap-2">
            <Field label="Name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Button className="mt-5" disabled={!name.trim() || name === s.settings.restaurantName} onClick={() => { actions.updateSettings({ restaurantName: name.trim() }); toast('Saved') }}>Save</Button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Field label="Flag prices as stale after (days)" hint="Shown next to every cost that uses the price">
              <Input type="number" min={1} value={s.settings.staleAfterDays} onChange={(e) => Number(e.target.value) > 0 && actions.updateSettings({ staleAfterDays: Number(e.target.value) })} />
            </Field>
            <Field label="Subscription"><div className="flex h-9 items-center gap-2"><Badge tone="brand">Standard · €59/month</Badge><span className="text-xs text-ink-3">trial</span></div></Field>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 text-xs font-medium text-ink-2">Overhead allocation policy</div>
            <Segmented<AllocationPolicy> value={s.settings.allocationPolicy} onChange={actions.setPolicy} options={(Object.keys(POLICY_LABELS) as AllocationPolicy[]).map((p) => ({ value: p, label: POLICY_LABELS[p].name }))} />
            <p className="mt-2 text-xs text-ink-2">{POLICY_LABELS[s.settings.allocationPolicy].explain}</p>
          </div>
        </Card>

        <Card>
          <CardTitle icon={<FlaskConical size={16} />} title="Experiments & feature flags" subtitle="Each experiment has one metric, a time box and a keep / change / drop decision." />
          <ul className="divide-y divide-line">
            {FLAGS.map((f) => (
              <li key={f.key} className="flex items-start gap-4 py-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{f.title}<Badge>{f.exp}</Badge><Badge tone="info">{f.phase}</Badge></div>
                  <p className="mt-0.5 text-xs text-ink-2">{f.text}</p>
                </div>
                <Toggle checked={s.settings.flags[f.key]} onChange={() => actions.toggleFlag(f.key)} label={f.title} />
              </li>
            ))}
            <li className="flex items-start gap-4 py-3">
              <div className="flex-1">
                <div className="text-sm font-medium">Simulate POS outage <Badge tone="warn">S7</Badge></div>
                <p className="mt-0.5 text-xs text-ink-2">Menu costing keeps working from stored copies and shows the data age.</p>
              </div>
              <Toggle checked={s.settings.posOutage} onChange={() => actions.updateSettings({ posOutage: !s.settings.posOutage })} label="Simulate POS outage" />
            </li>
          </ul>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle title="Your data" subtitle="Standard export so you are never locked in. Demo data lives only in this browser." />
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download size={15} />} onClick={exportAll}>Export all data (JSON)</Button>
            <Button variant="ghost" icon={<RefreshCcw size={15} />} onClick={() => setResetting(true)}>Reset demo data</Button>
          </div>
        </Card>
      </div>
      {resetting && (
        <Modal title="Reset demo data?" onClose={() => setResetting(false)}
          footer={<><Button variant="ghost" onClick={() => setResetting(false)}>Cancel</Button><Button variant="danger" onClick={() => { actions.resetDemo(); setResetting(false); toast('Demo data restored') }}>Reset</Button></>}>
          <Callout tone="warn">All changes made in this browser (prices, sales, rosters, closed periods, decisions) are replaced by the original demo restaurant.</Callout>
        </Modal>
      )}
    </>
  )
}
