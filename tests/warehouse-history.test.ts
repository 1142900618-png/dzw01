import { describe, expect, it } from 'vitest'
import { warehouseMock } from '../src/mocks/warehouse'
import { getOrderFacts } from '../src/mocks/data/analyticsFacts'
import {
  dayShift,
  eventsFor,
  OPEN_END,
  removedOrder,
  versionsFor,
} from '../src/mocks/data/warehouseHistory'
import type { GridResult } from '../src/domain/warehouse'
const lookup = (path: string, body: Record<string, unknown>) =>
  warehouseMock('/warehouse/' + path, { page: 1, pageSize: 100, ...body }) as GridResult

describe('CDC 与日粒度订单拉链', () => {
  it('一天内多次变更产生一条日末版本，切换日只保留新版', () => {
    const order = getOrderFacts().find(
      (o) => o.status === 'COMPLETED' && o.createdAt.slice(11, 13) < '20',
    )!
    const expected = eventsFor(order)
    const versions = lookup('versions', {
      orderId: order.id,
      sortBy: 'zip_start_dt',
      sortOrder: 'asc',
    }).rows
    expect(versions.length).toBeLessThan(expected.length)
    expect(versions[0]?.order_status).toBe('PAID')
    expect(versions.at(-1)?.zip_end_dt).toBe(OPEN_END)
    for (const [index, next] of versions.entries()) {
      const day = String(next.zip_start_dt)
      if (index > 0) expect(versions[index - 1]?.zip_end_dt).toBe(day)
      const snapshot = lookup('versions', { orderId: order.id, asOf: day })
      expect(snapshot.rows).toEqual([next])
    }
  })
  it('删除事件有前值无后值，删除日闭链且快照、当前明细均移除', () => {
    const orderId = removedOrder.id
    const events = lookup('changes', { orderId, operation: 'DELETE' }).rows
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operation: 'DELETE',
      before_status: 'CREATED',
      after_status: null,
    })
    const day = String(events[0]!.event_at).slice(0, 10)
    expect(versionsFor(removedOrder)).toHaveLength(1)
    expect(lookup('versions', { orderId, asOf: dayShift(day, -1) }).rows[0]?.zip_end_dt).toBe(day)
    expect(lookup('versions', { orderId, asOf: day }).total).toBe(0)
    expect(lookup('orders', { orderId }).total).toBe(0)
    expect(() => warehouseMock('/warehouse/order', { orderId })).toThrow('不存在或已删除')
  })
  it('所有目录表都可按元数据读取和分页，拒绝未知表和无效分页', () => {
    const tables = [
      'ods.ods_yjx_order_inc',
      'ods.ods_yjx_order_item_inc',
      'dwd.dwd_yjx_order_item_inc',
      'dwd.dwd_yjx_order_zip',
      'dws.dws_order_user_sku_order_1d',
      'ads.ads_order_stats',
    ]
    for (const table of tables) {
      const result = lookup('rows', {
        table,
        start: removedOrder.date,
        end: removedOrder.date,
        pageSize: 4,
      })
      expect(result.rows.length).toBeGreaterThan(0)
      for (const row of result.rows)
        for (const field of result.fields) expect(row).toHaveProperty(field.key)
    }
    expect(() => lookup('rows', { table: 'unknown' })).toThrow('未找到')
    expect(() => lookup('orders', { page: 0 })).toThrow('分页参数')
    expect(() => lookup('orders', { asOf: '2026-02-31' })).toThrow('有效的日期')
  })
})
