import { useSyncExternalStore } from 'react'

let updating = false
let pending: (() => void)[] = []

/** Events raised inside a mutation are delivered only after its slice commits. */
export function afterCommit(deliver: () => void) {
  if (updating) pending.push(deliver)
  else deliver()
}

export function makeSliceStore<T>(key: string, init: () => T) {
  const load = (): T => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.schemaVersion === 1 && parsed.data && typeof parsed.data === 'object') {
          const defaults = init()
          if (Object.keys(defaults as object).every((field) => field in parsed.data)) return parsed.data
        }
      }
    } catch { /* Missing/unavailable storage or invalid JSON: use seed. */ }
    return structuredClone(init())
  }
  let slice = load()
  const listeners = new Set<() => void>()
  const get = () => slice
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const commit = (value: T) => {
    slice = value
    try { localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, data: slice })) }
    catch { /* The PoC also works without browser storage. */ }
  }
  const update = (mutate: (draft: T) => void) => {
    const draft = structuredClone(slice)
    updating = true
    try { mutate(draft) }
    catch (error) { pending = []; throw error }
    finally { updating = false }
    commit(draft)
    const deliveries = pending
    pending = []
    deliveries.forEach((deliver) => deliver())
    listeners.forEach((listener) => listener())
  }
  return {
    key, get, update, subscribe,
    useSlice: () => useSyncExternalStore(subscribe, get, get),
    reset: (value: T) => { commit(structuredClone(value)); listeners.forEach((listener) => listener()) },
  }
}
