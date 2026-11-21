<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
} from 'lucide-vue-next'
import { analyticsApi } from '@/api/analytics'
import type { AnalyticsFilters, DailyPage, DailyRow } from '@/domain/analytics'

const props = defineProps<{ filters: AnalyticsFilters; revision: number; canDrill: boolean }>()
const emit = defineEmits<{ day: [date: string] }>()
const columns: { key: keyof DailyRow; title: string }[] = [
  { key: 'date', title: '统计日期' },
  { key: 'gmv', title: '交易总额 (元)' },
  { key: 'orders', title: '订单数' },
  { key: 'buyers', title: '下单人数' },
  { key: 'basket', title: '客单价 (元)' },
  { key: 'pieces', title: '商品件数' },
]
const page = ref(1)
const pageSize = ref(7)
const sortBy = ref<keyof DailyRow>('date')
const sortOrder = ref<'asc' | 'desc'>('desc')
const result = ref<DailyPage>()
const loading = ref(false)
const error = ref('')
const retry = ref(0)
const totalPages = computed(() =>
  Math.max(1, Math.ceil((result.value?.total ?? 0) / pageSize.value)),
)

watch([() => props.filters, pageSize], () => {
  page.value = 1
})
watch(
  [() => props.filters, () => props.revision, pageSize, page, sortBy, sortOrder, retry],
  async (_, __, invalidate) => {
    const controller = new AbortController()
    invalidate(() => controller.abort())
    loading.value = true
    error.value = ''
    try {
      const reply = await analyticsApi.daily(
        {
          ...props.filters,
          page: page.value,
          pageSize: pageSize.value,
          sortBy: sortBy.value,
          sortOrder: sortOrder.value,
        },
        controller.signal,
      )
      if (!controller.signal.aborted) result.value = reply
    } catch (err) {
      if (!controller.signal.aborted)
        error.value = err instanceof Error ? err.message : '明细查询失败'
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
  { immediate: true },
)

function sort(key: keyof DailyRow) {
  sortOrder.value = sortBy.value === key && sortOrder.value === 'desc' ? 'asc' : 'desc'
  sortBy.value = key
  page.value = 1
}
function cell(row: DailyRow, key: keyof DailyRow) {
  const value = row[key]
  if (typeof value === 'string') return value
  const f = key === 'gmv' || key === 'basket' ? 2 : 0
  return value.toLocaleString('zh-CN', { minimumFractionDigits: f, maximumFractionDigits: f })
}
</script>

<template>
  <section class="dash-panel daily-panel" aria-labelledby="daily-title">
    <div class="chart-panel-header">
      <h2 id="daily-title"><i class="section-mark"></i>每日经营明细</h2>
      <span class="daily-grain"><ListFilter :size="14" />按日汇总</span>
    </div>
    <div v-if="error" class="dash-state" role="alert">
      <p>{{ error }}</p>
      <button class="dash-btn" @click="retry++">重新加载</button>
    </div>
    <template v-else>
      <div class="daily-scroll" :aria-busy="loading">
        <table>
          <thead>
            <tr>
              <th
                v-for="c in columns"
                :key="c.key"
                scope="col"
                :aria-sort="
                  sortBy === c.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'
                "
              >
                <button @click="sort(c.key)">
                  {{ c.title
                  }}<component
                    :is="
                      sortBy === c.key ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp
                    "
                    :size="12"
                  />
                </button>
              </th>
              <th v-if="canDrill" scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result?.rows || []" :key="row.date">
              <td v-for="c in columns" :key="c.key">{{ cell(row, c.key) }}</td>
              <td v-if="canDrill">
                <button class="link-action" :disabled="loading" @click="emit('day', row.date)">
                  查看明细
                </button>
              </td>
            </tr>
            <tr v-if="!result?.rows.length">
              <td :colspan="canDrill ? 7 : 6" class="daily-placeholder">
                {{ loading ? '正在加载经营明细…' : '当前条件下暂无交易记录' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="result?.total" class="daily-footer">
        <small>共 {{ result.total.toLocaleString() }} 条记录</small>
        <div class="daily-pages">
          <label class="dash-select-wrap"
            ><select v-model.number="pageSize" aria-label="每页条数">
              <option v-for="n in [7, 14, 30]" :key="n" :value="n">{{ n }} 条 / 页</option></select
            ><ChevronDown :size="12"
          /></label>
          <button
            aria-label="上一页"
            title="上一页"
            :disabled="page <= 1 || loading"
            @click="page--"
          >
            <ChevronLeft :size="15" />
          </button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button
            aria-label="下一页"
            title="下一页"
            :disabled="page >= totalPages || loading"
            @click="page++"
          >
            <ChevronRight :size="15" />
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
