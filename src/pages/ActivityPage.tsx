import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useIdentityState, useSharedState } from '../state/sliceHooks'
import { Badge, Card, CardTitle, EmptyState, PageHeader, Segmented, Td, Th } from '../ui/kit'
import { fmtDate } from '../domain/shared/dates'
import { ROLE_LABELS } from '../domain/identity/access'
import type { ContextName } from '../domain/types'

const CONTEXT_TONE: Record<ContextName, 'brand' | 'info' | 'neutral' | 'warn' | 'good' | 'bad'> = {
  'Menu Costing': 'brand', Sales: 'info', Inventory: 'good', Workforce: 'warn', Finance: 'neutral', Insights: 'brand', Identity: 'bad',
}

export default function ActivityPage() {
  const { events } = useSharedState()
  const { accessLog } = useIdentityState()
  const [ctx, setCtx] = useState<'All' | ContextName>('All')
  const evts = events.filter((e) => ctx === 'All' || e.context === ctx)
  const contexts = ['All', ...new Set(events.map((e) => e.context))] as ('All' | ContextName)[]
  return (
    <>
      <PageHeader eyebrow="Event-based domain model" title="Activity & audit"
        subtitle="Every change is a recorded fact passed between bounded contexts: prices, sales, rosters, closed periods and AI decisions. Nothing is deleted." />
      <div className="mb-4 overflow-x-auto"><Segmented size="sm" value={ctx} onChange={setCtx} options={contexts.map((c) => ({ value: c, label: c }))} /></div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <table className="w-full">
            <thead><tr><Th>When</Th><Th>Event</Th><Th>Context</Th><Th>Details</Th></tr></thead>
            <tbody>
              {evts.map((e) => (
                <tr key={e.id}>
                  <Td className="text-xs whitespace-nowrap text-ink-2">{fmtDate(e.at.slice(0, 10), false)} {e.at.slice(11, 16)}</Td>
                  <Td className="font-mono text-xs font-medium">{e.type}</Td>
                  <Td><Badge tone={CONTEXT_TONE[e.context]}>{e.context}</Badge></Td>
                  <Td className="text-sm text-ink-2">{e.summary}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && <EmptyState title="No events yet" />}
        </Card>
        <Card>
          <CardTitle icon={<ShieldAlert size={16} />} title="Access log" subtitle="Denied attempts to restricted data, such as wages (GDPR)" />
          {accessLog.length === 0 ? <p className="text-sm text-ink-3">No denied attempts. Try switching to the accountant role and opening Staff &amp; roster.</p> : (
            <ul className="space-y-2.5">
              {accessLog.slice(0, 30).map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center gap-2"><Badge tone={a.allowed ? 'good' : 'bad'}>{a.allowed ? 'Allowed' : 'Denied'}</Badge><span className="font-medium">{a.resource}</span></div>
                  <div className="mt-0.5 text-xs text-ink-2">{ROLE_LABELS[a.role]} · {fmtDate(a.at.slice(0, 10), false)} {a.at.slice(11, 16)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
