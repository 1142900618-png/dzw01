<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Download,
  Filter,
  MapPin,
  RefreshCw,
  RotateCcw,
  Store,
} from 'lucide-vue-next'
import type { EChartsOption } from 'echarts'
import ChartView from '@/components/ChartView.vue'
import { analyticsApi } from '@/api/analytics'
import type {
  AnalyticsFilters,
  AnalyticsOptions,
  BreakdownRow,
  Dimension,
  Metrics,
} from '@/domain/analytics'
import { useLatestResult } from '@/composables/useLatestResult'
import { downloadCsv } from '@/lib/csv'
import { useSessionStore } from '@/stores/session'
import '@/styles/insights.css'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const {
  data: catalog,
  error: catalogError,
  pending: catalogBusy,
  run: readCatalog,
} = useLatestResult<AnalyticsOptions>()
const { data: result, error, pending, run: readResult, cancel } = useLatestResult<BreakdownRow[]>()
const filters = reactive<AnalyticsFilters>({ start: '', end: '' })
const dateError = ref('')
const dimension = ref<Dimension>('category')
const metrics = [
  { key: 'gmv', name: '成交总额', unit: '元' },
  { key: 'orders', name: '订单数', unit: '单' },
  { key: 'buyers', name: '下单人数', unit: '人' },
  { key: 'basket', name: '客单价', unit: '元' },
  { key: 'pieces', name: '商品件数', unit: '件' },
] as const
const dimensions = [
  { key: 'category', label: '商品品类', icon: Boxes },
  { key: 'channel', label: '销售渠道', icon: Store },
  { key: 'region', label: '销售地域', icon: MapPin },
  { key: 'product', label: '商品 SKU', icon: BarChart3 },
] as const
const metric = ref<keyof Metrics>('gmv')
const focusId = ref('')
const compareId = ref('')
const canDrill = computed(() => dimension.value !== 'product' || session.can('details:view'))
const colors = ['#3569f0', '#0faca3', '#8b70dd', '#edac48', '#7499e8', '#66b889']
const nfmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const moneyfmt = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const activeMetric = computed(() => metrics.find((m) => m.key === metric.value)!)
const activeDimension = computed(() => dimensions.find((d) => d.key === dimension.value)!)
const rows = computed(() =>
  [...(result.value ?? [])].sort(
    (a, b) => b[metric.value] - a[metric.value] || a.id.localeCompare(b.id),
  ),
)
const ranked = computed(() => rows.value.slice(0, 8))
const compared = computed(() => {
  const lead = rows.value.find((r) => r.id === focusId.value) ?? rows.value[0]
  const peer =
    rows.value.find((r) => r.id === compareId.value && r.id !== lead?.id) ??
    rows.value.find((r) => r.id !== lead?.id)
  return [lead, peer].filter((r): r is BreakdownRow => !!r)
})
const scopeLabels = computed(() => {
  const c = catalog.value
  if (!c) return []
  return [
    { label: '品类', name: c.categories.find((v) => v.id === filters.category)?.name },
    { label: '渠道', name: c.channels.find((v) => v.id === filters.channel)?.name },
    { label: '地域', name: c.regions.find((v) => v.id === filters.region)?.name },
    { label: '商品', name: c.products.find((v) => v.id === filters.product)?.name },
  ].filter((s) => s.name)
})
function queryString(key: string) {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}
function hydrate() {
  const c = catalog.value
  if (!c) return
  Object.assign(filters, {
    start: queryString('start') || c.defaultRange.start,
    end: queryString('end') || c.defaultRange.end,
    category: queryString('category'),
    product: queryString('product'),
    channel: queryString('channel'),
    region: queryString('region'),
  })
  const d = queryString('dimension')
  dimension.value =
    dimensions.find((v) => v.key === d)?.key ??
    (filters.category || filters.product ? 'product' : 'category')
  void reload()
}
async function loadCatalog() {
  await readCatalog((signal) => analyticsApi.options(signal))
  if (catalog.value) hydrate()
}
onMounted(loadCatalog)
watch(() => route.fullPath, hydrate)
function reload() {
  if (!filters.start || !filters.end || filters.start > filters.end) {
    cancel()
    dateError.value = '请选择有效的起止日期，结束日期须晚于或等于开始日期。'
    return
  }
  dateError.value = ''
  const payload: AnalyticsFilters = { start: filters.start, end: filters.end }
  for (const key of ['category', 'channel', 'region', 'product'] as const) {
    if (filters[key]) payload[key] = filters[key]
  }
  focusId.value = ''
  compareId.value = ''
  return readResult((signal) => analyticsApi.breakdown(payload, dimension.value, signal))
}
function navigate(next: Dimension = dimension.value, selection: Partial<AnalyticsFilters> = {}) {
  if (!filters.start || !filters.end || filters.start > filters.end) {
    void reload()
    return
  }
  const query = Object.fromEntries(
    Object.entries({ ...filters, ...selection, dimension: next }).filter(([, v]) => v),
  )
  if (router.resolve({ path: '/dimensions', query }).fullPath === route.fullPath) {
    void reload()
    return
  }
  void router.push({ path: '/dimensions', query })
}
function reset() {
  void router.push({ path: '/dimensions' })
  if (!Object.keys(route.query).length) hydrate()
}
function drill(row: BreakdownRow) {
  if (!canDrill.value) return
  if (dimension.value === 'product') {
    const query = Object.fromEntries(
      Object.entries({ ...filters, product: row.id }).filter(([, v]) => v),
    )
    void router.push({ path: '/details', query })
  } else navigate('product', { [dimension.value]: row.id, product: '' })
}
function exportRows() {
  downloadCsv(
    '维度分析_' + filters.start + '_' + filters.end + '.csv',
    [
      activeDimension.value.label,
      ...metrics.map((m) => m.name + '（' + m.unit + '）'),
      '销售占比（%）',
    ],
    rows.value.map((row) => [row.name, ...metrics.map((m) => row[m.key]), row.share]),
  )
}
function barClick(event: { dataIndex: number }) {
  const row = ranked.value[event.dataIndex]
  if (row) drill(row)
}
function display(value: number, key: keyof Metrics) {
  return key === 'gmv' || key === 'basket' ? moneyfmt.format(value) : nfmt.format(value)
}
const barOption = computed<EChartsOption>(() => ({
  aria: { enabled: true },
  animationDuration: 240,
  grid: { left: 8, right: 80, top: 8, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'shadow' } },
  xAxis: {
    type: 'value',
    axisLabel: {
      color: '#8592a6',
      formatter: (v: number) => (v >= 10000 ? nfmt.format(v / 10000) + '万' : nfmt.format(v)),
    },
    splitLine: { lineStyle: { color: 'rgba(133,146,166,.2)', type: 'dashed' } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: ranked.value.map((r) => r.name),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8190a4', width: 94, overflow: 'truncate' },
  },
  series: [
    {
      type: 'bar',
      name: activeMetric.value.name,
      barMaxWidth: 17,
      itemStyle: { borderRadius: [0, 5, 5, 0] },
      label: {
        show: true,
        position: 'right',
        color: '#8290a3',
        formatter: (p) => nfmt.format(Number(p.value)),
      },
      data: ranked.value.map((row, i) => ({
        value: row[metric.value],
        itemStyle: { color: i === 0 ? colors[0] : '#8aaafa' },
      })),
    },
  ],
}))
const radarOption = computed<EChartsOption>(() => {
  const maxima = metrics.map((m) => Math.max(0, ...rows.value.map((row) => row[m.key])))
  return {
    aria: { enabled: true },
    animationDuration: 240,
    color: [colors[0]!, colors[1]!],
    tooltip: { trigger: 'item', renderMode: 'richText' },
    radar: {
      center: ['50%', '51%'],
      radius: '64%',
      splitNumber: 4,
      axisName: { color: '#8290a3', fontSize: 12 },
      splitArea: { areaStyle: { color: ['rgba(115,144,185,.025)', 'rgba(115,144,185,.07)'] } },
      splitLine: { lineStyle: { color: 'rgba(133,146,166,.22)' } },
      axisLine: { lineStyle: { color: 'rgba(133,146,166,.22)' } },
      indicator: metrics.map((m) => ({ name: m.name, max: 100 })),
    },
    series: [
      {
        type: 'radar',
        symbolSize: 4,
        areaStyle: { opacity: 0.12 },
        data: compared.value.map((row) => ({
          name: row.name,
          value: metrics.map((m, i) =>
            maxima[i] ? Number(((row[m.key] / maxima[i]!) * 100).toFixed(1)) : 0,
          ),
        })),
      },
    ],
  }
})
</script>

<template>
  <section class="insights-page">
    <header class="page-head insights-head">
      <div>
        <h1>维度分析</h1>
        <p>按品类、渠道与地域对比销售表现，下钻查看商品明细。</p>
      </div>
      <div class="insights-actions">
        <button
          class="btn"
          :disabled="pending || catalogBusy"
          @click="catalog ? reload() : loadCatalog()"
        >
          <RefreshCw :size="16" />刷新</button
        ><button class="btn" :disabled="!rows.length || pending" @click="exportRows">
          <Download :size="16" />导出明细
        </button>
      </div>
    </header>
    <div v-if="catalogError" class="panel insights-state" role="alert">
      {{ catalogError }} <button class="btn" @click="loadCatalog">重试</button>
    </div>
    <div v-else-if="!catalog" class="panel insights-state" role="status">正在加载分析维度…</div>
    <template v-else>
      <form class="panel insight-filter" @submit.prevent="navigate()">
        <label
          >开始日期<input
            v-model="filters.start"
            type="date"
            required
            :min="catalog.availableRange.start"
            :max="catalog.availableRange.end"
            @change="navigate()"
        /></label>
        <label
          >结束日期<input
            v-model="filters.end"
            type="date"
            required
            :min="catalog.availableRange.start"
            :max="catalog.availableRange.end"
            @change="navigate()"
        /></label>
        <label
          >商品品类<select
            v-model="filters.category"
            @change="navigate(dimension, { product: '' })"
          >
            <option value="">全部品类</option>
            <option v-for="v in catalog.categories" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select></label
        >
        <label
          >销售渠道<select v-model="filters.channel" @change="navigate()">
            <option value="">全部渠道</option>
            <option v-for="v in catalog.channels" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select></label
        >
        <label
          >销售地域<select v-model="filters.region" @change="navigate()">
            <option value="">全部地域</option>
            <option v-for="v in catalog.regions" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select></label
        >
        <button class="btn" type="button" @click="reset"><RotateCcw :size="15" />重置</button>
      </form>
      <div class="insights-tools">
        <div class="insights-tabs" aria-label="分析维度">
          <button
            v-for="d in dimensions"
            :key="d.key"
            :class="{ chosen: d.key === dimension }"
            :aria-pressed="d.key === dimension"
            @click="navigate(d.key)"
          >
            <component :is="d.icon" :size="16" />{{ d.label }}
          </button>
        </div>
        <label class="insights-inline"
          ><Filter :size="15" />排行指标<select v-model="metric">
            <option v-for="m in metrics" :key="m.key" :value="m.key">{{ m.name }}</option>
          </select></label
        >
      </div>
      <div v-if="scopeLabels.length" class="insights-scope">
        <span>当前范围</span
        ><span v-for="s in scopeLabels" :key="s.label" class="scope-chip"
          >{{ s.label }} · {{ s.name }}</span
        >
      </div>
      <div v-if="dateError || error" class="panel insights-state" role="alert">
        {{ dateError || error }} <button v-if="error" class="btn" @click="reload">重试</button>
      </div>
      <div v-else-if="pending" class="panel insights-state" role="status">正在计算维度指标…</div>
      <div v-else-if="!rows.length" class="panel insights-state">
        当前筛选范围内暂无订单。<button class="btn" @click="reset">重置筛选</button>
      </div>
      <template v-else>
        <div class="insights-grid">
          <article class="panel insight-card">
            <div class="insight-card-head">
              <div>
                <h2>{{ activeDimension.label }}排行</h2>
                <p>按{{ activeMetric.name }}降序 · 单位{{ activeMetric.unit }}</p>
              </div>
              <span class="scope-chip">前 {{ ranked.length }} 项</span>
            </div>
            <div class="insight-chart">
              <ChartView
                :option="barOption"
                :aria-label="activeDimension.label + '排行，详细数据见下方明细表'"
                @chart-click="barClick"
              />
            </div>
          </article>
          <article class="panel insight-card">
            <div class="insight-card-head">
              <div>
                <h2>指标对比</h2>
                <p>各指标以当前维度最大值为 100</p>
              </div>
            </div>
            <div class="radar-selects">
              <label
                ><i :style="{ background: colors[0] }"></i
                ><select
                  :value="compared[0]?.id"
                  aria-label="第一对比项"
                  @change="focusId = ($event.target as HTMLSelectElement).value"
                >
                  <option v-for="r in rows" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select></label
              >
              <label v-if="rows.length > 1"
                ><i :style="{ background: colors[1] }"></i
                ><select
                  :value="compared[1]?.id"
                  aria-label="第二对比项"
                  @change="compareId = ($event.target as HTMLSelectElement).value"
                >
                  <option
                    v-for="r in rows.filter((r) => r.id !== compared[0]?.id)"
                    :key="r.id"
                    :value="r.id"
                  >
                    {{ r.name }}
                  </option>
                </select></label
              >
            </div>
            <div class="insight-radar">
              <ChartView :option="radarOption" aria-label="五项指标归一化雷达图" />
            </div>
          </article>
        </div>
        <article class="panel insight-table-panel">
          <div class="insight-card-head">
            <div>
              <h2>维度明细</h2>
              <p>共 {{ rows.length }} 项 · 按{{ activeMetric.name }}排列</p>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table insight-table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>{{ activeDimension.label }}</th>
                  <th v-for="m in metrics" :key="m.key">
                    <button :class="{ sorted: metric === m.key }" @click="metric = m.key">
                      {{ m.name }}{{ metric === m.key ? ' ↓' : '' }}
                    </button>
                  </th>
                  <th>销售占比</th>
                  <th v-if="canDrill">下钻</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in rows" :key="r.id">
                  <td>
                    <span class="insight-rank" :class="{ first: i === 0 }">{{ i + 1 }}</span>
                  </td>
                  <td>{{ r.name }}</td>
                  <td v-for="m in metrics" :key="m.key">{{ display(r[m.key], m.key) }}</td>
                  <td>{{ nfmt.format(r.share) }}%</td>
                  <td v-if="canDrill">
                    <button class="insight-link" @click="drill(r)">
                      {{ dimension === 'product' ? '订单明细' : '查看商品'
                      }}<ChevronRight :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </template>
    </template>
  </section>
</template>
