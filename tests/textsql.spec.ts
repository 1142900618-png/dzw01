import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SqlContext, SqlResult, SqlValidation, SqlWorkspace } from '@/domain/textsql'
import { textsqlMock } from '@/mocks/textsql'
import { getOrderFacts } from '@/mocks/data/analyticsFacts'
import { useSessionStore } from '@/stores/session'

// Vite serves this asset as a URL in browsers; Node's WASM loader needs a file path.
vi.mock('sql.js/dist/sql-wasm-browser.wasm?url', () => ({
  default: createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'),
}))

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
  setActivePinia(createPinia())
  useSessionStore().$patch({ user: { id: 'test' }, permissions: ['sql:view', 'sql:execute'] })
})

describe('Text2SQL query flow', () => {
  it('uses the generated SQL and returns fixture-derived values, including edited filters', async () => {
    const workspace = (await textsqlMock('/textsql/workspace', {})) as SqlWorkspace
    const query = (await textsqlMock('/textsql/generate', {
      question: workspace.examples[0],
      previous: null,
    })) as SqlContext
    const validation = (await textsqlMock('/textsql/validate', { sql: query.sql })) as SqlValidation
    expect(validation.valid).toBe(true)
    const result = (await textsqlMock('/textsql/execute', { query, confirmed: true })) as SqlResult
    expect(result.rows).toHaveLength(7)
    const [date, amount, count] = result.rows[0]
    const orders = getOrderFacts().filter((order) => order.date === date)
    expect(amount).toBe(orders.reduce((sum, row) => sum + row.amountCents, 0) / 100)
    expect(count).toBe(orders.length)
    const empty = (await textsqlMock('/textsql/execute', {
      query: {
        ...query,
        sql: "SELECT order_cnt FROM ads.ads_order_stats WHERE calc_dt < '2000-01-01'",
      },
      confirmed: true,
    })) as SqlResult
    expect(empty).toMatchObject({ columns: ['order_cnt'], rows: [], truncated: false })
  })

  it('rejects invalid or unsupported SQL and enforces execution permission and confirmation', async () => {
    for (const sql of [
      'SELECT nope FROM ads.ads_order_stats',
      'SELECT FROM ads.ads_order_stats',
      'SELECT * FROM ads.ads_order_stats; SELECT 1',
      'SELECT * FROM ads.ads_order_stats, ads.category_sales_daily',
      'SELECT * FROM ads.ads_order_stats WHERE calc_dt = :date',
    ]) {
      expect(await textsqlMock('/textsql/validate', { sql })).toMatchObject({ valid: false })
    }
    const query = (await textsqlMock('/textsql/generate', {
      question: '近 7 天每日订单量',
    })) as SqlContext
    await expect(textsqlMock('/textsql/execute', { query, confirmed: false })).rejects.toThrow(
      '执行开关',
    )
    useSessionStore().$patch({ permissions: ['sql:view'] })
    await expect(textsqlMock('/textsql/execute', { query, confirmed: true })).rejects.toThrow(
      '权限',
    )
  })

  it('executes each advertised template and rejects unsupported filters', async () => {
    const { examples } = (await textsqlMock('/textsql/workspace', {})) as SqlWorkspace
    for (const question of examples) {
      const query = (await textsqlMock('/textsql/generate', { question })) as SqlContext
      const result = (await textsqlMock('/textsql/execute', {
        query,
        confirmed: true,
      })) as SqlResult
      expect(result.rows.length).toBeGreaterThan(0)
    }
    for (const question of ['近 7 天广东的 GMV', '近 7 天每个渠道各品类的 GMV', '近 7 天利润']) {
      await expect(textsqlMock('/textsql/generate', { question })).rejects.toThrow()
    }
  })

  it('replaces the same favorite snapshot and removes it without changing history', async () => {
    const query = (await textsqlMock('/textsql/generate', {
      question: '近 7 天的 GMV',
    })) as SqlContext
    await textsqlMock('/textsql/favorite', { query, saved: true })
    const edited = { ...query, sql: 'SELECT calc_dt FROM ads.ads_order_stats LIMIT 2' }
    expect(await textsqlMock('/textsql/favorite', { query: edited, saved: true })).toEqual([edited])
    expect(await textsqlMock('/textsql/favorite', { query: edited, saved: false })).toEqual([])
    expect(((await textsqlMock('/textsql/workspace', {})) as SqlWorkspace).history).toEqual([query])
  })

  it('isolates query snapshots by user, supports follow-up periods and respects row limits', async () => {
    const query = (await textsqlMock('/textsql/generate', {
      question: '最近 7 天每日 GMV',
    })) as SqlContext
    await textsqlMock('/textsql/favorite', { query, saved: true })
    const follow = (await textsqlMock('/textsql/generate', {
      question: '改为最近 30 天',
      previous: query,
    })) as SqlContext
    const result = (await textsqlMock('/textsql/execute', {
      query: follow,
      confirmed: true,
    })) as SqlResult
    expect(result.rows).toHaveLength(30)
    const all = (await textsqlMock('/textsql/execute', {
      query: { ...query, sql: 'SELECT * FROM ads.ads_order_stats' },
      confirmed: true,
    })) as SqlResult
    expect(all.truncated).toBe(true)
    expect(all.rows).toHaveLength(100)
    expect(((await textsqlMock('/textsql/workspace', {})) as SqlWorkspace).favorites).toEqual([
      query,
    ])
    useSessionStore().$patch({ user: { id: 'another-user' } })
    expect(await textsqlMock('/textsql/workspace', {})).toMatchObject({
      favorites: [],
      history: [],
    })
  })
})
