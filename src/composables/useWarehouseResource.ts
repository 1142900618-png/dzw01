import { ref, shallowRef, watchEffect } from 'vue'

// Abort the previous request when the query changes. The identity check also
// suppresses stale responses from a transport that cannot cancel work in flight.
export function useWarehouseResource<T>(load: (signal: AbortSignal) => Promise<T> | null) {
  const data = shallowRef<T | null>(null)
  const error = ref('')
  const loading = ref(false)
  const revision = ref(0)
  const refresh = () => revision.value++
  watchEffect((invalidate) => {
    void revision.value
    const controller = new AbortController()
    invalidate(() => controller.abort())
    error.value = ''
    data.value = null
    const pending = load(controller.signal)
    loading.value = !!pending
    if (!pending) return
    pending
      .then((result) => {
        if (!controller.signal.aborted) data.value = result
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          error.value = reason instanceof Error ? reason.message : '请求失败，请稍后重试'
      })
      .finally(() => {
        if (!controller.signal.aborted) loading.value = false
      })
  })
  return { data, error, loading, refresh }
}

import type { GridQuery } from '../domain/warehouse'

export function useWarehouseQuery() {
  const query = shallowRef<GridQuery>({ page: 1, pageSize: 10, sortOrder: 'desc' })
  function replace(filters: Omit<GridQuery, 'page' | 'pageSize'>) {
    query.value = { ...filters, page: 1, pageSize: query.value.pageSize }
  }
  function page(value: number) {
    query.value = { ...query.value, page: value }
  }
  function resize(value: number) {
    query.value = { ...query.value, page: 1, pageSize: value }
  }
  function sort(key: string) {
    const sortOrder =
      query.value.sortBy === key && query.value.sortOrder === 'desc' ? 'asc' : 'desc'
    query.value = { ...query.value, page: 1, sortBy: key, sortOrder }
  }
  return { query, replace, page, resize, sort }
}
