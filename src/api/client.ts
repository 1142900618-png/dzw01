export interface ApiEnvelope<T> {
  code: string
  message: string
  data: T
  requestId: string
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export const apiBase = (import.meta.env.VITE_API_BASE_URL || 'mock://warehouse').replace(/\/$/, '')
export const isMock = apiBase.startsWith('mock://')
export const sqlBase = (import.meta.env.VITE_TEXT2SQL_BASE_URL || apiBase).replace(/\/$/, '')
export async function request<T>(
  path: string,
  body: unknown = {},
  signal?: AbortSignal,
): Promise<T> {
  const base = path.startsWith('/textsql/') ? sqlBase : apiBase
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
  if (base.startsWith('mock://')) {
    const { dispatchMock } = await import('@/mocks')
    const result = await dispatchMock(path, body, signal)
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    return result as T
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timeout = false
  const timer = setTimeout(() => {
    timeout = true
    controller.abort()
  }, 30000)
  try {
    const response = await fetch(base + path, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(body),
    })
    let payload: Partial<ApiEnvelope<T>> | null = null
    try {
      payload = await response.json()
    } catch {
      /* Network gateways may return HTML. */
    }
    if (!response.ok || !payload || payload.code !== 'OK' || !('data' in payload)) {
      throw new ApiError(
        payload?.message || `请求失败（HTTP ${response.status}）`,
        payload?.code || 'INVALID_RESPONSE',
        payload?.requestId || requestId,
      )
    }
    return payload.data as T
  } catch (error) {
    if (timeout) throw new ApiError('请求超时，请重试', 'TIMEOUT', requestId)
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
