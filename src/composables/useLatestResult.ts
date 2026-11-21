import { onScopeDispose, ref, shallowRef } from 'vue'

/** Only the latest filter selection can publish a response to the visible panel. */
export function useLatestResult<T>() {
  const data = shallowRef<T | null>(null)
  const pending = ref(false)
  const error = ref('')
  let controller: AbortController | undefined
  function cancel() {
    controller?.abort()
    pending.value = false
    data.value = null
    error.value = ''
  }
  async function run(load: (signal: AbortSignal) => Promise<T>) {
    cancel()
    const current = new AbortController()
    controller = current
    pending.value = true
    try {
      const value = await load(current.signal)
      if (!current.signal.aborted) data.value = value
    } catch (cause) {
      if (!current.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '请求失败，请重试'
    } finally {
      if (!current.signal.aborted) pending.value = false
    }
  }
  onScopeDispose(cancel)
  return { data, pending, error, cancel, run }
}
