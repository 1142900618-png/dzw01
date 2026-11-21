import type {
  ExecuteSqlInput,
  FavoriteSqlInput,
  GenerateSqlInput,
  SqlContext,
  SqlWorkspace,
} from '@/domain/textsql'
import { useSessionStore } from '@/stores/session'
import { modelConfig } from './data/analyticsFacts'
import { examples, rowLimit, sources } from './data/textsqlCatalog'

interface Library {
  history: SqlContext[]
  favorites: SqlContext[]
}

const libraryLimit = 60

function libraryKey() {
  return 'taiyi:textsql:v1:' + encodeURIComponent(useSessionStore().user.id)
}

function isQuery(input: unknown): input is SqlContext {
  if (!input || typeof input !== 'object') return false
  const row = input as Partial<SqlContext>
  return (
    typeof row.createdAt === 'string' &&
    Number.isFinite(Date.parse(row.createdAt)) &&
    ['id', 'question', 'sql', 'explanation', 'source'].every(
      (key) => typeof row[key as keyof SqlContext] === 'string',
    )
  )
}

function readLibrary(): Library {
  try {
    const raw = localStorage.getItem(libraryKey())
    const parsed = raw ? JSON.parse(raw) : null
    return {
      history: Array.isArray(parsed?.history)
        ? parsed.history.filter(isQuery).slice(0, libraryLimit)
        : [],
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites.filter(isQuery) : [],
    }
  } catch {
    return { history: [], favorites: [] }
  }
}

function saveLibrary(library: Library) {
  try {
    localStorage.setItem(libraryKey(), JSON.stringify(library))
  } catch {
    throw new Error('浏览器存储空间不足或不可写，未能保存查询。')
  }
}

function remember(query: SqlContext) {
  const library = readLibrary()
  library.history = [query, ...library.history.filter((item) => item.id !== query.id)].slice(
    0,
    libraryLimit,
  )
  saveLibrary(library)
}

function dateBefore(date: string, days: number) {
  const parsed = new Date(date + 'T00:00:00Z')
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

function generate(input: GenerateSqlInput): SqlContext {
  const question = typeof input?.question === 'string' ? input.question.trim() : ''
  if (!question || question.length > 500) throw new Error('请输入 1 至 500 个字符的业务问题。')
  const followUp =
    /^(?:改[为成看]?|换[为成看]?|再看|那么?|只看|看下)?\s*(?:最?近|过去)\s*\d+\s*[日天]\s*[呢？?呀吧。]?$/i.test(
      question,
    )
  const intent = followUp && input.previous ? input.previous.question : question
  const previousSql = followUp ? (input.previous?.sql ?? '') : ''
  const period = /(?:近|过去)\s*(\d+)\s*[日天]/.exec(question)
  const days = period
    ? Number(period[1])
    : /月/.test(question)
      ? 30
      : /今日|今天|当日/.test(question)
        ? 1
        : 7
  if (days < 1 || dateBefore(modelConfig.end, Math.min(days - 1, 366)) < modelConfig.start) {
    throw new Error('请求的天数超出了当前 Mock 数据集覆盖的时间范围。')
  }
  if (
    /\d{4}[-年]|\d+月\d+|昨天|上周|本周|上月|本月|去年|同比|环比|退款|利润|复购|转化|预测|支付|地域|省份|品牌|性别|优惠券/.test(
      intent,
    )
  ) {
    throw new Error(
      '当前 Mock 支持最近 N 天的下单指标、渠道和品类成交额。可选择示例或直接编辑 SQL。',
    )
  }
  const channel = /渠道|各端|平台/.test(intent) || previousSql.includes(sources[1].table)
  const category = /类目|品类|分类/.test(intent) || previousSql.includes(sources[2].table)
  if (category && channel) throw new Error('Mock 每次支持一个分组维度，请选择渠道或品类。')
  // Match the complete question. An unrecognized qualifier (such as a region or
  // a named merchant) must never silently turn into an unfiltered sales total.
  const rest = question
    .toLowerCase()
    .replace(
      /(?:最近|近|过去)\s*\d+\s*[日天]|最近一个月|近一个月|最近一周|近一周|今天|今日|当日/g,
      '',
    )
    .replace(
      /订单金额|成交额|交易额|销售额|gmv|订单数量|订单量|订单数|下单次数|下单笔数|下单人数|用户数|买家数|件数|销量/g,
      '',
    )
    .replace(/商品品类|品类|类目|分类|渠道|各端|平台|每日|每天|趋势|按天|逐日/g, '')
    .replace(
      /请问|请查询|查询|查看|比较|显示|统计|合计|合计值|汇总|排名|排行|最高|第一|最大|是多少|多少|哪一个|哪个|什么|分别|各个|所有/g,
      '',
    )
    .replace(/[各的和与及按是有我想看请吗呢呀么，。？、,?.\s]/g, '')
  if (!followUp && rest)
    throw new Error(
      '当前问题包含 Mock 未支持的条件，请参照示例调整问题，或在 SQL 编辑器中添加条件。',
    )
  const source = sources[category ? 2 : channel ? 1 : 0].table
  const start = dateBefore(modelConfig.end, days - 1)
  const range = "calc_dt BETWEEN '" + start + "' AND '" + modelConfig.end + "'"
  let sql: string
  let explanation: string
  if (category || channel) {
    if (
      /人数|用户数|买家数|订单数|订单量|客单价|下单数|下单次数|下单笔数|件数|销量|每日|每天|趋势|逐日|按天/.test(
        intent,
      )
    )
      throw new Error('当前渠道和品类 Mock 视图提供成交额指标。')
    const column = category ? 'category_name' : 'channel_name'
    const top = /最高|第一|最大/.test(intent) || /LIMIT 1;?$/i.test(previousSql)
    sql = [
      'SELECT ' + column + ',',
      '       ROUND(SUM(order_total_amount), 2) AS gmv',
      'FROM ' + source,
      'WHERE ' + range,
      'GROUP BY ' + column,
      'ORDER BY gmv DESC, ' + column + ' ASC' + (top ? '\nLIMIT 1;' : ';'),
    ].join('\n')
    explanation =
      '按' +
      (category ? '商品品类' : '下单渠道') +
      '汇总最近 ' +
      days +
      ' 天的 GMV，按金额降序排列。'
  } else {
    if (/最高|第一|最大|排名|排行/.test(intent))
      throw new Error('Mock 的排名查询需要指定渠道或品类。')
    const metrics = [
      { test: /gmv|成交额|交易额|销售额|订单金额/i, field: 'order_total_amount' },
      { test: /订单[数量]|下单次数|下单笔数/, field: 'order_cnt' },
      { test: /下单人数|用户数|买家数/, field: 'order_user_cnt' },
      { test: /件数|销量/, field: 'sku_cnt' },
    ]
      .filter((m) => m.test.test(intent) || previousSql.includes(m.field))
      .map((m) => m.field)
    if (!metrics.length) throw new Error('尚未匹配到 Mock 查询模板，请尝试下方示例中的交易指标。')
    const trend = /每日|每天|趋势|按天|逐日/.test(intent) || /SELECT calc_dt/i.test(previousSql)
    if (!trend && days > 1 && metrics.includes('order_user_cnt')) {
      throw new Error(
        '当日交易统计表仅支持逐日下单人数，跨日人数需要对买家重新去重。请改问每天的下单人数。',
      )
    }
    const columns = trend
      ? ['calc_dt', ...metrics]
      : metrics.map((field) =>
          field === 'order_total_amount'
            ? 'ROUND(SUM(order_total_amount), 2) AS order_total_amount'
            : 'SUM(' + field + ') AS ' + field,
        )
    sql =
      [
        'SELECT ' + columns.join(',\n       '),
        'FROM ' + source,
        'WHERE ' + range,
        ...(trend ? ['ORDER BY calc_dt ASC'] : []),
      ].join('\n') + ';'
    explanation = (trend ? '逐日列出' : '汇总') + '最近 ' + days + ' 天的下单指标，金额单位为元。'
  }
  // randomUUID is optional on non-HTTPS LAN previews. Random bytes are available there.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const query = { id, question, sql, explanation, source, createdAt: new Date().toISOString() }
  remember(query)
  return query
}

// This forwarding point is loaded only by the Mock transport. HTTP mode uses the
// same endpoint paths and payloads without shipping queries to a browser database.
export async function textsqlMock(path: string, body: unknown): Promise<unknown> {
  switch (path) {
    case '/textsql/workspace':
      return { examples, sources, rowLimit, ...readLibrary() } satisfies SqlWorkspace
    case '/textsql/generate':
      return generate(body as GenerateSqlInput)
    case '/textsql/validate': {
      const { validateSql } = await import('./data/textsqlEngine')
      return validateSql(String((body as { sql?: string })?.sql ?? ''))
    }
    case '/textsql/execute': {
      const input = body as ExecuteSqlInput
      if (!useSessionStore().can('sql:execute')) throw new Error('当前角色缺少 SQL 执行权限。')
      if (input?.confirmed !== true || !isQuery(input.query))
        throw new Error('请确认查询内容并启用执行开关。')
      const userId = useSessionStore().user.id
      const { executeSql } = await import('./data/textsqlEngine')
      if (useSessionStore().user.id !== userId || !useSessionStore().can('sql:execute'))
        throw new Error('会话已变更，请重新打开查询。')
      const result = await executeSql(input.query.sql)
      if (useSessionStore().user.id === userId) remember(input.query)
      return result
    }
    case '/textsql/favorite': {
      const input = body as FavoriteSqlInput
      if (!isQuery(input?.query) || typeof input.saved !== 'boolean')
        throw new Error('收藏参数无效。')
      const library = readLibrary()
      const other = library.favorites.filter((row) => row.id !== input.query.id)
      library.favorites = input.saved ? [input.query, ...other] : other
      saveLibrary(library)
      return library.favorites
    }
    default:
      throw new Error('未知 Text2SQL 接口：' + path)
  }
}
