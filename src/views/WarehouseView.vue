<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Database, GitBranch, Layers3, ListFilter, Table2 } from 'lucide-vue-next'
import { warehouseApi } from '../api/warehouse'
import { displayCell, type DataRow, type Layer } from '../domain/warehouse'
import WarehouseGrid from '../components/warehouse/WarehouseGrid.vue'
import WarehouseDialog from '../components/warehouse/WarehouseDialog.vue'
import { useWarehouseQuery, useWarehouseResource } from '../composables/useWarehouseResource'
import '../styles/warehouse.css'

const {
  data: catalog,
  error: catalogError,
  refresh: loadCatalog,
} = useWarehouseResource(warehouseApi.catalog)
const { query, replace, page, resize, sort } = useWarehouseQuery()
const layer = ref<Layer>('ODS')
const tableId = ref('')
const tab = ref<'rows' | 'fields'>('rows')
const selected = ref<DataRow | null>(null)
const search = ref('')
const start = ref('')
const end = ref('')
const table = computed(() => catalog.value?.tables.find((item) => item.id === tableId.value))
const tables = computed(
  () => catalog.value?.tables.filter((item) => item.layer === layer.value) ?? [],
)
const {
  data: rows,
  loading,
  error,
  refresh,
} = useWarehouseResource((signal) =>
  table.value && tab.value === 'rows'
    ? warehouseApi.rows({ ...query.value, table: table.value.id }, signal)
    : null,
)

function apply() {
  const sortable = table.value?.fields.map((f) => f.key) ?? []
  const sortBy = ['calc_dt', 'zip_start_dt', 'dt', 'create_time'].find((key) =>
    sortable.includes(key),
  )
  replace({ search: search.value, start: start.value, end: end.value, sortBy, sortOrder: 'desc' })
}
function pickTable(id: string) {
  const next = catalog.value?.tables.find((t) => t.id === id)
  if (!next) return
  layer.value = next.layer
  tableId.value = id
  tab.value = 'rows'
  search.value = ''
  selected.value = null
  apply()
}
function pickLayer(next: Layer) {
  const first = catalog.value?.tables.find((item) => item.layer === next)
  if (first) pickTable(first.id)
}
watch(catalog, (value) => {
  if (!value) return
  start.value = value.range.defaultStart
  end.value = value.range.end
  pickLayer(layer.value)
})
</script>
<template>
  <section class="wh-view">
    <header class="page-head">
      <div>
        <h1>分层数据探查</h1>
        <p>浏览数仓分层、字段结构和数据血缘，核对各层的实际记录。</p>
      </div>
    </header>
    <div v-if="catalogError" class="panel wh-state" role="alert">
      {{ catalogError }}<button class="btn" @click="loadCatalog">重新加载目录</button>
    </div>
    <div v-else-if="!catalog" class="panel wh-state" role="status">正在读取数仓目录…</div>
    <template v-else>
      <div class="wh-layer-grid" aria-label="数仓分层">
        <button
          v-for="l in catalog.layers"
          :key="l.id"
          class="wh-layer-card"
          :class="{ active: layer === l.id }"
          :aria-pressed="layer === l.id"
          @click="pickLayer(l.id)"
        >
          <strong>{{ l.id }}</strong><span>{{ l.name }}</span
          ><small
            >{{ l.description }} ·
            {{ catalog.tables.filter((t) => t.layer === l.id).length }} 张表</small
          >
        </button>
      </div>
      <section v-if="table" class="panel">
        <header class="wh-panel-head">
          <div class="wh-table-select">
            <Database :size="17" />
            <h2>数据表</h2>
            <select
              aria-label="选择数据表"
              :value="tableId"
              @change="pickTable(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="t in tables" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <span class="wh-code-pill">{{ table.id }}</span>
        </header>
        <p class="wh-purpose">{{ table.description }}</p>
        <dl class="wh-specs">
          <div>
            <dt>业务粒度</dt>
            <dd>{{ table.grain }}</dd>
          </div>
          <div>
            <dt>分区策略</dt>
            <dd>{{ table.partition }}</dd>
          </div>
          <div>
            <dt>开放字段</dt>
            <dd>{{ table.fields.length }} 个</dd>
          </div>
        </dl>
        <div class="wh-lineage">
          <GitBranch :size="15" /><span>上游来源</span
          ><template v-for="u in table.upstream" :key="u"
            ><button v-if="catalog.tables.some((t) => t.id === u)" @click="pickTable(u)">
              {{ u }}</button
            ><code v-else class="wh-code-pill">{{ u }}</code></template
          >
        </div>
      </section>
      <div v-if="table" class="panel">
        <header class="wh-panel-head">
          <div class="wh-inline">
            <Layers3 :size="17" />
            <h2>表探查</h2>
          </div>
          <div class="wh-tabs">
            <button
              :class="{ active: tab === 'rows' }"
              :aria-pressed="tab === 'rows'"
              @click="tab = 'rows'"
            >
              数据预览</button
            ><button
              :class="{ active: tab === 'fields' }"
              :aria-pressed="tab === 'fields'"
              @click="tab = 'fields'"
            >
              字段结构
            </button>
          </div>
        </header>
        <form v-if="tab === 'rows'" class="wh-filter-form" @submit.prevent="apply">
          <label class="wh-search"
            >内容检索<input v-model.trim="search" placeholder="输入字段值或编号" type="search"
          /></label>
          <label>开始日期<input v-model="start" type="date" :max="end || undefined" /></label
          ><label>结束日期<input v-model="end" type="date" :min="start || undefined" /></label>
          <button class="btn wh-primary" type="submit"><ListFilter :size="15" />查询</button>
        </form>
        <div v-else class="wh-scroll">
          <table class="wh-table">
            <thead>
              <tr>
                <th>字段名称</th>
                <th>数据类型</th>
                <th>中文含义</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in table.fields" :key="f.key">
                <td>
                  <code>{{ f.key }}</code>
                </td>
                <td>
                  <code class="wh-code-pill">{{ f.type }}</code>
                </td>
                <td>{{ f.label }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <WarehouseGrid
        v-if="table && tab === 'rows'"
        :title="table.name"
        :result="rows"
        :loading="loading"
        :error="error"
        :filename="table.id"
        :sort-by="query.sortBy"
        :sort-order="query.sortOrder"
        :page-size="query.pageSize"
        inspect-label="查看"
        @refresh="refresh"
        @page="page"
        @resize="resize"
        @sort="sort"
        @inspect="selected = $event"
      />
      <div v-else-if="!table" class="panel wh-state"><Table2 /><span>该层暂无开放数据表</span></div>
      <WarehouseDialog v-if="selected && table" title="记录详情" @close="selected = null"
        ><dl class="wh-specs">
          <div v-for="field in table.fields" :key="field.key">
            <dt>{{ field.label }}</dt>
            <dd>{{ displayCell(field, selected[field.key]) }}</dd>
          </div>
        </dl></WarehouseDialog
      >
    </template>
  </section>
</template>
