import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { readStorage, writeStorage } from '@/lib/storage'

export const usePreferencesStore = defineStore('preferences', () => {
  const dark = ref(readStorage('taiyi:theme') === 'dark')
  watch(
    dark,
    (enabled) => {
      document.documentElement.dataset.theme = enabled ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', enabled)
      writeStorage('taiyi:theme', enabled ? 'dark' : 'light')
    },
    { immediate: true, flush: 'sync' },
  )
  return { dark }
})
