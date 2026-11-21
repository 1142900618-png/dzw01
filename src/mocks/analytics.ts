import type {
  AnalyticsFilters,
  BreakdownRow,
  DailyPage,
  DailyQuery,
  Dimension,
  DimensionOption,
  MetricKey,
  Metrics,
  OrderFact,
  Overview,
} from '../domain/analytics'
import {
  analyticsOptions,
  dimensionOptions,
  getOrderFacts,
  getOrderItems,
  modelConfig,
} from './data/analyticsFacts'

const DAY = 86_400_000
const dimensions: Dimension[] = ['category', 'channel', 'region', 'product']
const metricKeys: MetricKey[] = ['gmv', 'orders', 'buyers', 'basket']
const choices: Record<Dimension, DimensionOption[]> = {
  category: dimensionOptions.categories,
  channel: dimensionOptions.channels,
  region: dimensionOptions.regions,
  product: dimensionOptions.products,
}
const round = (amount: number) => Math.round(amount * 100) / 100

type Bucket = { cents: number; pieces: number; orders: Set<string>; buyers: Set<string> }
function bucket(): Bucket {
  return { cents: 0, pieces: 0, orders: new Set(), buyers: new Set() }
}

function contribute(to: Bucket, order: OrderFact, cents: number, pieces: number) {
  to.cents += cents
  to.pieces += pieces
  to.orders.add(order.id)
  to.buyers.add(order.buyerId)
}

function metrics(group?: Bucket): Metrics {
  if (!group) return { gmv: 0, orders: 0, buyers: 0, basket: 0, pieces: 0 }
  const gmv = group.cents / 100
  return {
    gmv,
    orders: group.orders.size,
    buyers: group.buyers.size,
    basket: group.buyers.size ? round(gmv / group.buyers.size) : 0,
    pieces: group.pieces,
  }
}

function groupFor(groups: Map<string, Bucket>, key: string): Bucket {
  let entry = groups.get(key)
  if (!entry) groups.set(key, (entry = bucket()))
  return entry
}

function parseDay(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('日期须为 YYYY-MM-DD')
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error('无效日期')
  }
  return time
}
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10)

function validateFilters(filters: AnalyticsFilters) {
  if (!filters || typeof filters !== 'object') throw new Error('缺少筛选条件')
  const start = parseDay(filters.start)
  const end = parseDay(filters.end)
  if (start > end || end - start > 365 * DAY) throw new Error('请选择不超过 366 天的有效区间')
  for (const dimension of dimensions) {
    const value = filters[dimension]
    if (
      value !== undefined &&
      value !== '' &&
      !choices[dimension].some((option) => option.id === value)
    ) {
      throw new Error('筛选维度值无效')
    }
  }
  return { start, end, days: Math.round((end - start) / DAY) + 1 }
}

let orderIndex: Map<string, OrderFact> | undefined
function aggregate(filters: AnalyticsFilters, groupDimensions: readonly Dimension[] = []) {
  orderIndex ??= new Map(getOrderFacts().map((order) => [order.id, order]))
  const total = bucket()
  const daily = new Map<string, Bucket>()
  const groups: Record<Dimension, Map<string, Bucket>> = {
    category: new Map(),
    channel: new Map(),
    region: new Map(),
    product: new Map(),
  }
  for (const item of getOrderItems()) {
    const order = orderIndex.get(item.orderId)!
    if (order.date < filters.start || order.date > filters.end) continue
    if (filters.channel && order.channel !== filters.channel) continue
    if (filters.region && order.region !== filters.region) continue
    if (filters.category && item.category !== filters.category) continue
    if (filters.product && item.product !== filters.product) continue

    contribute(total, order, item.amountCents, item.quantity)
    contribute(groupFor(daily, order.date), order, item.amountCents, item.quantity)
    for (const dimension of groupDimensions) {
      const key =
        dimension === 'category' || dimension === 'product' ? item[dimension] : order[dimension]
      contribute(groupFor(groups[dimension], key), order, item.amountCents, item.quantity)
    }
  }
  return { total, daily, groups }
}

function ranked(
  groups: Map<string, Bucket>,
  dimension: Dimension,
  totalCents: number,
): BreakdownRow[] {
  return choices[dimension]
    .filter(({ id }) => groups.has(id))
    .map((option) => {
      const item = groups.get(option.id)!
      return {
        id: option.id,
        name: option.name,
        ...metrics(item),
        share: totalCents ? round((item.cents / totalCents) * 100) : 0,
      }
    })
    .sort((a, b) => b.gmv - a.gmv || a.id.localeCompare(b.id))
}

export function getBreakdown(filters: AnalyticsFilters, dimension: Dimension): BreakdownRow[] {
  validateFilters(filters)
  if (!dimensions.includes(dimension)) throw new Error('未知分析维度')
  const { groups, total } = aggregate(filters, [dimension])
  return ranked(groups[dimension], dimension, total.cents)
}

export function getOverview(filters: AnalyticsFilters): Overview {
  const { start, end, days } = validateFilters(filters)
  const prevStart = start - days * DAY
  const prevEnd = start - DAY
  const current = aggregate(filters, dimensions)
  const previous = aggregate({ ...filters, start: dateOf(prevStart), end: dateOf(prevEnd) })
  const totals = metrics(current.total)
  const baseline = metrics(previous.total)
  // Partial baseline windows (e.g. at the first partition) are unsuitable for period comparisons.
  const completePeriods = dateOf(prevStart) >= modelConfig.start && filters.end <= modelConfig.end
  const delta = {} as Record<MetricKey, number | null>
  for (const key of metricKeys) {
    delta[key] =
      completePeriods && baseline[key] > 0 ? round((totals[key] / baseline[key] - 1) * 100) : null
  }
  const channels = ranked(current.groups.channel, 'channel', current.total.cents)
  const radarKeys: (keyof Metrics)[] = [...metricKeys, 'pieces']
  const maxima = radarKeys.map((key) => Math.max(0, ...channels.map((row) => row[key])))
  const trend: Overview['trend'] = []
  for (let time = start; time <= end; time += DAY) {
    const date = dateOf(time)
    const previousDate = dateOf(time - days * DAY)
    const prior = metrics(previous.daily.get(previousDate))
    trend.push({
      date,
      ...metrics(current.daily.get(date)),
      previousAvailable: previousDate >= modelConfig.start && previousDate <= modelConfig.end,
      previousGmv: prior.gmv,
      previousOrders: prior.orders,
      previousBuyers: prior.buyers,
      previousBasket: prior.basket,
    })
  }
  return {
    current: totals,
    previous: baseline,
    delta,
    trend,
    channels,
    categories: ranked(current.groups.category, 'category', current.total.cents),
    regions: ranked(current.groups.region, 'region', current.total.cents),
    products: ranked(current.groups.product, 'product', current.total.cents),
    radar: channels.map(({ id, name, ...values }) => ({
      id,
      name,
      values: radarKeys.map((key, index) =>
        maxima[index] ? round((values[key] / maxima[index]!) * 100) : 0,
      ),
    })),
    updatedAt: modelConfig.updatedAt,
  }
}

export function getDaily(query: DailyQuery): DailyPage {
  validateFilters(query)
  const { page, pageSize, sortBy = 'date', sortOrder = 'desc' } = query
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000
  ) {
    throw new Error('分页参数无效，每页可查询 1 至 1000 行')
  }
  if (!['date', 'pieces', ...metricKeys].includes(sortBy) || !['asc', 'desc'].includes(sortOrder)) {
    throw new Error('排序参数无效')
  }
  const { daily } = aggregate(query)
  const rows = [...daily].map(([date, group]) => ({ date, ...metrics(group) }))
  rows.sort((a, b) => {
    const diff = sortBy === 'date' ? a.date.localeCompare(b.date) : a[sortBy] - b[sortBy]
    return (sortOrder === 'asc' ? diff : -diff) || a.date.localeCompare(b.date)
  })
  const offset = (page - 1) * pageSize
  return { rows: rows.slice(offset, offset + pageSize), total: rows.length, page, pageSize }
}

export function handleAnalytics(path: string, body: unknown): unknown {
  switch (path) {
    case '/analytics/options':
      return structuredClone(analyticsOptions)
    case '/analytics/overview':
      return getOverview(body as AnalyticsFilters)
    case '/analytics/daily':
      return getDaily(body as DailyQuery)
    case '/analytics/breakdown': {
      const query = body as AnalyticsFilters & { dimension: Dimension }
      return getBreakdown(query, query.dimension)
    }
    default:
      throw new Error('分析接口不存在')
  }
}
