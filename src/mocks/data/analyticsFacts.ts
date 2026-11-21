import type { AnalyticsOptions, OrderFact, OrderItemFact } from '../../domain/analytics'
import catalog from './analyticsCatalog.json'

const DAY = 86_400_000
export const modelConfig = {
  start: catalog.start,
  end: catalog.end,
  updatedAt: catalog.updatedAt,
}
export const dimensionOptions: Omit<AnalyticsOptions, 'availableRange' | 'defaultRange'> = {
  categories: catalog.categories.map(({ id, name }) => ({ id, name })),
  channels: catalog.channels.map(({ id, name }) => ({ id, name })),
  regions: catalog.regions.map(({ id, name }) => ({ id, name })),
  products: catalog.products,
}
export const analyticsOptions: AnalyticsOptions = {
  ...dimensionOptions,
  availableRange: { start: catalog.start, end: catalog.end },
  defaultRange: {
    start: new Date(Date.parse(catalog.end) - (catalog.defaultDays - 1) * DAY)
      .toISOString()
      .slice(0, 10),
    end: catalog.end,
  },
}

// Generated lazily so importing the catalog does not allocate the full fact table.
let fixtures: { orders: OrderFact[]; items: OrderItemFact[] } | undefined

function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function weighted<T extends { weight: number }>(options: T[], random: () => number): T {
  let threshold = random() * 100
  for (const option of options) {
    threshold -= option.weight
    if (threshold < 0) return option
  }
  return options[options.length - 1]!
}

function orderStatus(age: number, chance: number): OrderFact['status'] {
  if (chance < 0.035) return 'CANCELLED'
  if (age < 1 && chance < 0.18) return 'CREATED'
  if (age < 2 && chance < 0.6) return 'PAID'
  if (age < 5 && chance < 0.87) return 'SHIPPED'
  return 'COMPLETED'
}

function makeFacts() {
  const orders: OrderFact[] = []
  const items: OrderItemFact[] = []
  const start = Date.parse(catalog.start)
  const days = Math.round((Date.parse(catalog.end) - start) / DAY) + 1
  const byCategory = new Map(
    catalog.categories.map(({ id }) => [
      id,
      catalog.products.filter((product) => product.category === id),
    ]),
  )
  const random = randomSource(catalog.seed)
  for (let day = 0; day < days; day++) {
    const date = new Date(start + day * DAY).toISOString().slice(0, 10)
    const age = days - day - 1
    const season = 0.88 + 0.18 * Math.sin(day * 0.52) + 0.11 * Math.cos(day * 1.66)
    const campaign = date === '2026-11-11' ? 1.68 : 1
    const count = Math.round((220 + day * 1.22) * season * campaign)
    for (let index = 0; index < count; index++) {
      const id = 'TY' + date.replaceAll('-', '') + String(index + 1).padStart(5, '0')
      const buyerId = 'M' + String(1 + Math.floor(Math.pow(random(), 1.7) * 6400)).padStart(6, '0')
      const region = weighted(catalog.regions, random).id
      const channel = weighted(catalog.channels, random).id
      // Purchases can span SKUs and categories. Count orders and buyers by identity.
      const productCount = 1 + Number(random() < 0.29) + Number(random() < 0.065)
      const selected = new Set<string>()
      let amountCents = 0
      let pieces = 0
      while (selected.size < productCount) {
        const category = weighted(catalog.categories, random).id
        const choices = byCategory.get(category)!
        const product = choices[Math.floor(random() * choices.length)]!
        if (selected.has(product.id)) continue
        selected.add(product.id)
        const quantity = 1 + Number(random() < 0.19) + Number(random() < 0.04)
        const discount = random() < 0.34 ? 0.88 : 1
        const lineCents = quantity * Math.round(product.price * 100 * discount)
        items.push({
          id: id + '-' + selected.size,
          orderId: id,
          product: product.id,
          category,
          quantity,
          amountCents: lineCents,
        })
        pieces += quantity
        amountCents += lineCents
      }
      const time = new Date(Math.floor(random() * (age === 0 ? 20 : 24) * 3600000))
      orders.push({
        id,
        buyerId,
        date,
        region,
        channel,
        amountCents,
        pieces,
        createdAt: date + 'T' + time.toISOString().slice(11, 19) + '+08:00',
        status: orderStatus(age, random()),
      })
    }
  }
  return { orders, items }
}

export function getOrderFacts(): readonly OrderFact[] {
  fixtures ??= makeFacts()
  return fixtures.orders
}
export function getOrderItems(): readonly OrderItemFact[] {
  fixtures ??= makeFacts()
  return fixtures.items
}
