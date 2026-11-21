<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { History, ListFilter, RotateCcw, Search } from 'lucide-vue-next'
import { useRoute, RouterLink } from 'vue-router'
import { warehouseApi } from '../api/warehouse'
import { displayCell, statusNames, type GridQuery } from '../domain/warehouse'
import { useWarehouseQuery, useWarehouseResource } from '../composables/useWarehouseResource'
import WarehouseGrid from '../components/warehouse/WarehouseGrid.vue'
import WarehouseDialog from '../components/warehouse/WarehouseDialog.vue'
import { useSessionStore } from '../stores/session'
import '../styles/warehouse.css'

const route = useRoute()
const session = useSessionStore()
const {
  data: catalog,
  error: catalogError,
  refresh: loadCatalog,
} = useWarehouseResource(warehouseApi.catalog)
const { query, replace, page, resize, sort } = useWarehouseQuery()
const draft = reactive({
  search: '',
  start: '',
  end: '',
  channel: '',
  region: '',
  category: '',
  product: '',
  status: '',
})
const selected = ref('')
const initialized = ref(false)
const {
  data: result,
  loading,
  error,
  refresh,
} = useWarehouseResource((signal) =>
  initialized.value ? warehouseApi.orders(query.value, signal) : null,
)
const {
  data: detail,
  loading: detailLoading,
  error: detailError,
  refresh: retryDetail,
} = useWarehouseResource((signal) =>
  selected.value ? warehouseApi.order(selected.value, signal) : null,
)
function apply() {
  replace({ ...draft, sortBy: 'create_time', sortOrder: 'desc' } satisfies Omit<
    GridQuery,
    'page' | 'pageSize'
  >)
  selected.value = ''
}
function initialize(fromRoute: boolean) {
  if (!catalog.value) return
  const param = (key: string) =>
    fromRoute && typeof route.query[key] === 'string' ? String(route.query[key]) : ''
  const id = param('orderId')
  Object.assign(draft, {
    search: id || param('search'),
    start: param('start') || (id ? '' : catalog.value.range.defaultStart),
    end: param('end') || (id ? '' : catalog.value.range.end),
    channel: param('channel'),
    region: param('region'),
    category: param('category'),
    product: param('product'),
    status: param('status'),
  })
  initialized.value = true
  apply()
}
watch([catalog, () => route.query], () => initialize(true), { immediate: true })
</script>
<template>
  <section class="wh-view">
    <header class="page-head">
      <div>
        <h1>明细查询</h1>
        <p>按时间和业务维度检索订单，查看商品行并追踪状态变更。</p>
      </div>
    </header>
    <div v-if="catalogError" class="panel wh-state" role="alert">
      {{ catalogError }}<button class="btn" @click="loadCatalog">重新加载</button>
    </div>
    <div v-else-if="!catalog" class="panel wh-state" role="status">正在读取筛选项…</div>
    <template v-else>
      <section class="panel">
        <header class="wh-panel-head">
          <div class="wh-inline">
            <ListFilter :size="17" />
            <h2>订单筛选</h2>
          </div>
        </header>
        <form class="wh-filter-form" @submit.prevent="apply">
          <label class="wh-search"
            >订单或会员编号<span class="wh-search-wrap"
              ><Search :size="15" /><input
                v-model.trim="draft.search"
                type="search"
                placeholder="输入编号检索" /></span
          ></label>
          <label
            >开始日期<input
              v-model="draft.start"
              type="date"
              :max="draft.end || undefined" /></label
          ><label
            >结束日期<input v-model="draft.end" type="date" :min="draft.start || undefined"
          /></label>
          <label
            >渠道<select v-model="draft.channel">
              <option value="">全部渠道</option>
              <option v-for="o in catalog.options.channels" :key="o.id" :value="o.id">
                {{ o.name }}
              </option>
            </select></label
          >
          <label
            >地区<select v-model="draft.region">
              <option value="">全部地区</option>
              <option v-for="o in catalog.options.regions" :key="o.id" :value="o.id">
                {{ o.name }}
              </option>
            </select></label
          >
          <label
            >品类<select v-model="draft.category" @change="draft.product = ''">
              <option value="">全部品类</option>
              <option v-for="o in catalog.options.categories" :key="o.id" :value="o.id">
                {{ o.name }}
              </option>
            </select></label
          >
          <label
            >商品<select v-model="draft.product">
              <option value="">全部商品</option>
              <option
                v-for="o in catalog.options.products.filter(
                  (p) => !draft.category || !p.category || p.category === draft.category,
                )"
                :key="o.id"
                :value="o.id"
              >
                {{ o.name }}
              </option>
            </select></label
          >
          <label
            >订单状态<select v-model="draft.status">
              <option value="">全部状态</option>
              <option v-for="(name, key) in statusNames" :key="key" :value="key">{{ name }}</option>
            </select></label
          >
          <div class="wh-actions">
            <button type="submit" class="btn wh-primary"><Search :size="15" />查询</button
            ><button type="button" class="btn" @click="initialize(false)">
              <RotateCcw :size="14" />重置
            </button>
          </div>
        </form>
      </section>
      <WarehouseGrid
        title="订单明细"
        filename="订单明细"
        :result="result"
        :error="error"
        :loading="loading"
        :sort-by="query.sortBy"
        :sort-order="query.sortOrder"
        :page-size="query.pageSize"
        inspect-label="详情"
        @sort="sort"
        @refresh="refresh"
        @page="page"
        @resize="resize"
        @inspect="selected = String($event.sn)"
      />
    </template>
    <WarehouseDialog v-if="selected" title="订单详情" @close="selected = ''">
      <div v-if="detailLoading" class="wh-state" role="status">正在读取订单…</div>
      <div v-else-if="detailError" class="wh-state" role="alert">
        {{ detailError }}<button class="btn" @click="retryDetail">重试</button>
      </div>
      <template v-else-if="detail">
        <dl class="wh-specs">
          <div v-for="f in detail.fields" :key="f.key">
            <dt>{{ f.label }}</dt>
            <dd>{{ displayCell(f, detail.row[f.key]) }}</dd>
          </div>
        </dl>
        <h3 class="wh-subhead">整单商品</h3>
        <div class="wh-scroll">
          <table class="wh-table">
            <thead>
              <tr>
                <th v-for="f in detail.itemFields" :key="f.key">{{ f.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in detail.items" :key="i">
                <td v-for="f in detail.itemFields" :key="f.key">
                  {{ displayCell(f, item[f.key]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="session.can('changes:view')" class="wh-dialog-foot">
          <RouterLink class="btn" :to="{ path: '/changes', query: { orderId: selected } }"
            ><History :size="16" />追踪此订单</RouterLink
          >
        </div>
      </template>
    </WarehouseDialog>
  </section>
</template>
