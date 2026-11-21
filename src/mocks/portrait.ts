import type {
  PortraitCohort,
  PortraitQuery,
  PortraitScope,
  Shopper,
  ShopperTags,
} from '@/domain/portrait'
import {
  analyticsOptions,
  dimensionOptions,
  getOrderFacts,
  getOrderItems,
} from './data/analyticsFacts'

interface Accumulator {
  id: string
  count: number
  cents: number
  first: string
  last: string
  min: number
  max: number
  regions: Map<string, number>
  categories: Map<string, number>
}

function mostFrequent(counts: Map<string, number>): string {
  return [...counts.entries()].sort(([a, n], [b, m]) => m - n || a.localeCompare(b))[0]?.[0] ?? ''
}

function startDate(scope: PortraitScope): string {
  if (![30, 60, 90].includes(scope.days) || !/^\d{4}-\d{2}-\d{2}$/.test(scope.asOf)) {
    throw new Error('请选择有效的分区日期与统计窗口')
  }
  const day = new Date(scope.asOf + 'T00:00:00Z')
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== scope.asOf) {
    throw new Error('分区日期无效')
  }
  day.setUTCDate(day.getUTCDate() - scope.days + 1)
  const first = day.toISOString().slice(0, 10)
  const range = analyticsOptions.availableRange
  if (first < range.start || scope.asOf > range.end) throw new Error('所选窗口超出可用数据分区')
  return first
}

// Cache the most recent partition/window only. Changing filters never alters the fact rows.
let cached: { key: string; rows: Shopper[] } | undefined

function shoppers(scope: PortraitScope, start: string): Shopper[] {
  const key = start + '/' + scope.asOf
  if (cached?.key === key) return cached.rows
  const buyers = new Map<string, Accumulator>()
  const orders = new Map<string, Accumulator>()
  for (const order of getOrderFacts()) {
    if (order.date < start || order.date > scope.asOf) continue
    let person = buyers.get(order.buyerId)
    if (!person) {
      person = {
        id: order.buyerId,
        count: 0,
        cents: 0,
        first: order.date,
        last: order.date,
        min: order.amountCents,
        max: order.amountCents,
        regions: new Map(),
        categories: new Map(),
      }
      buyers.set(order.buyerId, person)
    }
    person.count += 1
    person.cents += order.amountCents
    if (order.date < person.first) person.first = order.date
    if (order.date > person.last) person.last = order.date
    person.min = Math.min(person.min, order.amountCents)
    person.max = Math.max(person.max, order.amountCents)
    person.regions.set(order.region, (person.regions.get(order.region) ?? 0) + 1)
    orders.set(order.id, person)
  }
  // The source specification ranks categories by the number of order-item records.
  for (const line of getOrderItems()) {
    const buyer = orders.get(line.orderId)
    if (buyer) buyer.categories.set(line.category, (buyer.categories.get(line.category) ?? 0) + 1)
  }
  const rows = [...buyers.values()]
    .map((p) => ({
      id: p.id,
      orders: p.count,
      amount: p.cents / 100,
      firstOrder: p.first,
      lastOrder: p.last,
      minAmount: p.min / 100,
      maxAmount: p.max / 100,
      region: mostFrequent(p.regions),
      category: mostFrequent(p.categories),
    }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  cached = { key, rows }
  return rows
}

function cohort(query: PortraitQuery): PortraitCohort {
  const start = startDate(query)
  if (
    !['all', 'once', 'repeat'].includes(query.group) ||
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    !Number.isInteger(query.pageSize) ||
    query.pageSize < 1 ||
    query.pageSize > 100
  ) {
    throw new Error('人群分组或分页参数无效')
  }
  if (query.search !== undefined && typeof query.search !== 'string')
    throw new Error('搜索条件无效')
  if (query.region && !dimensionOptions.regions.some((r) => r.id === query.region))
    throw new Error('未知地域')
  const search = (query.search ?? '').trim().toLowerCase()
  const people = shoppers(query, start).filter(
    (p) =>
      (!query.region || p.region === query.region) &&
      (!search || p.id.toLowerCase().includes(search)) &&
      (query.group === 'all' || (query.group === 'once' ? p.orders === 1 : p.orders > 1)),
  )
  const page = Math.min(query.page, Math.max(1, Math.ceil(people.length / query.pageSize)))
  const counts = new Map<string, number>()
  let cents = 0
  let repeatPeople = 0
  for (const p of people) {
    cents += Math.round(p.amount * 100)
    if (p.orders >= 2) repeatPeople++
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  }
  return {
    start,
    end: query.asOf,
    people: people.length,
    repeatPeople,
    amount: cents / 100,
    average: people.length ? Math.round(cents / people.length) / 100 : 0,
    categories: dimensionOptions.categories
      .map((c) => ({ ...c, people: counts.get(c.id) ?? 0 }))
      .sort((a, b) => b.people - a.people || a.id.localeCompare(b.id)),
    rows: people.slice((page - 1) * query.pageSize, page * query.pageSize),
    page,
    pageSize: query.pageSize,
  }
}

function tags(scope: PortraitScope & { id: string }): ShopperTags {
  const start = startDate(scope)
  const p = shoppers(scope, start).find((p) => p.id === scope.id)
  if (!p) throw new Error('当前窗口内未找到该用户')
  const month = scope.days / 30
  return {
    id: p.id,
    start,
    end: scope.asOf,
    dt: scope.asOf,
    tags: [
      {
        field: 'month' + month + '_order_cnt',
        label: '窗口下单次数',
        value: p.orders,
        unit: '次',
        source: 'ads_profile_order_tag',
      },
      {
        field: 'month' + month + '_order_amt',
        label: '窗口下单金额',
        value: p.amount,
        unit: '元',
        source: 'ads_profile_order_tag',
      },
      {
        field: 'window_first_order',
        label: '窗口首单日期',
        value: p.firstOrder,
        source: '订单明细派生',
      },
      {
        field: 'window_last_order',
        label: '窗口末单日期',
        value: p.lastOrder,
        source: '订单明细派生',
      },
      {
        field: 'window_max_order_amt',
        label: '窗口最大单额',
        value: p.maxAmount,
        unit: '元',
        source: '订单明细派生',
      },
      {
        field: 'window_min_order_amt',
        label: '窗口最小单额',
        value: p.minAmount,
        unit: '元',
        source: '订单明细派生',
      },
      {
        field: 'common_1st_category',
        label: '最常购买一级品类',
        value: dimensionOptions.categories.find((c) => c.id === p.category)?.name ?? '未知',
        source: 'ads_profile_favorite_tag',
      },
      {
        field: 'window_common_region',
        label: '窗口常用地域',
        value: dimensionOptions.regions.find((r) => r.id === p.region)?.name ?? '未知',
        source: '订单明细派生',
      },
    ],
  }
}

export function portraitMock(path: string, body: unknown): PortraitCohort | ShopperTags {
  if (typeof body !== 'object' || body === null) throw new Error('缺少画像请求参数')
  if (path === '/portrait/cohort') return cohort(body as PortraitQuery)
  if (path === '/portrait/tags') return tags(body as PortraitScope & { id: string })
  throw new Error('未知画像接口')
}
