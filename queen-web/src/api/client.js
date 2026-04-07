const BASE_URL = import.meta.env.VITE_API_BASE || ''

export async function apiFetch (path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error?.message || `HTTP ${res.status}`)
  }

  if (res.status === 204) return null

  return res.json()
}
