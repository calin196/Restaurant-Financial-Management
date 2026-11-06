import type { ReactNode } from 'react'
import { cx } from './kit'

// Chart chrome shared by every chart: recessive axes, hairline grid,
// text in ink colours (never the series colour), one tooltip style.
export const CHART = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'],
  positive: '#2a78d6',
  negative: '#e34948',
  grid: '#e8e8e3',
  axis: '#898781',
  muted: '#c3c2b7',
}

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: '#d4d4cf' },
}

export function TooltipBox({ title, rows }: { title?: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string; strong?: boolean }[] }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg">
      {title && <div className="mb-1.5 font-semibold text-ink">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color && <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className={cx('tabular text-ink', r.strong && 'font-semibold')}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Part-to-whole as one stacked bar with a 2px gap between segments, plus a value table. */
export function StackedShare({ parts, total, format }: { parts: { label: string; value: number; color: string }[]; total: number; format: (v: number) => string }) {
  const visible = parts.filter((p) => p.value > 0)
  return (
    <div>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-md">
        {visible.map((p) => (
          <div key={p.label} title={`${p.label}: ${format(p.value)} (${((p.value / total) * 100).toFixed(1)}%)`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="h-full first:rounded-l-md last:rounded-r-md" />
        ))}
      </div>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {parts.map((p) => (
            <tr key={p.label} className="border-b border-line/60 last:border-0">
              <td className="py-1.5">
                <span className="inline-flex items-center gap-2 text-ink-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                  {p.label}
                </span>
              </td>
              <td className="tabular py-1.5 text-right text-ink">{format(p.value)}</td>
              <td className="tabular w-16 py-1.5 text-right text-xs text-ink-2">{total ? ((p.value / total) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
