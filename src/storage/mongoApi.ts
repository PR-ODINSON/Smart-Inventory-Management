const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')

export function isCloudApiConfigured(): boolean {
  return Boolean(apiBase)
}

export async function fetchApiHealth(): Promise<
  { ok: true; database: string; storage: string } | { ok: false; error: string }
> {
  if (!apiBase) {
    return { ok: false, error: 'API not configured (set VITE_API_BASE_URL).' }
  }
  try {
    const res = await fetch(`${apiBase}/health`)
    const data = (await res.json()) as { ok?: boolean; database?: string; storage?: string; error?: string }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    }
    return { ok: true, database: data.database ?? '', storage: data.storage ?? 'mongodb' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

export async function pullCloudState(): Promise<unknown> {
  if (!apiBase) throw new Error('API not configured')
  const res = await fetch(`${apiBase}/state`)
  const data = await res.json()
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return data
}

export async function pushCloudState(payload: unknown): Promise<void> {
  if (!apiBase) throw new Error('API not configured')
  const res = await fetch(`${apiBase}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }
}
