import { afterEach, describe, expect, it, vi } from 'vitest'
import { csvCell } from '@/lib/csv'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('production HTTP adapter', () => {
  it('preserves the POST payload and session when selecting an independent SQL origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api/v1/')
    vi.stubEnv('VITE_TEXT2SQL_BASE_URL', '/nlp/v1/')
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'OK',
          message: '',
          data: { valid: true },
          requestId: 'server-id',
        }),
      ),
    )
    vi.stubGlobal('fetch', mockFetch)
    const { request } = await import('@/api/client')
    await expect(request('/textsql/validate', { sql: 'select 1' })).resolves.toEqual({
      valid: true,
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/nlp/v1/textsql/validate',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ sql: 'select 1' }),
      }),
    )
  })
  it('preserves the backend error code and trace ID; HTML gateway failures also produce API errors', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api/v1')
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'FORBIDDEN', message: '无权访问', requestId: 'request-42' }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
    vi.stubGlobal('fetch', mockFetch)
    const { request } = await import('@/api/client')
    await expect(request('/warehouse/rows')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      requestId: 'request-42',
    })
    await expect(request('/warehouse/rows')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INVALID_RESPONSE',
      message: expect.stringContaining('502'),
    })
  })
  it('cancels a request before dispatch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { request } = await import('@/api/client')
    await expect(request('/analytics/options', {}, AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

it('checks direct access to Mock endpoints after changing roles', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  const { dispatchMock } = await import('@/mocks')
  await dispatchMock('/session/switch', { role: 'viewer' })
  await expect(dispatchMock('/warehouse/order', { orderId: 'unknown' })).rejects.toThrow('无权')
  await expect(dispatchMock('/textsql/execute', {})).rejects.toThrow('无权')
  await expect(dispatchMock('/analytics/options', {})).resolves.toHaveProperty('defaultRange')
})

it('quotes CSV text and preserves numeric negatives', () => {
  expect(csvCell('商品,"A"')).toBe('"商品,""A"""')
  expect(csvCell('=1+1')).toBe('"\'=1+1"')
  expect(csvCell(-12.5)).toBe('"-12.5"')
})
