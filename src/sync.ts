import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { silence } from './feedback'
import { mergeState, stable } from './merge'
import { persistState, type State } from './store'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const syncConfigured = Boolean(URL && ANON)

const BASE_KEY = 'tl-sync-base'
const TABLE = 'ledger_state'
const EMPTY: State = { habits: [], txs: [], budget: 0, goals: [], events: [] }

export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error'

let client: Promise<SupabaseClient> | null = null
function getClient() {
  client ??= import('@supabase/supabase-js').then((m) => m.createClient(URL!, ANON!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tl-auth' } }))
  return client
}

function loadBase(): State | null {
  try {
    return JSON.parse(localStorage.getItem(BASE_KEY) ?? 'null')
  } catch {
    return null
  }
}
function saveBase(s: State | null) {
  try {
    if (s) localStorage.setItem(BASE_KEY, JSON.stringify(s))
    else localStorage.removeItem(BASE_KEY)
  } catch {
    /* ignore */
  }
}
const message = (e: unknown) => {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /fetch|network/i.test(m) ? 'Offline. Will retry when you are back online.' : m
}

/** Cloud sync: one JSON document per user, merged three-way so two devices never overwrite each other. */
export function useSync(state: State, setState: (s: State) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>(syncConfigured ? 'signed-out' : 'off')
  const [error, setError] = useState('')
  const [last, setLast] = useState<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const running = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const run = useCallback(async () => {
    if (!syncConfigured) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setStatus('syncing')
    setError('')
    try {
      const sb = await getClient()
      const { data: auth } = await sb.auth.getSession()
      if (!auth.session) {
        setStatus('signed-out')
        return
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: row, error: e1 } = await sb.from(TABLE).select('data,version').maybeSingle()
        if (e1) throw e1
        const local = stateRef.current
        const remote = (row?.data ?? EMPTY) as State
        const merged = mergeState(loadBase(), local, remote)

        if (!row) {
          const { error: e2 } = await sb.from(TABLE).insert({ data: merged, version: 1 })
          if (e2) {
            if (e2.code === '23505') continue // another device created it first: merge again
            throw e2
          }
        } else if (stable(merged) !== stable(remote)) {
          const { data: upd, error: e3 } = await sb
            .from(TABLE)
            .update({ data: merged, version: row.version + 1, updated_at: new Date().toISOString() })
            .eq('version', row.version)
            .select('version')
          if (e3) throw e3
          if (!upd?.length) continue // someone else wrote in between: merge again
        }

        if (stateRef.current !== local) {
          // edited while syncing: keep the old baseline and go round again, so nothing is mistaken for a delete
          again.current = true
        } else {
          if (stable(merged) !== stable(local)) {
            if (!persistState(merged)) throw new Error('Could not save to this device.')
            silence.on = true
            setState(merged)
          }
          saveBase(merged)
        }
        setLast(Date.now())
        setStatus('idle')
        return
      }
      throw new Error('Sync kept conflicting. Will retry.')
    } catch (e) {
      setStatus('error')
      setError(message(e))
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        schedule(1500)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState])

  function schedule(ms: number) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(), ms)
  }

  // auth session
  useEffect(() => {
    if (!syncConfigured) return
    let unsub: (() => void) | undefined
    void getClient().then(async (sb) => {
      const { data } = await sb.auth.getSession()
      setSession(data.session)
      unsub = sb.auth.onAuthStateChange((_e, s) => setSession(s)).data.subscription.unsubscribe
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!syncConfigured) return
    if (session) void run()
    else setStatus('signed-out')
  }, [session, run])

  // local edits -> sync shortly after
  useEffect(() => {
    if (!session) return
    const base = loadBase()
    if (!base || stable(base) !== stable(state)) schedule(3000)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, session])

  // pick up changes from other devices
  useEffect(() => {
    if (!session) return
    const go = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', go)
    window.addEventListener('online', go)
    const id = setInterval(go, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', go)
      window.removeEventListener('online', go)
      clearInterval(id)
    }
  }, [session, run])

  return {
    configured: syncConfigured,
    email: session?.user.email ?? null,
    status,
    error,
    last,
    syncNow: () => void run(),
    async signIn(email: string, password: string) {
      const sb = await getClient()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    /** Returns 'confirm' when the project requires confirming the email before first sign-in. */
    async signUp(email: string, password: string): Promise<'in' | 'confirm'> {
      const sb = await getClient()
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
      if (error) throw error
      return data.session ? 'in' : 'confirm'
    },
    async signOut() {
      const sb = await getClient()
      await sb.auth.signOut()
      saveBase(null) // a different account must never inherit this baseline
      setStatus('signed-out')
    },
  }
}

export type Sync = ReturnType<typeof useSync>
