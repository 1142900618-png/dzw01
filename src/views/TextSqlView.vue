<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlertCircle,
  BookOpen,
  Bookmark,
  Bot,
  Braces,
  Check,
  CheckCheck,
  CirclePlay,
  Code2,
  Database,
  FileClock,
  History,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Plus,
  SendHorizontal,
  Sparkles,
  Table2,
  X,
} from 'lucide-vue-next'
import { textSqlApi } from '@/api/textsql'
import type { SqlContext, SqlResult, SqlValidation, SqlWorkspace } from '@/domain/textsql'
import { useSessionStore } from '@/stores/session'
import './textsql.css'

const session = useSessionStore()
const workspace = ref<SqlWorkspace>()
const turns = ref<SqlContext[]>([])
const active = ref<SqlContext>()
const draft = ref('')
const sql = ref('')
const checked = ref<SqlValidation>()
const result = ref<SqlResult>()
const confirmed = ref(false)
const busy = ref('')
const failure = ref('')
const drawer = ref<'history' | 'favorites' | 'sources' | null>(null)
const dialog = ref<HTMLDialogElement>()
const chatLog = ref<HTMLElement>()
const promptField = ref<HTMLTextAreaElement>()
let controller: AbortController | undefined
const canRun = computed(() => session.can('sql:execute'))
const favorite = computed(
  () =>
    workspace.value?.favorites.some(
      (row) => row.id === active.value?.id && row.sql === sql.value,
    ) ?? false,
)
const libraryItems = computed(() =>
  drawer.value === 'favorites' ? workspace.value?.favorites : workspace.value?.history,
)

function showError(error: unknown) {
  failure.value = error instanceof Error ? error.message : '请求失败，请重试。'
}
async function perform(kind: string, task: (signal: AbortSignal) => Promise<void>) {
  if (busy.value) return
  const current = new AbortController()
  controller = current
  busy.value = kind
  failure.value = ''
  try {
    await task(current.signal)
  } catch (error) {
    if (!current.signal.aborted) showError(error)
  } finally {
    if (controller === current) busy.value = ''
  }
}
async function load() {
  await perform('loading', async (signal) => {
    const next = await textSqlApi.workspace(signal)
    if (!signal.aborted) workspace.value = next
  })
}
function select(query: SqlContext) {
  active.value = query
  sql.value = query.sql
  checked.value = undefined
  confirmed.value = false
  result.value = undefined
  failure.value = ''
}
function newChat() {
  active.value = undefined
  turns.value = []
  sql.value = ''
  draft.value = ''
  checked.value = undefined
  result.value = undefined
  confirmed.value = false
  failure.value = ''
  nextTick(() => promptField.value?.focus())
}
function resetCurrent() {
  controller?.abort()
  busy.value = ''
  workspace.value = undefined
  drawer.value = null
  newChat()
  void load()
}
watch(() => [session.user.id, session.role], resetCurrent, { immediate: true })
onBeforeUnmount(() => controller?.abort())

function edit() {
  checked.value = undefined
  confirmed.value = false
  result.value = undefined
  failure.value = ''
}
function buildQuery(): SqlContext {
  if (!active.value) throw new Error('请先生成或打开一条查询。')
  return { ...active.value, sql: sql.value }
}
function updateHistory(query: SqlContext) {
  if (!workspace.value) return
  workspace.value.history = [
    query,
    ...workspace.value.history.filter((row) => row.id !== query.id),
  ].slice(0, 60)
}
async function generate(question = draft.value) {
  const value = question.trim()
  if (!value) return
  await perform('generating', async (signal) => {
    const previous = active.value ? { question: active.value.question, sql: sql.value } : null
    const query = await textSqlApi.generate({ question: value, previous }, signal)
    if (signal.aborted) return
    turns.value.push(query)
    select(query)
    draft.value = ''
    updateHistory(query)
    await nextTick()
    chatLog.value?.scrollTo({ top: chatLog.value.scrollHeight, behavior: 'smooth' })
    const validation = await textSqlApi.validate(sql.value, signal)
    if (!signal.aborted) checked.value = validation
  })
}
async function validate() {
  await perform('validating', async (signal) => {
    const validation = await textSqlApi.validate(sql.value, signal)
    if (!signal.aborted) checked.value = validation
  })
}
async function run() {
  if (!checked.value?.valid || !confirmed.value || !canRun.value) return
  await perform('executing', async (signal) => {
    const query = buildQuery()
    const response = await textSqlApi.execute({ query, confirmed: confirmed.value }, signal)
    if (signal.aborted) return
    result.value = response
    confirmed.value = false
    active.value = query
    turns.value = turns.value.map((turn) => (turn.id === query.id ? query : turn))
    updateHistory(query)
  })
}
async function toggleFavorite() {
  await perform('saving', async (signal) => {
    const favorites = await textSqlApi.favorite(
      { query: buildQuery(), saved: !favorite.value },
      signal,
    )
    if (!signal.aborted && workspace.value) workspace.value.favorites = favorites
  })
}
async function openDrawer(type: NonNullable<typeof drawer.value>) {
  drawer.value = type
  await nextTick()
  if (!dialog.value?.open) dialog.value?.showModal()
}
function closeDrawer() {
  dialog.value?.close()
  drawer.value = null
}
function restore(query: SqlContext) {
  closeDrawer()
  turns.value = [query]
  select(query)
  void validate()
}
function keySubmit(event: KeyboardEvent) {
  if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return
  event.preventDefault()
  void generate()
}
function formatTime(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
function openTurn(turn: SqlContext) {
  select(turn)
  void validate()
}
</script>

<template>
  <div class="sql-view">
    <div class="page-head sql-page-head">
      <div>
        <h1>Text2SQL 工作台</h1>
        <p>用自然语言提问，预览 SQL 并查询数仓数据。</p>
      </div>
      <div class="sql-actions">
        <button class="btn" :disabled="!workspace || !!busy" @click="openDrawer('history')">
          <History :size="16" /> 历史记录
        </button>
        <button class="btn" :disabled="!workspace || !!busy" @click="openDrawer('favorites')">
          <Bookmark :size="16" /> SQL 收藏
        </button>
      </div>
    </div>

    <div v-if="failure" class="sql-error" role="alert">
      <AlertCircle :size="17" /><span>{{ failure }}</span>
      <button v-if="!workspace" class="btn" @click="load">重试</button>
      <button v-else class="sql-icon" aria-label="关闭提示" @click="failure = ''">
        <X :size="15" />
      </button>
    </div>
    <div v-if="!workspace && busy" class="panel sql-wait" role="status">
      <LoaderCircle class="sql-spin" /> 正在加载工作台…
    </div>
    <div v-if="workspace" class="sql-grid">
      <section class="panel sql-chat">
        <header class="sql-panel-head">
          <h2>
            <span class="sql-glyph purple"><MessageSquare :size="17" /></span>对话查询
          </h2>
          <button :disabled="!!busy" class="sql-quiet" @click="newChat">
            <Plus :size="15" />新对话
          </button>
        </header>
        <div ref="chatLog" class="sql-messages" aria-live="polite">
          <div v-if="!turns.length" class="sql-intro">
            <div class="sql-assistant-icon"><Sparkles :size="25" /></div>
            <h3>想了解哪些交易数据？</h3>
            <p>选择一个问题开始，或输入你想查询的指标。</p>
            <div class="sql-suggestions">
              <button
                v-for="example in workspace.examples"
                :key="example"
                :disabled="!!busy"
                @click="generate(example)"
              >
                <MessageSquare :size="15" /><span>{{ example }}</span>
              </button>
            </div>
          </div>
          <article v-for="turn in turns" :key="turn.id" class="sql-turn">
            <div class="sql-question">{{ turn.question }}</div>
            <div class="sql-answer">
              <span class="sql-glyph purple"><Bot :size="17" /></span>
              <div>
                <strong>数据助手</strong>
                <p>{{ turn.explanation }}</p>
                <button
                  class="sql-query-ref"
                  :class="{ chosen: active?.id === turn.id }"
                  :disabled="!!busy"
                  @click="openTurn(turn)"
                >
                  <Code2 :size="14" />{{ turn.source }}
                </button>
              </div>
            </div>
          </article>
          <div v-if="busy === 'generating'" class="sql-thinking" role="status">
            <LoaderCircle :size="14" class="sql-spin" /> 正在生成并校验查询…
          </div>
        </div>
        <div class="sql-composer">
          <label class="sql-input-label" for="sql-question">业务问题</label>
          <textarea
            id="sql-question"
            ref="promptField"
            v-model="draft"
            :disabled="!!busy"
            rows="3"
            maxlength="500"
            placeholder="例如：最近 7 天的每日 GMV 是多少？"
            @keydown="keySubmit"
          />
          <div class="sql-compose-foot">
            <span>Ctrl / ⌘ + Enter</span
            ><button class="sql-send" :disabled="!draft.trim() || !!busy" @click="generate()">
              <SendHorizontal :size="15" />发送
            </button>
          </div>
        </div>
      </section>

      <section class="panel sql-editor-panel">
        <header class="sql-panel-head">
          <h2>
            <span class="sql-glyph blue"><Code2 :size="18" /></span>SQL 预览
          </h2>
          <button class="sql-quiet" @click="openDrawer('sources')">
            <BookOpen :size="15" />数据字典
          </button>
        </header>
        <div class="sql-editor-body">
          <div class="sql-editor-bar">
            <span><Braces :size="14" /> SQL</span>
            <button
              class="sql-quiet"
              :disabled="!active || !sql.trim() || !!busy"
              :aria-pressed="favorite"
              @click="toggleFavorite"
            >
              <Bookmark :size="14" :fill="favorite ? 'currentColor' : 'none'" />{{
                favorite ? '已收藏' : '收藏'
              }}
            </button>
          </div>
          <textarea
            v-model="sql"
            class="sql-code"
            aria-label="编辑 SQL"
            spellcheck="false"
            :disabled="!active || !!busy"
            placeholder="生成的 SQL 将显示在这里"
            @input="edit"
          />
          <div
            class="sql-check"
            :class="{ pass: checked?.valid, fail: checked && !checked.valid }"
            aria-live="polite"
          >
            <CheckCheck v-if="checked?.valid" :size="16" /><AlertCircle
              v-else-if="checked"
              :size="16"
            /><ListChecks v-else :size="16" />
            <span>{{ checked?.message ?? '等待语法校验' }}</span>
            <button
              class="sql-quiet"
              :disabled="!active || !sql.trim() || !!busy"
              @click="validate"
            >
              {{ busy === 'validating' ? '校验中…' : '校验 SQL' }}
            </button>
          </div>
        </div>
        <footer class="sql-exec-foot">
          <div class="sql-switch-wrap">
            <button
              type="button"
              role="switch"
              aria-label="允许执行当前 SQL"
              :aria-checked="confirmed"
              :disabled="!checked?.valid || !canRun || !!busy"
              class="sql-switch"
              @click="confirmed = !confirmed"
            >
              <i />
            </button>
            <span>{{ canRun ? '允许执行' : '当前角色仅可预览' }}</span>
          </div>
          <button
            class="sql-execute"
            :disabled="!confirmed || !checked?.valid || !canRun || !!busy"
            @click="run"
          >
            <CirclePlay :size="16" />{{ busy === 'executing' ? '执行中…' : '执行 SQL' }}
          </button>
        </footer>
      </section>

      <section class="panel sql-output">
        <header class="sql-panel-head">
          <h2>
            <span class="sql-glyph green"><Table2 :size="17" /></span>查询结果
          </h2>
          <span v-if="result" class="sql-meta"
            >{{ result.truncated ? '前 ' : '' }}{{ result.rows.length }} 行 ·
            {{ result.elapsedMs }} ms</span
          >
        </header>
        <div v-if="result?.rows.length" class="table-wrap sql-result-table">
          <table class="data-table">
            <thead>
              <tr>
                <th v-for="(column, i) in result.columns" :key="i">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in result.rows" :key="index">
                <td v-for="(cell, j) in row" :key="j">{{ cell ?? 'NULL' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="sql-result-empty">
          <Database :size="23" /><strong>{{
            result ? '查询成功，未匹配到记录' : '等待执行查询'
          }}</strong>
          <p>
            {{
              result
                ? '可调整 SQL 的日期范围或筛选条件后重新执行。'
                : '校验 SQL 并开启执行开关后，在此查看结果。'
            }}
          </p>
        </div>
      </section>
    </div>
    <dialog
      v-if="drawer"
      ref="dialog"
      class="sql-dialog"
      @close="drawer = null"
      @click="$event.target === dialog && closeDrawer()"
    >
      <section class="sql-dialog-inner">
        <header class="sql-panel-head">
          <h2>
            <History v-if="drawer === 'history'" :size="18" /><Bookmark
              v-else-if="drawer === 'favorites'"
              :size="18"
            /><BookOpen v-else :size="18" />
            {{
              drawer === 'history'
                ? '历史记录'
                : drawer === 'favorites'
                  ? 'SQL 收藏'
                  : '可查询的数据表'
            }}
          </h2>
          <button class="sql-icon" aria-label="关闭窗口" @click="closeDrawer">
            <X :size="18" />
          </button>
        </header>
        <div v-if="drawer === 'sources'" class="sql-dictionary">
          <div v-for="source in workspace?.sources" :key="source.table">
            <h3>{{ source.title }}</h3>
            <code>{{ source.table }}</code>
            <p>{{ source.fields.join(' · ') }}</p>
          </div>
        </div>
        <div v-else-if="libraryItems?.length" class="sql-library">
          <button
            v-for="item in libraryItems"
            :key="item.id"
            :disabled="!!busy"
            @click="restore(item)"
          >
            <span
              ><strong>{{ item.question }}</strong
              ><small>{{ formatTime(item.createdAt) }} · {{ item.source }}</small></span
            ><Code2 :size="16" />
          </button>
        </div>
        <div v-else class="sql-result-empty">
          <FileClock :size="24" /><strong>{{
            drawer === 'favorites' ? '还没有收藏的 SQL' : '还没有查询记录'
          }}</strong>
          <p>
            {{
              drawer === 'favorites'
                ? '点击 SQL 编辑器中的收藏按钮即可保存查询。'
                : '提交业务问题后，可在此重新打开查询。'
            }}
          </p>
        </div>
        <footer class="sql-dialog-foot">
          <button class="btn" @click="closeDrawer"><Check :size="15" />完成</button>
        </footer>
      </section>
    </dialog>
  </div>
</template>
