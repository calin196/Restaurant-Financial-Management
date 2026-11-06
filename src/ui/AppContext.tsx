import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { DomainError } from '../state/store'
import { useSalesState } from '../state/sliceHooks'
import { basisMonths, defaultBasisMonth } from '../state/selectors'
import { cx } from './kit'

type ToastTone = 'good' | 'warn' | 'bad'
interface Toast { id: number; tone: ToastTone; title: string; body?: string }

interface Ctx {
  basisMonth: string
  setBasisMonth: (m: string) => void
  months: string[]
  toast: (title: string, body?: string, tone?: ToastTone) => void
  /** Runs a store action and turns domain errors (e.g. closed period) into a toast. */
  attempt: (fn: () => void, success?: string, body?: string) => boolean
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const state = useSalesState()
  const months = useMemo(() => basisMonths(state), [state])
  const [basisMonth, setBasisMonth] = useState(() => defaultBasisMonth(state))
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((title: string, body?: string, tone: ToastTone = 'good') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, title, body }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const attempt = useCallback((fn: () => void, success?: string, body?: string) => {
    try {
      fn()
      if (success) toast(success, body)
      return true
    } catch (e) {
      if (e instanceof DomainError) toast('Not allowed', e.message, 'bad')
      else throw e
      return false
    }
  }, [toast])

  return (
    <AppCtx.Provider value={{ basisMonth: months.includes(basisMonth) ? basisMonth : months.at(-1) ?? basisMonth, setBasisMonth, months, toast, attempt }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.tone === 'good' ? CheckCircle2 : t.tone === 'warn' ? AlertTriangle : XCircle
          return (
            <div key={t.id} className="anim-pop pointer-events-auto flex gap-3 rounded-xl border border-line bg-white p-3.5 shadow-lg">
              <Icon size={18} className={cx('mt-0.5 shrink-0', t.tone === 'good' ? 'text-good' : t.tone === 'warn' ? 'text-amber-500' : 'text-critical')} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs text-ink-2">{t.body}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </AppCtx.Provider>
  )
}

export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppProvider missing')
  return c
}
