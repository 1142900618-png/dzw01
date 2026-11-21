<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  LoaderCircle,
  RefreshCw,
} from 'lucide-vue-next'
import { displayCell, type GridResult, type DataRow } from '../../domain/warehouse'
import { downloadCsv } from '../../lib/csv'

const props = defineProps<{
  result: GridResult | null
  loading: boolean
  error: string
  title: string
  filename: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  pageSize: number
  inspectLabel?: string
}>()
const emit = defineEmits<{
  refresh: []
  sort: [string]
  page: [number]
  resize: [number]
  inspect: [DataRow]
}>()
const pageCount = computed(() =>
  props.result ? Math.max(1, Math.ceil(props.result.total / props.pageSize)) : 1,
)
function exportPage() {
  if (!props.result?.rows.length) return
  const { fields, rows, page } = props.result
  downloadCsv(
    props.filename + '-P' + page + '.csv',
    fields.map((f) => f.label),
    rows.map((row) => fields.map((f) => row[f.key] ?? '')),
  )
}
</script>
<template>
  <section class="panel wh-grid" :aria-busy="loading">
    <header class="wh-panel-head">
      <div class="wh-inline">
        <h2>{{ title }}</h2>
        <span v-if="result" class="wh-count">{{ result.total.toLocaleString() }} 条</span>
      </div>
      <div class="wh-inline">
        <button
          class="wh-icon-btn"
          title="刷新"
          aria-label="刷新当前结果"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <RefreshCw :size="15" />
        </button>
        <button
          class="btn wh-small-btn"
          :disabled="!result?.rows.length || loading"
          @click="exportPage"
        >
          <Download :size="14" />导出当前页
        </button>
      </div>
    </header>
    <div v-if="error" class="wh-state" role="alert">
      <p>{{ error }}</p>
      <button class="btn" @click="emit('refresh')">重新加载</button>
    </div>
    <div v-else-if="loading" class="wh-state" role="status">
      <LoaderCircle class="wh-spin" :size="23" /><span>正在读取数据…</span>
    </div>
    <div v-else-if="result && !result.rows.length" class="wh-state">
      <Database :size="26" /><strong>没有匹配的记录</strong><span>可调整筛选条件后重新查询。</span>
    </div>
    <div
      v-else-if="result"
      class="table-wrap wh-scroll"
      tabindex="0"
      aria-label="数据表，可横向滚动"
    >
      <table class="data-table wh-table">
        <thead>
          <tr>
            <th
              v-for="f in result.fields"
              :key="f.key"
              scope="col"
              :aria-sort="
                sortBy === f.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined
              "
            >
              <button @click="emit('sort', f.key)">
                {{ f.label
                }}<component
                  :is="sortBy === f.key ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown"
                  :size="12"
                />
              </button>
            </th>
            <th v-if="inspectLabel" scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in result.rows" :key="i">
            <td v-for="f in result.fields" :key="f.key">
              <span
                :class="[
                  (f.format === 'status' || f.format === 'operation') && row[f.key]
                    ? 'wh-tag wh-tag-' + row[f.key]
                    : '',
                  f.format === 'currency' ? 'wh-money' : '',
                ]"
                >{{ displayCell(f, row[f.key]) }}</span
              >
            </td>
            <td v-if="inspectLabel">
              <button
                class="wh-text-btn"
                :aria-label="inspectLabel + ' ' + (row.sn || row.order_sn || row.event_id || '')"
                @click="emit('inspect', row)"
              >
                <Eye :size="14" />{{ inspectLabel }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer v-if="result" class="wh-grid-foot">
      <span>共 {{ result.total.toLocaleString() }} 条记录</span>
      <div class="wh-inline">
        <label
          >每页
          <select
            :value="pageSize"
            aria-label="每页记录数"
            @change="emit('resize', Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="n in [10, 20, 50, 100]" :key="n" :value="n">{{ n }}</option>
          </select></label
        >
        <button
          class="wh-icon-btn"
          :disabled="result.page <= 1"
          aria-label="上一页"
          @click="emit('page', result.page - 1)"
        >
          <ChevronLeft :size="16" />
        </button>
        <span>{{ result.page }} / {{ pageCount }}</span
        ><button
          class="wh-icon-btn"
          :disabled="result.page >= pageCount"
          aria-label="下一页"
          @click="emit('page', result.page + 1)"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </footer>
  </section>
</template>
