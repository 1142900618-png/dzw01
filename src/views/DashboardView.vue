<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertCircle, Download, Inbox, RefreshCw } from 'lucide-vue-next'
import { analyticsApi } from '@/api/analytics'
import { useSessionStore } from '@/stores/session'
import { downloadCsv } from '@/lib/csv'
import type { AnalyticsFilters, AnalyticsOptions, MetricKey, Overview } from '@/domain/analytics'
import CategoryPanel from '@/components/dashboard/CategoryPanel.vue'
import DashboardFilters from '@/components/dashboard/DashboardFilters.vue'
import DailyTable from '@/components/dashboard/DailyTable.vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import TrendPanel from '@/components/dashboard/TrendPanel.vue'
import '@/styles/dashboard.css'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const options = ref<AnalyticsOptions>()
// The route keeps the filter context when a user opens a detail and navigates back.
const filters = computed<AnalyticsFilters | undefined>({
  get() {
    if (!options.value || route.name !== 'dashboard') return undefined
    const selected: AnalyticsFilters = { ...options.value.defaultRange }
    for (const key of ['start', 'end', 'channel', 'region', 'category'] as const) {
      const value = route.query[key]
      if (typeof value === 'string' && value) selected[key] = value
    }
    return selected
  },
  set(next) {
    if (!next) return
    void router.replace({ name: 'dashboard', query: { ...next } })
  },
})
const overview = ref<Overview>()
const error = ref('')
const loading = ref(true)
const revision = ref(0)
const message = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let initialRequest: AbortController | undefined
const kpis: { key: MetricKey; label: string }[] = [
  { key: 'gmv', label: '交易总额 (GMV)' },
  { key: 'orders', label: '订单总数' },
  { key: 'buyers', label: '下单人数' },
  { key: 'basket', label: '客单价' },
]
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })
const cards = computed(() => {
  const data = overview.value
  if (!data) return []
  return kpis.map((k) => ({
    ...k,
    display:
      k.key === 'gmv' || k.key === 'basket'
        ? currency.format(data.current[k.key])
        : data.current[k.key].toLocaleString('zh-CN'),
    series: data.trend.map((row) => row[k.key]),
    change: data.delta[k.key],
  }))
})
function notify(text: string) {
  message.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    message.value = ''
  }, 2600)
}
async function initialize() {
  initialRequest?.abort()
  const controller = new AbortController()
  initialRequest = controller
  loading.value = true
  error.value = ''
  try {
    const data = await analyticsApi.options(controller.signal)
    if (controller.signal.aborted) return
    options.value = data
  } catch (err) {
    if (!controller.signal.aborted) {
      error.value = err instanceof Error ? err.message : '筛选条件加载失败'
      loading.value = false
    }
  }
}
watch([filters, revision], async ([query, refreshId], old, invalidate) => {
  if (!query) return
  const controller = new AbortController()
  invalidate(() => controller.abort())
  loading.value = true
  error.value = ''
  try {
    const data = await analyticsApi.overview(query, controller.signal)
    if (!controller.signal.aborted) {
      overview.value = data
      if (refreshId !== old[1] && refreshId > 0) notify('经营看板已刷新')
    }
  } catch (err) {
    if (!controller.signal.aborted)
      error.value = err instanceof Error ? err.message : '经营数据获取失败'
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
})
function refresh() {
  if (!filters.value) void initialize()
  else revision.value++
}
function exportReport() {
  if (!overview.value || !filters.value) return
  const { current, trend } = overview.value
  const headers = ['统计日期', '交易总额 (元)', '订单数', '下单人数', '客单价 (元)', '商品件数']
  downloadCsv('经营报表_' + filters.value.start + '_' + filters.value.end, headers, [
    ...trend.map((r) => [r.date, r.gmv, r.orders, r.buyers, r.basket, r.pieces]),
    ['区间合计', current.gmv, current.orders, current.buyers, current.basket, current.pieces],
  ])
  notify('已导出当前筛选范围的经营报表')
}
function openDay(date: string, previous = false) {
  if (!filters.value || loading.value) return
  const selected = filters.value
  let day = date
  if (previous) {
    const lengthMs = Date.parse(selected.end) - Date.parse(selected.start) + 86_400_000
    day = new Date(Date.parse(date) - lengthMs).toISOString().slice(0, 10)
  }
  if (session.can('details:view'))
    void router.push({ path: '/details', query: { ...selected, start: day, end: day } })
  else if (options.value && day >= options.value.availableRange.start)
    filters.value = { ...selected, start: day, end: day }
}
function openCategory(id: string) {
  if (!filters.value || loading.value) return
  const query = { ...filters.value, category: id }
  if (session.can('dimensions:view'))
    void router.push({ path: '/dimensions', query: { ...query, dimension: 'product' } })
  else filters.value = query
}
onMounted(initialize)
onBeforeUnmount(() => {
  initialRequest?.abort()
  clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="dashboard">
    <header class="dash-heading">
      <div>
        <h1>经营总览</h1>
        <p>聚合全渠道交易数据，掌握核心指标与销售趋势。</p>
      </div>
      <div class="dash-actions">
        <button type="button" class="dash-btn" :disabled="loading" @click="refresh">
          <RefreshCw :size="15" :class="{ 'dash-spinning': loading }" />刷新
        </button>
        <button
          type="button"
          class="dash-btn primary"
          :disabled="loading || !!error || !overview?.current.orders"
          @click="exportReport"
        >
          <Download :size="16" />导出报表
        </button>
      </div>
    </header>
    <DashboardFilters v-if="filters && options" v-model="filters" :options="options" />
    <div v-if="error" class="dash-panel dash-state" role="alert">
      <AlertCircle :size="30" />
      <h2>数据加载失败</h2>
      <p>{{ error }}</p>
      <button class="dash-btn" @click="refresh">重新加载</button>
    </div>
    <div v-else-if="loading && !overview" aria-busy="true" aria-label="正在加载经营数据">
      <div class="kpi-grid"><div v-for="i in 4" :key="i" class="dash-skeleton kpi-card"></div></div>
      <div class="dash-skeleton chart-placeholder"></div>
    </div>
    <template v-else-if="overview && filters">
      <div class="kpi-grid" :aria-busy="loading">
        <KpiCard
          v-for="card in cards"
          :key="card.key"
          :metric="card.key"
          :label="card.label"
          :series="card.series"
          :display="card.display"
          :change="card.change"
        />
      </div>
      <div v-if="overview.current.orders" class="dashboard-charts" :aria-busy="loading">
        <TrendPanel :points="overview.trend" @day="openDay" />
        <CategoryPanel
          :rows="overview.categories"
          :total="overview.current.gmv"
          @category="openCategory"
        />
      </div>
      <div v-else class="dash-panel dash-state">
        <Inbox :size="28" />
        <h2>当前筛选范围暂无交易</h2>
        <button v-if="options" class="dash-btn" @click="filters = { ...options.defaultRange }">
          恢复默认筛选
        </button>
      </div>
      <DailyTable
        :filters="filters"
        :revision="revision"
        :can-drill="session.can('details:view')"
        @day="openDay"
      />
    </template>
    <Transition name="dash-toast"
      ><output v-if="message" class="dash-notice" role="status">{{ message }}</output></Transition
    >
  </div>
</template>
