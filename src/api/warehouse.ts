import { request } from './client'
import type { GridQuery, GridResult, OrderDetail, WarehouseCatalog } from '../domain/warehouse'

export const warehouseApi = {
  catalog: (signal?: AbortSignal) => request<WarehouseCatalog>('/warehouse/catalog', {}, signal),
  rows: (query: GridQuery, signal?: AbortSignal) =>
    request<GridResult>('/warehouse/rows', query, signal),
  orders: (query: GridQuery, signal?: AbortSignal) =>
    request<GridResult>('/warehouse/orders', query, signal),
  changes: (query: GridQuery, signal?: AbortSignal) =>
    request<GridResult>('/warehouse/changes', query, signal),
  versions: (query: GridQuery, signal?: AbortSignal) =>
    request<GridResult>('/warehouse/versions', query, signal),
  order: (orderId: string, signal?: AbortSignal) =>
    request<OrderDetail>('/warehouse/order', { orderId }, signal),
}
