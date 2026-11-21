import { describe, expect, it } from 'vitest'
import scenarios from '../src/mocks/data/analyticsScenarios.json'
import { analyticsOptions, getOrderFacts, getOrderItems } from '../src/mocks/data/analyticsFacts'
import { getBreakdown, getDaily, getOverview, handleAnalytics } from '../src/mocks/analytics'

describe('交易口径与联调样例', () => {
  for (const sample of scenarios.overview) {
    it(sample.name, () => {
      expect(getOverview(sample.request).current).toEqual(sample.expected)
    })
  }

  it('金额和件数可跨品类加总，一单多品类按订单身份去重', () => {
    const view = getOverview(analyticsOptions.defaultRange)
    const categories = view.categories
    expect(categories.reduce((sum, row) => sum + Math.round(row.gmv * 100), 0)).toBe(
      Math.round(view.current.gmv * 100),
    )
    expect(categories.reduce((sum, row) => sum + row.pieces, 0)).toBe(view.current.pieces)
    expect(categories.reduce((sum, row) => sum + row.orders, 0)).toBeGreaterThan(
      view.current.orders,
    )
    expect(view.trend.reduce((sum, row) => sum + row.buyers, 0)).toBeGreaterThan(
      view.current.buyers,
    )
    expect(getBreakdown(analyticsOptions.defaultRange, 'category')).toEqual(categories)
  })

  it('订单原子事实与明细金额、件数相符', () => {
    const sample = scenarios.orderDetail
    expect(getOrderFacts().find((order) => order.id === sample.order.id)).toEqual(sample.order)
    expect(getOrderItems().filter((item) => item.orderId === sample.order.id)).toEqual(sample.items)
    const totals = new Map<string, [number, number]>()
    for (const item of getOrderItems()) {
      const entry = totals.get(item.orderId) ?? [0, 0]
      entry[0] += item.amountCents
      entry[1] += item.quantity
      totals.set(item.orderId, entry)
    }
    const mismatch = getOrderFacts().find((order) => {
      const entry = totals.get(order.id)
      return !entry || entry[0] !== order.amountCents || entry[1] !== order.pieces
    })
    expect(totals.size).toBe(getOrderFacts().length)
    expect(mismatch).toBeUndefined()
  })

  it('按等长前一区间比较，缺少基期时增长率为 null', () => {
    const view = getOverview(analyticsOptions.defaultRange)
    const previous = getOverview({ start: '2026-11-07', end: '2026-11-13' })
    expect(view.previous).toEqual(previous.current)
    expect(view.trend.map((row) => row.previousGmv)).toEqual(previous.trend.map((row) => row.gmv))
    const start = analyticsOptions.availableRange.start
    const firstPartition = getOverview({ start, end: start })
    expect(firstPartition.delta.gmv).toBeNull()
    expect(firstPartition.trend[0].previousAvailable).toBe(false)
  })

  it('明细查询支持稳定排序、分页和空态', () => {
    const { request, expected } = scenarios.daily
    expect(handleAnalytics('/analytics/daily', request)).toEqual(expected)
    const q = { ...request, sortBy: 'gmv' as const, sortOrder: 'desc' as const }
    const all = getDaily({ ...q, pageSize: 7 }).rows
    const second = getDaily({ ...q, page: 2, pageSize: 2 }).rows
    expect(all.map((row) => row.gmv)).toEqual(all.map((row) => row.gmv).sort((a, b) => b - a))
    expect(second).toEqual(all.slice(2, 4))
    expect(getDaily({ ...q, category: 'digital', product: 's504' }).rows).toEqual([])
  })

  it('拒绝无效日期和分页参数', () => {
    expect(() => getOverview({ start: '2026-02-30', end: '2026-03-01' })).toThrow()
    expect(() => getDaily({ ...scenarios.daily.request, page: 0 })).toThrow()
  })
})
