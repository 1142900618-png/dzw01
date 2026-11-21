export type Layer = 'ODS' | 'DWD' | 'DWS' | 'ADS'
export type Cell = string | number | null
export type DataRow = Record<string, Cell>
export interface DataField {
  key: string
  label: string
  type: string
  description?: string
  format?: 'currency' | 'status' | 'operation' | 'number'
}
export interface TableDescriptor {
  id: string
  name: string
  layer: Layer
  description: string
  grain: string
  partition: string
  upstream: string[]
  fields: DataField[]
}
export interface Choice {
  id: string
  name: string
  category?: string
}
export interface WarehouseCatalog {
  tables: TableDescriptor[]
  layers: { id: Layer; name: string; description: string }[]
  options: { channels: Choice[]; categories: Choice[]; regions: Choice[]; products: Choice[] }
  range: { start: string; end: string; defaultStart: string }
}
export interface GridQuery {
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  start?: string
  end?: string
  channel?: string
  category?: string
  region?: string
  product?: string
  status?: string
  operation?: string
  asOf?: string
  orderId?: string
  table?: string
}
export interface GridResult {
  fields: DataField[]
  rows: DataRow[]
  total: number
  page: number
  pageSize: number
}
export interface OrderDetail {
  row: DataRow
  fields: DataField[]
  items: DataRow[]
  itemFields: DataField[]
}
export const statusNames: Record<string, string> = {
  CREATED: '待支付',
  PAID: '已支付',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}
export const operationNames: Record<string, string> = {
  INSERT: '新增',
  UPDATE: '更新',
  DELETE: '删除',
}
export function displayCell(field: DataField, value: Cell | undefined) {
  if (value === undefined || value === null || value === '') return '—'
  if (field.format === 'currency')
    return (
      '¥' +
      Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    )
  if (field.format === 'number') return Number(value).toLocaleString('zh-CN')
  if (field.format === 'status') return statusNames[String(value)] || String(value)
  if (field.format === 'operation') return operationNames[String(value)] || String(value)
  return String(value)
}
