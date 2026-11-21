# Text2SQL 接入

侧栏进入「Text2SQL 工作台」，选择示例或输入问题。生成的 SQL 可以直接编辑。编辑会清除上次校验、执行许可与结果；通过校验后打开「允许执行」并点击「执行 SQL」。每次完成执行都会关闭开关。历史记录可恢复查询，收藏保存点击时的 SQL 快照。

## 切换服务

默认使用 `mock://warehouse`。在 `.env.development.local`（开发模式）或 `.env.production.local`（生产构建）设置以下变量，重启开发服务器或重新构建。Text2SQL 与数仓共用后端时仅设置 `VITE_API_BASE_URL` 即可。配置独立地址时，两个服务使用相同的身份会话。

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_TEXT2SQL_BASE_URL=/query-api/v1
```

前端向服务前缀拼接下表中的完整路径。所有请求使用 POST 与 JSON，携带会话 Cookie、`X-Request-ID`，支持取消和超时。后端跨域时需允许具体前端来源与凭据。模型和数仓凭据由后端持有。

| 路径                 | 请求体                                                  | 成功响应的 data                                                                                                |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/textsql/workspace` | `{}`                                                    | `{examples: string[], sources: SqlSource[], rowLimit: number, history: SqlContext[], favorites: SqlContext[]}` |
| `/textsql/generate`  | `{question: string, previous: {question, sql} 或 null}` | `SqlContext`，记录本次生成的历史                                                                               |
| `/textsql/validate`  | `{sql: string}`                                         | `{valid: boolean, message: string}`，校验未通过也是正常响应                                                    |
| `/textsql/execute`   | `{query: SqlContext, confirmed: true}`                  | `{columns: string[], rows: (number 或 string 或 null)[][], truncated: boolean, elapsedMs: number}`             |
| `/textsql/favorite`  | `{query: SqlContext, saved: boolean}`                   | 更新后的当前用户收藏列表 `SqlContext[]`，按同一 ID 重复保存会替换快照                                          |

`SqlContext` 包含 `id`、`question`、`sql`、`explanation`、`source`、`createdAt` 六个字符串字段。时间戳使用 ISO 8601。执行时传递编辑后的 `query.sql`；服务应以实际 SQL 解析得到的数据源做权限判断。`SqlSource` 包含完整表名 `table`、标题 `title` 和字段名数组 `fields`。结果行按 `columns` 顺序返回，零行时保留列定义。`truncated` 表示达到服务行数上限后仍有更多数据。

下面是一次成功的语法校验响应。

```json
{
  "code": "OK",
  "message": "",
  "requestId": "req-123",
  "data": { "valid": true, "message": "语法校验通过 · 只读 SELECT" }
}
```

操作错误返回相应 HTTP 状态码与 `{code, message, requestId, data: null}`。401/403 用于会话和授权失败，422 可表示模型未能匹配意图。读取工作台需要 `sql:view`，查询执行还需要 `sql:execute`。后端按已认证身份存取历史与收藏，并在执行时重新校验 SQL、表和行权限、只读约束、查询超时与行数上限。执行开关传递用户本次操作意愿。

## Mock 行为与口径

`src/mocks/textsql.ts` 提供独立 Mock 转发函数。问题匹配生成模板，支持最近 N 天的 GMV、订单数、逐日下单人数和件数，以及按渠道或品类汇总成交额。发送「改为最近 30 天」可延续上一轮查询。相对日期以结构化数据集的最新日期为基准。无法匹配模板时返回原因。Mock 未连接任何模型服务或远端数据库。

`src/mocks/data/textsqlEngine.ts` 在首次校验时加载本机随包分发的 SQLite WASM，并从同一套订单与订单行事实生成三个只读视图对应的数据表。SQL 由 SQLite 实际解析和执行。支持单表 SELECT、WHERE、GROUP BY、HAVING、ORDER BY、LIMIT 及常用聚合函数。多语句、联表、子查询、DDL/DML、命名参数及未开放的表和函数会被拒绝。每次最多返回 100 行，用户 LIMIT 更小时保留其语义。

| 表名                       | 来源与口径                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ads.ads_order_stats`      | 《太一数科平台之主题计算》§10.3.1 交易统计 schema。按日统计下单金额（元）、件数、去重买家数和去重订单数。跨日汇总买家需从事实重新去重。 |
| `ads.channel_sales_daily`  | 前端联调派生表。使用订单渠道与金额按日期、渠道聚合。                                                                                    |
| `ads.category_sales_daily` | 前端联调派生表。使用订单项按日期、商品品类聚合，跨品类订单按行分摊金额。                                                                |

历史和收藏保存在浏览器 localStorage，键按当前用户 ID 隔离。历史保留最近 60 条，收藏独立存储并可在恢复查询后取消。真实服务可使用同一接口持久化这些数据。前端通过 `src/api/textsql.ts` 和 `src/domain/textsql.ts` 获得完整的 TypeScript 契约。
