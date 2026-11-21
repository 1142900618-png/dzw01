<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  CalendarClock,
  Database,
  GitPullRequest,
  History,
  ListFilter,
  Rows3,
  Search,
} from 'lucide-vue-next'
import { RouterLink, useRoute } from 'vue-router'
import { warehouseApi } from '@/api/warehouse'
import WarehouseDialog from '@/components/warehouse/WarehouseDialog.vue'
import WarehouseGrid from '@/components/warehouse/WarehouseGrid.vue'
import { useWarehouseQuery, useWarehouseResource } from '@/composables/useWarehouseResource'
import { displayCell, operationNames, type DataRow } from '@/domain/warehouse'
import { useSessionStore } from '@/stores/session'
import '@/styles/warehouse.css'

type Mode = 'events' | 'versions' | 'snapshot'
const modes = [
  { id: 'events', name: 'CDC 事件流', icon: GitPullRequest },
  { id: 'versions', name: '拉链版本', icon: History },
  { id: 'snapshot', name: '日末快照', icon: CalendarClock },
] as const
const route = useRoute()
const session = useSessionStore()
const mode = ref<Mode>('events')
const modeName = computed(() => modes.find((option) => option.id === mode.value)!.name)
const selected = ref<DataRow | null>(null)
const draft = reactive({ orderId: '', start: '', end: '', operation: '', asOf: '' })
const {
  data: catalog,
  error: catalogError,
  refresh: loadCatalog,
} = useWarehouseResource(warehouseApi.catalog)
const { query, replace, page, resize, sort } = useWarehouseQuery()
const ready = ref(false)
const {
  data: result,
  error,
  loading,
  refresh,
} = useWarehouseResource((signal) => {
  if (!ready.value) return null
  const fetch = mode.value === 'events' ? warehouseApi.changes : warehouseApi.versions
  return fetch(query.value, signal)
})

function apply() {
  const time =
    mode.value === 'snapshot' ? { asOf: draft.asOf } : { start: draft.start, end: draft.end }
  replace({
    orderId: draft.orderId,
    ...time,
    operation: mode.value === 'events' ? draft.operation : undefined,
    sortBy: mode.value === 'events' ? 'event_at' : 'zip_start_dt',
    sortOrder: 'desc',
  })
  selected.value = null
}
function chooseMode(value: Mode) {
  mode.value = value
  apply()
}
function reset(fromLink = false) {
  if (!catalog.value) return
  draft.orderId = fromLink && typeof route.query.orderId === 'string' ? route.query.orderId : ''
  draft.start = draft.orderId ? '' : catalog.value.range.defaultStart
  draft.end = draft.orderId ? '' : catalog.value.range.end
  draft.asOf = catalog.value.range.end
  draft.operation = ''
  ready.value = true
  apply()
}
function inspectTimeline(row: DataRow) {
  draft.orderId = String(row.sn)
  draft.start = ''
  draft.end = ''
  draft.operation = ''
  chooseMode(mode.value === 'events' ? 'versions' : 'events')
}
watch([catalog, () => route.query.orderId], () => reset(true), { immediate: true })
</script>

<template>
  <section class="wh-view">
    <header class="page-head">
      <div>
        <h1>变更追踪</h1>
        <p>查看订单变更前后的状态，按业务日还原有效版本。</p>
      </div>
    </header>
    <div v-if="catalogError" class="panel wh-state" role="alert">
      {{ catalogError }}<button class="btn" @click="loadCatalog">重新加载</button>
    </div>
    <div v-else-if="!catalog" class="panel wh-state" role="status">正在读取追踪配置…</div>
    <template v-else>
      <section class="panel">
        <header class="wh-panel-head">
          <div class="wh-inline">
            <ListFilter :size="17" />
            <h2>追踪条件</h2>
          </div>
          <div class="wh-tabs" aria-label="追踪视图">
            <button
              v-for="item in modes"
              :key="item.id"
              :class="{ active: item.id === mode }"
              :aria-pressed="item.id === mode"
              @click="chooseMode(item.id)"
            >
              <component :is="item.icon" :size="14" />{{ item.name }}
            </button>
          </div>
        </header>
        <form class="wh-filter-form" @submit.prevent="apply">
          <label class="wh-search"
            >订单编号<span class="wh-search-wrap"
              ><Search :size="15" /><input
                v-model.trim="draft.orderId"
                type="search"
                placeholder="输入完整订单编号" /></span
          ></label>
          <label v-if="mode === 'snapshot'"
            >快照日期<input
              v-model="draft.asOf"
              type="date"
              required
              :min="catalog.range.start"
              :max="catalog.range.end"
          /></label>
          <template v-else>
            <label
              >开始日期<input v-model="draft.start" type="date" :max="draft.end || undefined"
            /></label>
            <label
              >结束日期<input v-model="draft.end" type="date" :min="draft.start || undefined"
            /></label>
          </template>
          <label v-if="mode === 'events'"
            >变更类型<select v-model="draft.operation">
              <option value="">全部变更</option>
              <option v-for="(label, key) in operationNames" :key="key" :value="key">
                {{ label }}
              </option>
            </select></label
          >
          <div class="wh-actions">
            <button type="submit" class="btn wh-primary"><Search :size="15" />查询</button
            ><button type="button" class="btn" @click="reset()">重置</button>
          </div>
        </form>
        <p class="wh-note">
          {{
            mode === 'events'
              ? '按采集时间查询新增、更新和删除事件。'
              : mode === 'versions'
                ? '按版本生效日期筛选，同一订单当天的最后一次变更决定当日状态。'
                : '显示所选日期结束时有效的订单版本，失效当日已关闭的版本会被排除。'
          }}
        </p>
      </section>
      <WarehouseGrid
        :title="modeName"
        :filename="modeName"
        :result="result"
        :error="error"
        :loading="loading"
        :sort-by="query.sortBy"
        :sort-order="query.sortOrder"
        :page-size="query.pageSize"
        inspect-label="查看"
        @sort="sort"
        @refresh="refresh"
        @page="page"
        @resize="resize"
        @inspect="selected = $event"
      />
    </template>
    <WarehouseDialog
      v-if="selected && result"
      :title="mode === 'events' ? '事件详情' : '版本详情'"
      @close="selected = null"
    >
      <dl class="wh-specs">
        <div v-for="field in result.fields" :key="field.key">
          <dt>{{ field.label }}</dt>
          <dd>{{ displayCell(field, selected[field.key]) }}</dd>
        </div>
      </dl>
      <div class="wh-dialog-foot wh-inline">
        <button class="btn" @click="inspectTimeline(selected)">
          <History :size="15" />{{ mode === 'events' ? '该订单拉链版本' : '该订单全部事件' }}
        </button>
        <RouterLink
          v-if="session.can('details:view') && selected.operation !== 'DELETE'"
          class="btn"
          :to="{ path: '/details', query: { orderId: String(selected.sn) } }"
          ><Rows3 :size="15" />查询当前订单</RouterLink
        >
        <span v-else-if="selected.operation === 'DELETE'" class="wh-code-pill"
          ><Database :size="12" /> 源记录已删除</span
        >
      </div>
    </WarehouseDialog>
  </section>
</template>
