import type { OrderFact, OrderItemFact } from '../domain/analytics'
import type {
  DataField,
  DataRow,
  GridQuery,
  GridResult,
  OrderDetail,
  WarehouseCatalog,
} from '../domain/warehouse'
import {
  analyticsOptions,
  dimensionOptions,
  getOrderFacts,
  getOrderItems,
  modelConfig,
} from './data/analyticsFacts'
import {
  changeFields,
  detailFields,
  lineFields,
  versionFields,
  warehouseLayers,
  warehouseTables,
} from './data/warehouseCatalog'
import { dayShift, eventsFor, removedOrder, versionsFor } from './data/warehouseHistory'

const names = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.id, x.name]))
const channelNames = names(dimensionOptions.channels)
const regionNames = names(dimensionOptions.regions)
const categoryNames = names(dimensionOptions.categories)
const productNames = names(dimensionOptions.products)
let lines: Map<string, OrderItemFact[]> | undefined
function itemsOf(id: string) {
  if (!lines) {
    lines = new Map()
    for (const item of getOrderItems()) {
      const list = lines.get(item.orderId)
      if (list) list.push(item)
      else lines.set(item.orderId, [item])
    }
  }
  return lines.get(id) ?? []
}

function gridQuery(body: unknown): GridQuery {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const q: GridQuery = { page: 1, pageSize: 10 }
  for (const field of ['page', 'pageSize'] as const) {
    const value = raw[field]
    if (value === undefined) continue
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      (field === 'pageSize' && value > 100)
    )
      throw new Error('分页参数超出有效范围')
    q[field] = value
  }
  for (const field of [
    'search',
    'sortBy',
    'start',
    'end',
    'category',
    'product',
    'channel',
    'region',
    'status',
    'orderId',
    'operation',
    'asOf',
    'table',
  ] as const) {
    const val = raw[field]
    if (typeof val === 'string' && val.trim()) q[field] = val.trim()
  }
  for (const date of [q.start, q.end, q.asOf]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        dayShift(date, 0) !== date)
    )
      throw new Error('请输入有效的日期')
  }
  if (q.start && q.end && q.start > q.end) throw new Error('开始日期应早于或等于结束日期')
  q.sortOrder = raw.sortOrder === 'asc' ? 'asc' : 'desc'
  return q
}
const between = (date: string, q: GridQuery) =>
  (!q.start || date >= q.start) && (!q.end || date <= q.end)
const isOrder = (order: OrderFact, q: GridQuery) => !q.orderId || order.id === q.orderId

function paginate(
  raw: DataRow[],
  fields: DataField[],
  q: GridQuery,
  defaultSort: string,
): GridResult {
  const needle = q.search?.toLowerCase()
  const rows = needle
    ? raw.filter((row) =>
        fields.some((f) =>
          String(row[f.key] ?? '')
            .toLowerCase()
            .includes(needle),
        ),
      )
    : raw
  const key = fields.some((f) => f.key === q.sortBy) ? q.sortBy! : defaultSort
  const direction = q.sortOrder === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    const x = a[key] ?? '',
      y = b[key] ?? ''
    return typeof x === 'number' && typeof y === 'number'
      ? (x - y) * direction
      : String(x).localeCompare(String(y), 'zh-CN') * direction
  })
  const page = Math.min(q.page, Math.max(1, Math.ceil(rows.length / q.pageSize)))
  return {
    rows: rows.slice((page - 1) * q.pageSize, page * q.pageSize),
    fields,
    page,
    pageSize: q.pageSize,
    total: rows.length,
  }
}

function orderRow(order: OrderFact): DataRow {
  return {
    sn: order.id,
    member_id: order.buyerId,
    create_time: order.createdAt.slice(0, 19).replace('T', ' '),
    order_status: order.status,
    flow_price: order.amountCents / 100,
    goods_num: order.pieces,
    client_type: order.channel,
    channel_name: channelNames.get(order.channel) ?? order.channel,
    region_name: regionNames.get(order.region) ?? order.region,
  }
}
function orderRows(q: GridQuery) {
  const rows: DataRow[] = []
  for (const order of getOrderFacts()) {
    if (
      !isOrder(order, q) ||
      !between(order.date, q) ||
      (q.channel && q.channel !== order.channel) ||
      (q.region && q.region !== order.region) ||
      (q.status && q.status !== order.status)
    )
      continue
    const row = orderRow(order)
    if (q.category || q.product) {
      const matches = itemsOf(order.id).filter(
        (item) =>
          (!q.category || item.category === q.category) &&
          (!q.product || item.product === q.product),
      )
      if (!matches.length) continue
      row.flow_price = matches.reduce((sum, item) => sum + item.amountCents, 0) / 100
      row.goods_num = matches.reduce((sum, item) => sum + item.quantity, 0)
    }
    rows.push(row)
  }
  const fields =
    q.category || q.product
      ? detailFields.map((field) =>
          field.key === 'flow_price'
            ? { ...field, label: '命中商品金额' }
            : field.key === 'goods_num'
              ? { ...field, label: '命中件数' }
              : field,
        )
      : detailFields
  return paginate(rows, fields, q, 'create_time')
}

function orderDetail(q: GridQuery): OrderDetail {
  const order = getOrderFacts().find((order) => order.id === q.orderId)
  if (!order) throw new Error('该订单不存在或已删除')
  return {
    row: orderRow(order),
    fields: detailFields,
    itemFields: lineFields,
    items: itemsOf(order.id).map((item) => ({
      sku_id: item.product,
      sku_name: productNames.get(item.product) ?? item.product,
      category_name: categoryNames.get(item.category) ?? item.category,
      sku_num: item.quantity,
      total_amount: item.amountCents / 100,
    })),
  }
}

function historicalRows(q: GridQuery, kind: 'events' | 'versions' | 'raw') {
  const rows: DataRow[] = []
  const earliest = q.start && !q.asOf ? dayShift(q.start, -3) : undefined
  for (const order of [...getOrderFacts(), removedOrder]) {
    if (
      !isOrder(order, q) ||
      (earliest && order.date < earliest) ||
      (q.end && order.date > q.end) ||
      (q.asOf && order.date > q.asOf)
    )
      continue
    if (kind === 'events') {
      rows.push(
        ...eventsFor(order).filter(
          (e) =>
            between(String(e.event_at).slice(0, 10), q) &&
            (!q.operation || q.operation === e.operation),
        ),
      )
    } else {
      for (const version of versionsFor(order)) {
        const from = String(version.zip_start_dt),
          until = String(version.zip_end_dt)
        if (q.asOf ? !(from <= q.asOf && q.asOf < until) : !between(from, q)) continue
        if (kind === 'raw')
          rows.push({ ...orderRow(order), order_status: version.order_status ?? null, dt: from })
        else rows.push(version)
      }
    }
  }
  return rows
}

function tableRows(q: GridQuery) {
  const table = warehouseTables.find((t) => t.id === q.table)
  if (!table) throw new Error('未找到所选数据表')
  if (table.id === 'dwd.dwd_yjx_order_zip')
    return paginate(historicalRows(q, 'versions'), table.fields, q, 'zip_start_dt')
  if (table.id === 'ods.ods_yjx_order_inc')
    return paginate(historicalRows(q, 'raw'), table.fields, q, 'dt')
  const result: DataRow[] = []
  const buckets = new Map<
    string,
    { row: DataRow; members: Set<string>; orders: Set<string>; cents: number; pieces: number }
  >()
  for (const order of getOrderFacts()) {
    if (!between(order.date, q)) continue
    for (const item of itemsOf(order.id)) {
      if (table.layer === 'DWS' || table.layer === 'ADS') {
        const daily = table.layer === 'ADS'
        const id = daily ? order.date : [order.date, order.buyerId, item.product].join('|')
        let bucket = buckets.get(id)
        if (!bucket) {
          const row: DataRow = daily
            ? { calc_dt: order.date }
            : {
                dt: order.date,
                member_id: order.buyerId,
                sku_id: item.product,
                sku_name: productNames.get(item.product) ?? item.product,
                category1_name: categoryNames.get(item.category) ?? item.category,
              }
          bucket = { row, members: new Set(), orders: new Set(), cents: 0, pieces: 0 }
          buckets.set(id, bucket)
        }
        bucket.members.add(order.buyerId)
        bucket.orders.add(order.id)
        bucket.cents += item.amountCents
        bucket.pieces += item.quantity
      } else {
        const row: DataRow = {
          id: item.id,
          order_sn: order.id,
          sku_id: item.product,
          create_time: order.createdAt.slice(0, 19).replace('T', ' '),
          dt: order.date,
        }
        result.push(
          table.layer === 'ODS'
            ? {
                ...row,
                category_id: item.category,
                num: item.quantity,
                flow_price: item.amountCents / 100,
              }
            : {
                ...row,
                member_id: order.buyerId,
                sku_num: item.quantity,
                total_amount: item.amountCents / 100,
              },
        )
      }
    }
  }
  for (const b of buckets.values())
    result.push(
      table.layer === 'ADS'
        ? {
            ...b.row,
            order_cnt: b.orders.size,
            order_user_cnt: b.members.size,
            sku_cnt: b.pieces,
            order_total_amount: b.cents / 100,
          }
        : {
            ...b.row,
            order_cnt_1d: b.orders.size,
            order_num_1d: b.pieces,
            order_total_amount_1d: b.cents / 100,
          },
    )
  return paginate(result, table.fields, q, table.layer === 'ADS' ? 'calc_dt' : 'dt')
}

export function warehouseMock(path: string, body: unknown) {
  const q = gridQuery(body)
  switch (path) {
    case '/warehouse/catalog':
      return {
        tables: warehouseTables,
        layers: warehouseLayers,
        options: dimensionOptions,
        range: {
          start: modelConfig.start,
          end: modelConfig.end,
          defaultStart: analyticsOptions.defaultRange.start,
        },
      } satisfies WarehouseCatalog
    case '/warehouse/rows':
      return tableRows(q)
    case '/warehouse/orders':
      return orderRows(q)
    case '/warehouse/order':
      return orderDetail(q)
    case '/warehouse/changes':
      return paginate(historicalRows(q, 'events'), changeFields, q, 'event_at')
    case '/warehouse/versions':
      return paginate(historicalRows(q, 'versions'), versionFields, q, 'zip_start_dt')
    default:
      throw new Error('未知数仓接口 ' + path)
  }
}
