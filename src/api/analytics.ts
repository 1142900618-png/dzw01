import type {
  AnalyticsFilters,
  AnalyticsOptions,
  BreakdownRow,
  DailyPage,
  DailyQuery,
  Dimension,
  Overview,
} from '../domain/analytics'
import { request } from './client'

export const analyticsApi = {
  options: (signal?: AbortSignal) => request<AnalyticsOptions>('/analytics/options', {}, signal),
  overview: (filters: AnalyticsFilters, signal?: AbortSignal) =>
    request<Overview>('/analytics/overview', filters, signal),
  daily: (query: DailyQuery, signal?: AbortSignal) =>
    request<DailyPage>('/analytics/daily', query, signal),
  breakdown: (filters: AnalyticsFilters, dimension: Dimension, signal?: AbortSignal) =>
    request<BreakdownRow[]>('/analytics/breakdown', { ...filters, dimension }, signal),
}
