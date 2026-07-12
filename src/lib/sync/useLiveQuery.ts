import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/** Subscribes to a Dexie liveQuery and re-renders whenever the underlying table changes — no extra dependency beyond Dexie itself. */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[], initial: T): T {
  const [result, setResult] = useState<T>(initial)

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: setResult,
      error: (err: unknown) => console.error('useLiveQuery error', err),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return result
}
