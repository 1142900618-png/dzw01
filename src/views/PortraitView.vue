<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Layers,
  RefreshCw,
  Repeat2,
  Search,
  Tags,
  UsersRound,
  X,
} from 'lucide-vue-next'
import { analyticsApi } from '@/api/analytics'
import { portraitApi } from '@/api/portrait'
import { useLatestResult } from '@/composables/useLatestResult'
import type { AnalyticsOptions } from '@/domain/analytics'
import type { PortraitCohort, PortraitQuery, Shopper, ShopperTags } from '@/domain/portrait'
import { downloadCsv } from '@/lib/csv'
import '@/styles/insights.css'

const {
  data: catalog,
  pending: catalogBusy,
  error: catalogError,
  run: getCatalog,
} = useLatestResult<AnalyticsOptions>()
const { data, pending, error, run: getCohort, cancel } = useLatestResult<PortraitCohort>()
const {
  data: tags,
  error: tagError,
  pending: tagBusy,
  run: getTags,
  cancel: cancelTags,
} = useLatestResult<ShopperTags>()
const filters = reactive<PortraitQuery>({
  asOf: '',
  days: 30,
  group: 'all',
  region: '',
  search: '',
  page: 1,
  pageSize: 10,
})
const searchText = ref('')
const invalid = ref('')
const activeId = ref('')
const dialog = ref<HTMLDialogElement>()
const groups = [
  { id: 'all', name: '全部人群' },
  { id: 'once', name: '单次下单' },
  { id: 'repeat', name: '多次下单' },
] as const
const windows = [30, 60, 90] as const
const colors = ['#3569f0', '#16a99f', '#9274dc', '#e6a344', '#6686bd', '#55b881']
const num = new Intl.NumberFormat('zh-CN')
const price = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.people / data.value.pageSize)) : 1,
)
const minAnchor = computed(() => {
  if (!catalog.value) return ''
  const from = new Date(catalog.value.availableRange.start + 'T00:00:00Z')
  from.setUTCDate(from.getUTCDate() + filters.days - 1)
  return from.toISOString().slice(0, 10)
})
const metricCards = computed(() => {
  const c = data.value
  if (!c) return []
  return [
    { title: '下单用户', value: num.format(c.people), unit: '人', icon: UsersRound, color: 'blue' },
    {
      title: '多次下单用户',
      value: num.format(c.repeatPeople),
      unit: '人',
      icon: Repeat2,
      color: 'teal',
    },
    {
      title: '多次下单占比',
      value: (c.people ? (c.repeatPeople / c.people) * 100 : 0).toFixed(1),
      unit: '%',
      icon: Layers,
      color: 'violet',
    },
    {
      title: '户均下单金额',
      value: price.format(c.average),
      unit: '元',
      icon: Coins,
      color: 'amber',
    },
  ]
})
const regionName = (id: string) => catalog.value?.regions.find((v) => v.id === id)?.name ?? id
const categoryName = (id: string) => catalog.value?.categories.find((v) => v.id === id)?.name ?? id
function closeTags() {
  dialog.value?.close()
}
async function load(reset = true) {
  closeTags()
  if (reset) filters.page = 1
  filters.search = searchText.value.trim()
  if (
    !filters.asOf ||
    filters.asOf < minAnchor.value ||
    filters.asOf > (catalog.value?.availableRange.end ?? '')
  ) {
    invalid.value = '请选择可完整覆盖当前统计窗口的分区日期。'
    cancel()
    return
  }
  invalid.value = ''
  await getCohort((signal) => portraitApi.cohort({ ...filters }, signal))
  if (data.value) filters.page = data.value.page
}
async function init() {
  await getCatalog((signal) => analyticsApi.options(signal))
  if (!catalog.value) return
  filters.asOf = catalog.value.defaultRange.end
  await load()
}
onMounted(init)
function move(to: number) {
  filters.page = to
  void load(false)
}
function windowChange() {
  if (filters.asOf < minAnchor.value) filters.asOf = minAnchor.value
  void load()
}
function reset() {
  Object.assign(filters, {
    asOf: catalog.value?.defaultRange.end ?? '',
    days: 30,
    group: 'all',
    region: '',
    page: 1,
  })
  searchText.value = ''
  void load()
}
async function tagRequest() {
  await getTags((signal) =>
    portraitApi.tags({ id: activeId.value, asOf: filters.asOf, days: filters.days }, signal),
  )
}
async function showTags(row: Shopper) {
  activeId.value = row.id
  await nextTick()
  dialog.value?.showModal()
  await tagRequest()
}
function exportPage() {
  if (!data.value) return
  downloadCsv(
    '用户画像_' + filters.asOf + '_第' + data.value.page + '页.csv',
    ['用户 ID', '下单次数', '下单金额（元）', '窗口末单日期', '常用地域', '偏好品类'],
    data.value.rows.map((row) => [
      row.id,
      row.orders,
      row.amount,
      row.lastOrder,
      regionName(row.region),
      categoryName(row.category),
    ]),
  )
}
function onTagsClosed() {
  cancelTags()
  activeId.value = ''
}
</script>
<template>
  <section class="insights-page">
    <header class="page-head insights-head">
      <div>
        <h1>用户画像</h1>
        <p>以会员为单位分析下单频次、消费金额与购物偏好。</p>
      </div>
      <div class="insights-actions">
        <button
          class="btn"
          :disabled="pending || catalogBusy"
          @click="catalog ? load(false) : init()"
        >
          <RefreshCw :size="16" />刷新
        </button>
        <button class="btn" :disabled="!data?.rows.length || pending" @click="exportPage">
          <Download :size="16" />导出本页
        </button>
      </div>
    </header>
    <div v-if="catalogError" class="panel insights-state" role="alert">
      {{ catalogError }} <button class="btn" @click="init">重试</button>
    </div>
    <div v-else-if="!catalog" class="panel insights-state" role="status">正在加载标签目录…</div>
    <template v-else>
      <form class="panel insight-filter" @submit.prevent="load()">
        <label
          >分区日期<input
            v-model="filters.asOf"
            required
            type="date"
            :min="minAnchor"
            :max="catalog.availableRange.end"
            @change="load()"
        /></label>
        <label
          >统计窗口<select v-model.number="filters.days" @change="windowChange">
            <option v-for="d in windows" :key="d" :value="d">近 {{ d }} 天</option>
          </select></label
        >
        <label
          >下单频次<select v-model="filters.group" @change="load()">
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select></label
        >
        <label
          >常用地域<select v-model="filters.region" @change="load()">
            <option value="">全部地域</option>
            <option v-for="v in catalog.regions" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select></label
        >
        <label class="portrait-search"
          >用户 ID<input
            v-model="searchText"
            placeholder="搜索会员标识"
            type="search"
            @search="load()"
        /></label>
        <button class="btn" type="submit"><Search :size="15" />查询</button>
      </form>
      <div v-if="invalid || error" class="panel insights-state" role="alert">
        {{ invalid || error }} <button v-if="error" class="btn" @click="load()">重试</button>
      </div>
      <div v-else-if="pending" class="panel insights-state" role="status">正在汇总画像标签…</div>
      <template v-else-if="data">
        <div class="portrait-kpis">
          <article v-for="c in metricCards" :key="c.title" class="panel portrait-kpi">
            <div>
              <i :class="'tone-' + c.color"><component :is="c.icon" :size="18" /></i
              ><span>{{ c.title }}</span>
            </div>
            <strong
              >{{ c.value }}<small>{{ c.unit }}</small></strong
            >
          </article>
        </div>
        <div v-if="!data.people" class="panel insights-state">
          当前人群条件下没有下单用户。<button class="btn" @click="reset">重置筛选</button>
        </div>
        <template v-else>
          <article class="panel insight-card">
            <div class="insight-card-head">
              <div>
                <h2>人群品类偏好</h2>
                <p>每位用户按购买明细出现次数最多的一级品类归类，同频时按品类 ID 排序。</p>
              </div>
              <span class="scope-chip">近 {{ filters.days }} 天</span>
            </div>
            <div class="preference-bars">
              <div v-for="(cat, i) in data.categories" :key="cat.id">
                <div>
                  <span>{{ cat.name }}</span><strong
                    >{{ num.format(cat.people) }} 人
                    <small>{{ ((cat.people / data.people) * 100).toFixed(1) }}%</small></strong
                  >
                </div>
                <span class="preference-track"
                  ><i
                    :style="{
                      background: colors[i % colors.length],
                      width: (cat.people / data.people) * 100 + '%',
                    }"
                  ></i
                ></span>
              </div>
            </div>
          </article>
          <article class="panel insight-table-panel">
            <div class="insight-card-head">
              <div>
                <h2>用户标签明细</h2>
                <p>{{ data.start }} 至 {{ data.end }} · 按下单金额降序</p>
              </div>
              <span class="scope-chip">{{ num.format(data.people) }} 位用户</span>
            </div>
            <div class="table-wrap">
              <table class="data-table insight-table">
                <thead>
                  <tr>
                    <th>用户 ID</th>
                    <th>下单频次</th>
                    <th>下单金额（元）</th>
                    <th>末单日期</th>
                    <th>常用地域</th>
                    <th>偏好品类</th>
                    <th>标签</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in data.rows" :key="row.id">
                    <td class="portrait-id">{{ row.id }}</td>
                    <td>{{ num.format(row.orders) }} 次</td>
                    <td>{{ price.format(row.amount) }}</td>
                    <td>{{ row.lastOrder }}</td>
                    <td>{{ regionName(row.region) }}</td>
                    <td>{{ categoryName(row.category) }}</td>
                    <td>
                      <button class="insight-link" @click="showTags(row)">
                        <Tags :size="14" />查看标签
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="insight-pagination">
              <label
                >每页<select v-model.number="filters.pageSize" @change="load()">
                  <option v-for="n in [10, 25, 50]" :key="n" :value="n">{{ n }} 条</option>
                </select></label
              >
              <div>
                <button
                  class="btn"
                  aria-label="上一页"
                  :disabled="data.page <= 1"
                  @click="move(data.page - 1)"
                >
                  <ChevronLeft :size="16" /></button
                ><span>{{ data.page }} / {{ pageCount }}</span
                ><button
                  class="btn"
                  aria-label="下一页"
                  :disabled="data.page >= pageCount"
                  @click="move(data.page + 1)"
                >
                  <ChevronRight :size="16" />
                </button>
              </div>
            </div>
          </article>
        </template>
      </template>
    </template>
    <dialog
      ref="dialog"
      class="portrait-dialog"
      aria-labelledby="portrait-title"
      @close="onTagsClosed"
    >
      <div class="insight-card-head">
        <div>
          <h2 id="portrait-title">用户标签 · {{ activeId }}</h2>
          <p v-if="tags">{{ tags.start }} 至 {{ tags.end }} · 计算分区 {{ tags.dt }}</p>
        </div>
        <button class="btn" aria-label="关闭用户标签" autofocus @click="closeTags">
          <X :size="16" />
        </button>
      </div>
      <p v-if="tagBusy" role="status">正在读取标签…</p>
      <p v-else-if="tagError" role="alert">
        {{ tagError }} <button class="btn" @click="tagRequest">重试</button>
      </p>
      <div v-else-if="tags" class="table-wrap">
        <table class="data-table insight-table">
          <thead>
            <tr>
              <th>标签名</th>
              <th>标签值</th>
              <th>数据来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tags.tags" :key="t.field">
              <td>
                {{ t.label }}<small class="portrait-field">{{ t.field }}</small>
              </td>
              <td>
                {{ typeof t.value === 'number' ? num.format(t.value) : t.value }} {{ t.unit }}
              </td>
              <td class="portrait-source">{{ t.source }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </dialog>
  </section>
</template>
