import { describe, expect, it } from 'vitest'
import type { PortraitCohort, PortraitQuery, ShopperTags } from '../src/domain/portrait'
import { analyticsOptions } from '../src/mocks/data/analyticsFacts'
import { portraitMock } from '../src/mocks/portrait'

const base: PortraitQuery = {
  asOf: analyticsOptions.availableRange.end,
  days: 30,
  group: 'all',
  page: 1,
  pageSize: 5,
}
const cohort = (overrides: Partial<PortraitQuery> = {}) =>
  portraitMock('/portrait/cohort', { ...base, ...overrides }) as PortraitCohort

describe('画像窗口、筛选与标签一致性', () => {
  it('按下单频次分组的总人数与全集一致，分页维持统计范围', () => {
    const all = cohort()
    const once = cohort({ group: 'once' })
    const repeat = cohort({ group: 'repeat' })
    const page2 = cohort({ page: 2 })
    expect(once.people + repeat.people).toBe(all.people)
    expect(all.repeatPeople).toBe(repeat.people)
    expect(once.repeatPeople).toBe(0)
    expect(repeat.rows.every((row) => row.orders > 1)).toBe(true)
    expect(all.categories.reduce((sum, group) => sum + group.people, 0)).toBe(all.people)
    expect(page2.people).toBe(all.people)
    expect(new Set([...all.rows, ...page2.rows].map((r) => r.id)).size).toBe(base.pageSize * 2)
  })

  it.each([30, 60, 90] as const)('近 %i 天的标签与筛选明细同源', (days) => {
    const row = cohort({ days }).rows[0]
    const filtered = cohort({ days, region: row.region, search: row.id })
    expect(filtered.rows[0]).toEqual(row)
    const detail = portraitMock('/portrait/tags', {
      asOf: base.asOf,
      days,
      id: row.id,
    }) as ShopperTags
    expect(detail.start).toBe(filtered.start)
    expect(detail.end).toBe(filtered.end)
    expect(detail.tags).toContainEqual(
      expect.objectContaining({ field: 'month' + days / 30 + '_order_amt', value: row.amount }),
    )
  })

  it('拒绝窗口越界及无效日历日期，避免把缺失分区计作零', () => {
    expect(() => cohort({ asOf: analyticsOptions.availableRange.start })).toThrow(/数据分区/)
    expect(() => cohort({ asOf: '2030-12-30' })).toThrow(/数据分区/)
    expect(() => cohort({ asOf: '2026-02-31' })).toThrow(/日期/)
  })
})
