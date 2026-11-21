import { describe, expect, it } from 'vitest'
import type { PortraitCohort } from '../src/domain/portrait'
import type { GridResult } from '../src/domain/warehouse'
import { getDaily, getOverview } from '../src/mocks/analytics'
import { analyticsOptions } from '../src/mocks/data/analyticsFacts'
import { portraitMock } from '../src/mocks/portrait'
import { warehouseMock } from '../src/mocks/warehouse'

describe('同一订单事实的跨页面对账', () => {
  it('数仓 ADS 每日的金额、去重人数、订单数和件数与看板日报一致', async () => {
    const range = analyticsOptions.defaultRange
    const paging = { page: 1, pageSize: 30 }
    const daily = getDaily({ ...range, ...paging })
    const ads = (await warehouseMock('/warehouse/rows', {
      table: 'ads.ads_order_stats',
      ...range,
      ...paging,
    })) as GridResult
    expect(ads.total).toBeGreaterThan(0)
    expect(ads.total).toBe(daily.total)
    for (const row of ads.rows) {
      const day = daily.rows.find((record) => record.date === row.calc_dt)
      expect(day).toMatchObject({
        gmv: row.order_total_amount,
        orders: row.order_cnt,
        buyers: row.order_user_cnt,
        pieces: row.sku_cnt,
      })
    }
  })

  it('30 天画像用户数、下单金额与同窗经营指标一致，分页只裁剪明细', () => {
    const cohort = portraitMock('/portrait/cohort', {
      asOf: analyticsOptions.availableRange.end,
      days: 30,
      group: 'all',
      page: 1,
      pageSize: 5,
    }) as PortraitCohort
    const { current } = getOverview({ start: cohort.start, end: cohort.end })
    expect(cohort.people).toBeGreaterThan(cohort.rows.length)
    expect(cohort.rows).toHaveLength(5)
    expect(cohort.people).toBe(current.buyers)
    expect(cohort.amount).toBe(current.gmv)
    expect(cohort.average).toBe(current.basket)
  })

  it('品类与渠道交叉筛选后，所有订单分页的行金额和件数可回算看板', async () => {
    const end = analyticsOptions.defaultRange.end
    const channel = analyticsOptions.channels[0].id
    const category = analyticsOptions.categories[0].id
    const filter = { start: end, end, channel, category }
    const { current } = getOverview(filter)
    const orders = (await warehouseMock('/warehouse/orders', {
      ...filter,
      page: 1,
      pageSize: 5,
    })) as GridResult
    expect(orders.total).toBe(current.orders)
    expect(orders.total).toBeGreaterThan(orders.pageSize)
    const rows = [...orders.rows]
    for (let page = 2; page <= Math.ceil(orders.total / orders.pageSize); page++) {
      const next = (await warehouseMock('/warehouse/orders', {
        ...filter,
        page,
        pageSize: orders.pageSize,
      })) as GridResult
      rows.push(...next.rows)
    }
    expect(new Set(rows.map((row) => row.sn)).size).toBe(current.orders)
    expect(rows.reduce((sum, row) => sum + Math.round(Number(row.flow_price) * 100), 0)).toBe(
      Math.round(current.gmv * 100),
    )
    expect(rows.reduce((sum, row) => sum + Number(row.goods_num), 0)).toBe(current.pieces)
  })
})
