/** All public amounts are CNY yuan. Source order facts retain integer cents. */
export type MetricKey = 'gmv' | 'orders' | 'buyers' | 'basket'
export type Dimension = 'category' | 'channel' | 'region' | 'product'
export type DateRange = { start: string; end: string }

export interface AnalyticsFilters extends DateRange {
  category?: string
  channel?: string
  region?: string
  product?: string
}

export interface DimensionOption {
  id: string
  name: string
}

export interface AnalyticsOptions {
  categories: DimensionOption[]
  channels: DimensionOption[]
  regions: DimensionOption[]
  products: (DimensionOption & { category: string; price: number })[]
  defaultRange: DateRange
  availableRange: DateRange
}

export interface Metrics {
  gmv: number
  orders: number
  buyers: number
  basket: number
  pieces: number
}

export interface BreakdownRow extends Metrics, DimensionOption {
  /** Percentage of the filtered GMV, in [0, 100]. */
  share: number
}

export interface DailyRow extends Metrics {
  date: string
}

export interface TrendPoint extends DailyRow {
  /** False when the aligned comparison date precedes the first available partition. */
  previousAvailable: boolean
  previousGmv: number
  previousOrders: number
  previousBuyers: number
  previousBasket: number
}

export interface RadarSeries extends DimensionOption {
  /** In order: GMV, orders, buyers, basket and pieces; maxima normalized to 100. */
  values: number[]
}

export interface Overview {
  current: Metrics
  previous: Metrics
  delta: Record<MetricKey, number | null>
  trend: TrendPoint[]
  categories: BreakdownRow[]
  channels: BreakdownRow[]
  regions: BreakdownRow[]
  products: BreakdownRow[]
  radar: RadarSeries[]
  updatedAt: string
}

export interface DailyQuery extends AnalyticsFilters {
  page: number
  pageSize: number
  sortBy?: 'date' | keyof Metrics
  sortOrder?: 'asc' | 'desc'
}

export interface DailyPage {
  rows: DailyRow[]
  total: number
  page: number
  pageSize: number
}

export interface OrderFact {
  id: string
  buyerId: string
  date: string
  createdAt: string
  region: string
  channel: string
  amountCents: number
  pieces: number
  status: 'CREATED' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
}

export interface OrderItemFact {
  id: string
  orderId: string
  product: string
  category: string
  quantity: number
  amountCents: number
}
