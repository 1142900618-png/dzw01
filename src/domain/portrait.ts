export type PortraitWindow = 30 | 60 | 90
export type FrequencyGroup = 'all' | 'once' | 'repeat'

export interface PortraitScope {
  asOf: string
  days: PortraitWindow
}

export interface PortraitQuery extends PortraitScope {
  group: FrequencyGroup
  region?: string
  search?: string
  page: number
  pageSize: number
}

export interface Shopper {
  id: string
  orders: number
  amount: number
  firstOrder: string
  lastOrder: string
  minAmount: number
  maxAmount: number
  region: string
  category: string
}

export interface PortraitCohort {
  start: string
  end: string
  people: number
  repeatPeople: number
  amount: number
  average: number
  categories: { id: string; name: string; people: number }[]
  rows: Shopper[]
  page: number
  pageSize: number
}

export interface ShopperTag {
  field: string
  label: string
  value: string | number
  unit?: string
  source: 'ads_profile_order_tag' | 'ads_profile_favorite_tag' | '订单明细派生'
}

export interface ShopperTags {
  id: string
  start: string
  end: string
  dt: string
  tags: ShopperTag[]
}
