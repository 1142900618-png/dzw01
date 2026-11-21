import type { OrderFact } from '../../domain/analytics'
import type { DataRow } from '../../domain/warehouse'
import { modelConfig } from './analyticsFacts'

const DAY = 86_400_000
const lastInstant = Date.parse(modelConfig.updatedAt)
export const OPEN_END = '9999-12-31'
const statusSteps: Record<OrderFact['status'], OrderFact['status'][]> = {
  CREATED: ['CREATED'],
  PAID: ['CREATED', 'PAID'],
  SHIPPED: ['CREATED', 'PAID', 'SHIPPED'],
  COMPLETED: ['CREATED', 'PAID', 'SHIPPED', 'COMPLETED'],
  CANCELLED: ['CREATED', 'CANCELLED'],
}
export function dayShift(date: string, offset: number) {
  return new Date(Date.parse(date) + offset * DAY).toISOString().slice(0, 10)
}
function localTimestamp(utcMs: number) {
  return new Date(utcMs + 8 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
}

// One explicitly removed source record exercises DELETE and a chain with no open version.
const deleteDay = dayShift(modelConfig.end, -1)
export const removedOrder: OrderFact = {
  id: 'CDC-REMOVED-001',
  buyerId: 'M-ARCHIVE',
  date: dayShift(deleteDay, -1),
  createdAt: dayShift(deleteDay, -1) + 'T09:00:00+08:00',
  region: 'sh',
  channel: 'web',
  amountCents: 5900,
  pieces: 1,
  status: 'CREATED',
}

export function eventsFor(order: OrderFact): DataRow[] {
  const sequence = statusSteps[order.status]
  const created = Date.parse(order.createdAt)
  // Compress late-arriving lifecycles into the available event-time window.
  const clock = [0, 18 * 60_000, DAY, 3 * DAY]
  const scale = Math.min(1, (lastInstant - created) / (clock[sequence.length - 1] || 1))
  const rows: DataRow[] = sequence.map((value, index) => ({
    event_id: order.id + '-' + (index + 1),
    event_at: localTimestamp(created + (clock[index] ?? 0) * scale),
    sn: order.id,
    operation: index === 0 ? 'INSERT' : 'UPDATE',
    before_status: sequence[index - 1] ?? null,
    after_status: value,
    member_id: order.buyerId,
    flow_price: order.amountCents / 100,
  }))
  if (order.id === removedOrder.id)
    rows.push({
      event_id: order.id + '-2',
      event_at: deleteDay + ' 10:30:00',
      sn: order.id,
      operation: 'DELETE',
      before_status: order.status,
      after_status: null,
      member_id: order.buyerId,
      flow_price: order.amountCents / 100,
    })
  return rows
}

export function versionsFor(order: OrderFact): DataRow[] {
  // Multiple events on one day collapse to the last state. A tombstone closes the chain.
  const daily = new Map<string, DataRow>()
  for (const event of eventsFor(order)) daily.set(String(event.event_at).slice(0, 10), event)
  const changes = [...daily.entries()]
  return changes.flatMap(([date, event], index) =>
    event.operation === 'DELETE'
      ? []
      : [
          {
            sn: order.id,
            order_status: event.after_status ?? null,
            member_id: order.buyerId,
            flow_price: order.amountCents / 100,
            zip_start_dt: date,
            zip_end_dt: changes[index + 1]?.[0] ?? OPEN_END,
          },
        ],
  )
}
