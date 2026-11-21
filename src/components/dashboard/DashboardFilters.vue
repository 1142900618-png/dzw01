<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, ChevronDown, Filter, RotateCcw } from 'lucide-vue-next'
import type { AnalyticsFilters, AnalyticsOptions } from '@/domain/analytics'

const props = defineProps<{ modelValue: AnalyticsFilters; options: AnalyticsOptions }>()
const emit = defineEmits<{ 'update:modelValue': [value: AnalyticsFilters] }>()
const dateOpen = ref(false)
const control = ref<HTMLElement>()
const dateTrigger = ref<HTMLButtonElement>()
const draftStart = ref('')
const draftEnd = ref('')
const validation = ref('')
const dimensions = [
  { key: 'channel', group: 'channels', title: '渠道' },
  { key: 'region', group: 'regions', title: '地区' },
  { key: 'category', group: 'categories', title: '品类' },
] as const

function close(restoreFocus = false) {
  dateOpen.value = false
  if (restoreFocus) dateTrigger.value?.focus()
}
function toggleDate() {
  if (dateOpen.value) return close()
  draftStart.value = props.modelValue.start
  draftEnd.value = props.modelValue.end
  validation.value = ''
  dateOpen.value = true
}
function applyDates() {
  if (!draftStart.value || !draftEnd.value || draftEnd.value < draftStart.value) {
    validation.value = '请选择有效的开始与结束日期。'
    return
  }
  if (
    draftStart.value < props.options.availableRange.start ||
    draftEnd.value > props.options.availableRange.end
  ) {
    validation.value = '日期超出数据可用区间。'
    return
  }
  emit('update:modelValue', { ...props.modelValue, start: draftStart.value, end: draftEnd.value })
  close(true)
}
function recent(days: number) {
  const end = props.options.availableRange.end
  const date = new Date(end + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() - days + 1)
  draftStart.value = [
    date.toISOString().slice(0, 10),
    props.options.availableRange.start,
  ].sort()[1]!
  draftEnd.value = end
  applyDates()
}
function chooseDimension(key: 'category' | 'channel' | 'region', event: Event) {
  const value = (event.target as HTMLSelectElement).value || undefined
  const next = { ...props.modelValue, [key]: value }
  if (key === 'category') delete next.product
  emit('update:modelValue', next)
}
function outside(event: PointerEvent) {
  if (!control.value?.contains(event.target as Node)) close()
}
watch(
  () => props.modelValue,
  () => close(),
)
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <div class="dash-filters" aria-label="看板筛选条件">
    <span class="filter-label"><Filter :size="15" />筛选</span>
    <div ref="control" class="dash-date-wrap" @keydown.esc="close(true)">
      <button
        ref="dateTrigger"
        class="dash-filter-select dash-date-trigger"
        aria-haspopup="dialog"
        :aria-expanded="dateOpen"
        @click="toggleDate"
      >
        <CalendarDays :size="15" /><span>{{ modelValue.start.replaceAll('-', '/') }}</span>
        <span class="date-dash">—</span><span>{{ modelValue.end.replaceAll('-', '/') }}</span
        ><ChevronDown :size="14" />
      </button>
      <div v-if="dateOpen" role="dialog" aria-label="选择时间范围" class="dash-date-popup">
        <strong>时间范围</strong>
        <div class="date-presets">
          <button v-for="days in [7, 14, 30, 90]" :key="days" type="button" @click="recent(days)">
            近 {{ days }} 天
          </button>
        </div>
        <label
          >开始日期<input
            v-model="draftStart"
            type="date"
            :min="options.availableRange.start"
            :max="options.availableRange.end"
        /></label>
        <label
          >结束日期<input
            v-model="draftEnd"
            type="date"
            :min="draftStart || options.availableRange.start"
            :max="options.availableRange.end"
        /></label>
        <p class="date-range-hint">
          可用日期 {{ options.availableRange.start }} 至 {{ options.availableRange.end }}
        </p>
        <p v-if="validation" class="date-error" role="alert">{{ validation }}</p>
        <button type="button" class="dash-btn primary" @click="applyDates">应用时间范围</button>
      </div>
    </div>
    <label v-for="d in dimensions" :key="d.key" class="dash-select-wrap">
      <select
        class="dash-filter-select"
        :value="modelValue[d.key] || ''"
        :aria-label="d.title"
        @change="chooseDimension(d.key, $event)"
      >
        <option value="">全部{{ d.title }}</option>
        <option v-for="option in options[d.group]" :key="option.id" :value="option.id">
          {{ option.name }}
        </option>
      </select>
      <ChevronDown :size="13" />
    </label>
    <button
      class="filter-reset"
      title="恢复默认筛选条件"
      @click="emit('update:modelValue', { ...options.defaultRange })"
    >
      <RotateCcw :size="14" />重置
    </button>
  </div>
</template>
