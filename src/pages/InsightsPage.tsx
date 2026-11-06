import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, Clock, Euro, Scale, ShieldCheck, Sparkles, Timer, Users, X } from 'lucide-react'
import { actions } from '../state/store'
import { useInsightsState, useSharedState } from '../state/sliceHooks'
import { useApp } from '../ui/AppContext'
import { usePublishedInsights } from '../state/published'
import { Badge, Button, Callout, Card, CardTitle, EmptyState, PageHeader, Progress, Td, Th, cx } from '../ui/kit'
import { CHART, Legend, TooltipBox, axisProps } from '../ui/charts'
import { type Suggestion } from '../domain/insights/insights'
import { WEEKDAYS, fmtDate, fmtMonth } from '../domain/shared/dates'

const KIND = {
  price: { icon: <Euro size={16} />, label: 'Pricing' },
  prep: { icon: <Timer size={16} />, label: 'Preparation' },
  policy: { icon: <Scale size={16} />, label: 'Allocation' },
  data: { icon: <Clock size={16} />, label: 'Data quality' },
}

export default function InsightsPage() {
  const s = { ...useInsightsState(), ...useSharedState() }
  const { basisMonth, toast } = useApp()
  const { suggestions, forecast } = usePublishedInsights(basisMonth)
  const enabled = s.settings.flags.aiSuggestions

  const decided = new Set(s.decisions.map((d) => d.suggestionKey))
  const open = suggestions.filter((x) => !decided.has(x.key))
  const accepted = s.decisions.filter((d) => d.decision === 'accepted').length
  const rate = s.decisions.length ? (accepted / s.decisions.length) * 100 : 0

  const decide = (x: Suggestion, d: 'accepted' | 'rejected') => {
    actions.decide(x, d)
    toast(d === 'accepted' ? 'Suggestion accepted' : 'Suggestion rejected', d === 'accepted' && x.apply ? 'A new menu version was saved from today. Past months are unchanged.' : 'Your decision was recorded.', d === 'accepted' ? 'good' : 'warn')
  }

  if (!enabled)
    return (
      <>
        <PageHeader eyebrow="Insights & Advisory" title="Insights" />
        <Card><EmptyState icon={<Sparkles size={20} />} title="AI suggestions are switched off">They are an experiment (E4) behind a feature flag. Turn them on in <Link to="/settings" className="font-medium text-brand-700 underline">Settings</Link>.</EmptyState></Card>
      </>
    )

  return (
    <>
      <PageHeader eyebrow="Insights & Advisory" title="Insights"
        subtitle={<>Advice with a reason and a confidence score. You decide, and every decision is recorded. Based on {fmtMonth(basisMonth)} volumes and current prices.</>}
        actions={<Badge tone="brand" icon={<Sparkles size={11} />}>Experiment E4 · beta</Badge>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {open.length === 0 && <Card><EmptyState icon={<Check size={20} />} title="No open suggestions">Every dish meets the target margin, or you have already decided on each suggestion.</EmptyState></Card>}
          {open.map((x) => (
            <Card key={x.key}>
              <div className="flex items-start gap-3">
                <div className={cx('rounded-lg p-2', x.kind === 'policy' ? 'bg-slate-100 text-ink-2' : 'bg-brand-50 text-brand-700')}>{KIND[x.kind].icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{x.title}</h3>
                    <Badge>{KIND[x.kind].label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{x.reason}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">Expected effect</div>
                      <div className="mt-0.5 text-sm font-medium">{x.impact}</div>
                      {x.impactValue > 0 && <div className="text-xs text-ink-2">≈ +€{Math.round(x.impactValue).toLocaleString('en-IE')} per month at current volume</div>}
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="flex justify-between text-[11px] font-medium tracking-wide text-ink-3 uppercase"><span>Confidence</span><span className="tabular text-ink">{Math.round(x.confidence * 100)}%</span></div>
                      <div className="mt-2"><Progress value={x.confidence * 100} tone={x.confidence < 0.5 ? 'warn' : 'brand'} /></div>
                      <div className="mt-2 flex flex-wrap gap-1">{x.basedOn.map((b) => <span key={b} className="rounded bg-white px-1.5 py-0.5 text-[10.5px] text-ink-2 ring-1 ring-line">{b}</span>)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {x.itemId && <Link to={`/menu/${x.itemId}`} className="mr-auto text-xs font-medium text-brand-700 hover:underline">Open cost breakdown</Link>}
                    <Button variant="ghost" icon={<X size={14} />} onClick={() => decide(x, 'rejected')}>Reject</Button>
                    <Button variant="primary" icon={<Check size={14} />} onClick={() => decide(x, 'accepted')}>{x.apply ? 'Accept & apply' : 'Acknowledge'}</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle title="Is the advice trusted?" subtitle="E4 drops the AI feature if acceptance stays below 20%" />
            <div className="flex items-baseline gap-2"><span className="text-3xl font-semibold">{s.decisions.length ? `${rate.toFixed(0)}%` : '—'}</span><span className="text-sm text-ink-2">accepted ({accepted} of {s.decisions.length})</span></div>
            <div className="mt-3"><Progress value={rate} tone={s.decisions.length && rate < 20 ? 'bad' : 'brand'} /></div>
            {s.decisions.length > 0 && (
              <ul className="mt-4 space-y-2">
                {s.decisions.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-start gap-2 text-xs">
                    {d.decision === 'accepted' ? <Check size={13} className="mt-0.5 text-good" /> : <X size={13} className="mt-0.5 text-critical" />}
                    <span className="flex-1 text-ink-2"><span className="text-ink">{d.title}</span> · {fmtDate(d.at.slice(0, 10), false)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Callout tone="info" icon={<ShieldCheck size={16} />} title="How suggestions are made">
            In this prototype a transparent rule engine produces them. In phase 3 an LLM can be added behind our own interface, receiving only anonymised totals, never names or wages.
          </Callout>
        </div>
      </div>

      <Card className="mt-6">
        <CardTitle icon={<Users size={16} />} title="Demand forecast · next 7 days" subtitle="Average of the same weekday over the last 8 weeks. Staff need is a total per role; you assign the people." />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="h-60 lg:col-span-3">
            <ResponsiveContainer>
              <BarChart data={forecast.map((f) => ({ ...f, label: `${WEEKDAYS[f.weekday]} ${Number(f.date.slice(-2))}` }))} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} axisLine={false} width={36} />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={({ active, payload, label }) => active && payload?.length ? (
                  <TooltipBox title={label} rows={[
                    { label: 'Kitchen portions', value: payload[0].payload.kitchenPortions, color: CHART.series[0] },
                    { label: 'Bar portions', value: payload[0].payload.barPortions, color: CHART.series[1] },
                  ]} />
                ) : null} />
                <Bar isAnimationActive={false} dataKey="kitchenPortions" fill={CHART.series[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar isAnimationActive={false} dataKey="barPortions" fill={CHART.series[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1"><Legend items={[{ label: 'Kitchen portions', color: CHART.series[0] }, { label: 'Bar portions', color: CHART.series[1] }]} /></div>
          </div>
          <div className="lg:col-span-2">
            <table className="w-full">
              <thead><tr><Th>Day</Th><Th className="text-right">Cooks</Th><Th className="text-right">Bar staff</Th></tr></thead>
              <tbody>
                {forecast.map((f) => (
                  <tr key={f.date}>
                    <Td>{WEEKDAYS[f.weekday]} {fmtDate(f.date, false)}</Td>
                    <Td className="tabular text-right font-medium">{f.cooks}</Td>
                    <Td className="tabular text-right font-medium">{f.barStaff}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-3">Assumes 6 productive hours per 8-hour shift. The forecast never names, assigns or ranks employees (EU AI Act: kept out of the high-risk category).</p>
          </div>
        </div>
      </Card>
    </>
  )
}
