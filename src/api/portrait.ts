import { request } from '@/api/client'
import type { PortraitCohort, PortraitQuery, PortraitScope, ShopperTags } from '@/domain/portrait'

export const portraitApi = {
  cohort: (query: PortraitQuery, signal?: AbortSignal) =>
    request<PortraitCohort>('/portrait/cohort', query, signal),
  tags: (scope: PortraitScope & { id: string }, signal?: AbortSignal) =>
    request<ShopperTags>('/portrait/tags', scope, signal),
}
