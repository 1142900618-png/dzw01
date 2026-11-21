import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { SqlResult, SqlValidation } from '@/domain/textsql'
import { dimensionOptions, getOrderFacts, getOrderItems } from './analyticsFacts'
import { rowLimit, sources } from './textsqlCatalog'

let initializing: Promise<Database> | undefined

async function createDatabase() {
  const sqlite = await initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false })
  const db = new sqlite.Database()
  try {
    db.run("ATTACH DATABASE ':memory:' AS ads")
    db.run(
      'CREATE TABLE ads.ads_order_stats (calc_dt TEXT PRIMARY KEY, order_total_amount REAL, sku_cnt INTEGER, order_user_cnt INTEGER, order_cnt INTEGER)',
    )
    db.run(
      'CREATE TABLE ads.channel_sales_daily (calc_dt TEXT, channel_name TEXT, order_total_amount REAL)',
    )
    db.run(
      'CREATE TABLE ads.category_sales_daily (calc_dt TEXT, category_name TEXT, order_total_amount REAL)',
    )
    const daily = new Map<
      string,
      { amount: number; pieces: number; buyers: Set<string>; orders: number }
    >()
    const orders = getOrderFacts()
    const dates = new Map<string, string>()
    const channels = new Map<string, number>()
    const categories = new Map<string, number>()
    const channelNames = new Map(dimensionOptions.channels.map((d) => [d.id, d.name]))
    const categoryNames = new Map(dimensionOptions.categories.map((d) => [d.id, d.name]))
    for (const order of orders) {
      dates.set(order.id, order.date)
      const day = daily.get(order.date) ?? {
        amount: 0,
        pieces: 0,
        buyers: new Set<string>(),
        orders: 0,
      }
      day.amount += order.amountCents
      day.pieces += order.pieces
      day.buyers.add(order.buyerId)
      day.orders++
      daily.set(order.date, day)
      const key = order.date + '|' + (channelNames.get(order.channel) ?? order.channel)
      channels.set(key, (channels.get(key) ?? 0) + order.amountCents)
    }
    for (const item of getOrderItems()) {
      const key =
        dates.get(item.orderId) + '|' + (categoryNames.get(item.category) ?? item.category)
      categories.set(key, (categories.get(key) ?? 0) + item.amountCents)
    }
    db.run('BEGIN')
    const dailyInsert = db.prepare('INSERT INTO ads.ads_order_stats VALUES (?,?,?,?,?)')
    try {
      daily.forEach((v, date) =>
        dailyInsert.run([date, v.amount / 100, v.pieces, v.buyers.size, v.orders]),
      )
    } finally {
      dailyInsert.free()
    }
    for (const [table, data] of [
      ['channel_sales_daily', channels],
      ['category_sales_daily', categories],
    ] as const) {
      const insert = db.prepare('INSERT INTO ads.' + table + ' VALUES (?,?,?)')
      try {
        data.forEach((cents, key) => insert.run([...key.split('|'), cents / 100]))
      } finally {
        insert.free()
      }
    }
    db.run('COMMIT')
    db.run('PRAGMA query_only = ON')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

function getDatabase() {
  initializing ??= createDatabase().catch((error: unknown) => {
    initializing = undefined
    throw error
  })
  return initializing
}

const allowedFunctions = new Set(['sum', 'count', 'round', 'max', 'min', 'avg', 'coalesce', 'abs'])
const allowedTables = new Set(sources.map((source) => source.table))
const queryParts = new Set(['where', 'order', 'group', 'limit', 'having'])

// A bounded single-table dialect keeps the browser fixture predictable. SQLite's
// prepare() then checks actual syntax, columns, function arguments and grouping.
function readOnlyStatement(input: string) {
  if (!input.trim()) throw new Error('请输入 SQL 语句。')
  if (input.length > 4000) throw new Error('SQL 最多支持 4,000 个字符。')
  const sql = input.trim().replace(/;\s*$/, '').trim()
  // Remove string contents before checking SQL structure; SQLite quotes a single quote by doubling it.
  const structure = sql.replace(/'(?:[^']|'')*'/g, "''")
  if (/['";`[\]?$:@]/.test(structure.replace(/''/g, '')) || /--|\/\*|\*\//.test(structure)) {
    throw new Error('仅支持单条 SELECT 语句、单引号字符串和普通字段名。')
  }
  const words = structure.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []
  const disallowed =
    /^(?:join|union|intersect|except|with|over|pragma|attach|detach|insert|update|delete|drop|alter|create|replace|values)$/
  if (
    words[0] !== 'select' ||
    words.filter((w) => w === 'select').length !== 1 ||
    words.some((w) => disallowed.test(w))
  ) {
    throw new Error('Mock 仅支持查询已开放数据表的单表 SELECT。')
  }
  const from = /\bfrom\s+(ads\.[a-z_][a-z_0-9]*)([\s\S]*)$/i.exec(structure)
  if (!from || !allowedTables.has(from[1].toLowerCase()))
    throw new Error('FROM 必须引用当前面板列出的完整数据表名。')
  const tail = from[2].trim().toLowerCase()
  if (tail && !queryParts.has(/^\w+/.exec(tail)?.[0] ?? ''))
    throw new Error('Mock 查询支持单表过滤、聚合、排序和 LIMIT。')
  for (const match of structure.matchAll(/\b([a-z_][a-z_0-9]*)\s*\(/gi)) {
    if (
      !allowedFunctions.has(match[1].toLowerCase()) &&
      !['in', 'where', 'and', 'or', 'not', 'select', 'by', 'having'].includes(
        match[1].toLowerCase(),
      )
    ) {
      throw new Error('当前 Mock 不支持此函数：' + match[1])
    }
  }
  return sql
}

export async function validateSql(sql: string): Promise<SqlValidation> {
  const db = await getDatabase()
  try {
    const query = readOnlyStatement(sql)
    const statement = db.prepare(query)
    statement.free()
    return { valid: true, message: '语法校验通过 · 只读 SELECT' }
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : 'SQL 校验失败' }
  }
}

export async function executeSql(sql: string): Promise<SqlResult> {
  const query = readOnlyStatement(sql)
  const db = await getDatabase()
  const start = performance.now()
  // Wrapping leaves user-defined grouping, ordering and a smaller LIMIT intact.
  const stmt = db.prepare('SELECT * FROM (' + query + ') LIMIT ' + (rowLimit + 1))
  try {
    const columns = stmt.getColumnNames()
    const rows: SqlResult['rows'] = []
    while (stmt.step())
      rows.push(stmt.get().map((value) => (value instanceof Uint8Array ? '[BLOB]' : value)))
    return {
      columns,
      rows: rows.slice(0, rowLimit),
      truncated: rows.length > rowLimit,
      elapsedMs: Math.max(1, Math.round(performance.now() - start)),
    }
  } finally {
    stmt.free()
  }
}
