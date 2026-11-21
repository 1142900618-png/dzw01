# HTTP 接口契约

`src/api/client.ts` 根据地址选择进程内 Mock 或 HTTP 传输，页面统一从各业务 API 获取类型化的 `data`。真实网关按下列契约实现，前端只需配置 `VITE_API_BASE_URL`；Text2SQL 可以另设 `VITE_TEXT2SQL_BASE_URL`。例如基地址 `/api/v1` 与路径 `/analytics/daily` 组合成 `/api/v1/analytics/daily`。Mock 模式直接调用内存处理函数，下面的 HTTP 示例用于真实网关联调。

## 传输与错误

全部端点接受 `POST`、`Content-Type: application/json` 和 UTF-8 JSON 请求体。无参数时传 `{}`。客户端发送关联标识 `X-Request-ID`，携带会话 Cookie，支持取消及 30 秒 HTTP 请求超时。跨域服务需允许指定前端来源、凭据、POST 和实际请求头。每个响应返回 `code`、`message`、`requestId`、`data` 四个字段。成功时为 HTTP 2xx、`code: "OK"`。查询结果为空时仍返回契约中的列、空数组和计数。

例如向 `/analytics/daily` 查询最新一天时，请求与成功响应如下。

```json
{
  "start": "2026-11-14",
  "end": "2026-11-20",
  "page": 1,
  "pageSize": 1,
  "sortBy": "date",
  "sortOrder": "desc"
}
```

```json
{
  "code": "OK",
  "message": "",
  "requestId": "req-example",
  "data": {
    "page": 1,
    "pageSize": 1,
    "total": 7,
    "rows": [
      {
        "date": "2026-11-20",
        "gmv": 79236.08,
        "orders": 231,
        "buyers": 228,
        "basket": 347.53,
        "pieces": 381
      }
    ]
  }
}
```

失败时使用对应的 HTTP 状态码、英文业务错误码、可展示的中文消息及关联标识。例如 403 可返回以下响应。返回 401 表示会话失效，400/422 表示请求参数或意图无效；5xx 用于服务异常。前端对失败抛出带 `code` 和 `requestId` 的 API 错误，页面提供重试或反馈。SQL 的正常语法检查结果可直接返回成功信封中的 `valid: false`。

```json
{
  "code": "FORBIDDEN",
  "message": "当前用户无权查看订单明细",
  "requestId": "req-example",
  "data": null
}
```

## 会话

| 路径              | 请求体                     | 成功响应的 data                                   |
| ----------------- | -------------------------- | ------------------------------------------------- |
| `/session/me`     | `{}`                       | `{user: {id, name, initials}, role, permissions}` |
| `/session/switch` | `{role}`，仅 Mock 角色切换 | 更新后的同结构会话                                |

`role` 为 `admin`、`analyst` 或 `viewer`。授权依据为 `permissions` 字符串数组。页面键为 `dashboard:view`、`dimensions:view`、`portrait:view`、`warehouse:view`、`changes:view`、`details:view`、`sql:view`；SQL 执行额外需要 `sql:execute`。服务端根据已认证用户裁决行、列及操作权限；为具备对应页面权限的使用者提供该页所需的维度字典与字段元数据。

## 交易分析

请求日期 `start`、`end` 取业务日 `YYYY-MM-DD`，包含两端。Mock 单次支持至多 366 天。同次请求最多指定一个 `channel`、`category`、`region`、`product`，多维条件取交集。传字典 ID，省略字段代表该维度全部。金额以元返回，人数与订单数在当前窗口去重。

| 路径                   | 请求体                                                     | 成功响应的 data                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/analytics/options`   | `{}`                                                       | `{categories, channels, regions, products, defaultRange, availableRange}`；字典项含 `id, name`，商品另含所属品类 ID `category` 和单价 `price`，两个区间均为 `{start, end}` |
| `/analytics/overview`  | 日期与可选维度                                             | `{current, previous, delta, trend, categories, channels, regions, products, radar, updatedAt}`                                                                             |
| `/analytics/daily`     | 日期与可选维度，另传 `page, pageSize, sortBy?, sortOrder?` | `{rows, total, page, pageSize}`，每行含日期与五项指标                                                                                                                      |
| `/analytics/breakdown` | 日期与可选维度，另传 `dimension`                           | `BreakdownRow[]`，按 GMV 降序，支持 `category/channel/region/product` 四种维度                                                                                             |

`current` 和 `previous` 含 `gmv, orders, buyers, basket, pieces`，分别为 GMV、去重订单数、去重人数、客单价和件数。对比区间紧邻且等长。四项 KPI 的 `delta` 是百分数值，例如 `12.5` 表示上升 12.5%；基期覆盖不足或分母为零取 `null`。每日趋势含 `date`、五项指标、`previousAvailable`、`previousGmv/previousOrders/previousBuyers/previousBasket`。汇总列表的 `BreakdownRow` 含维度项 `id, name`、五项指标、交易额占比 `share`（0 至 100）。`radar[].values` 对应上述五项指标，按渠道的各指标最大值归一化到 100。最新分区时间 `updatedAt` 为带时区的 ISO 时间戳。

日报默认 `date desc`，支持按日期及五项指标排序。页码从 1 开始，`pageSize` 范围 1 至 1000，`sortOrder` 为 `asc/desc`。每日列表按有命中记录的日期计数，趋势序列则覆盖每个请求日期。精确的字段与类型见 [交易分析类型](../src/domain/analytics.ts)。

## 数仓、订单与变更

`GridQuery` 的分页从 1 开始，`pageSize` 范围 1 至 100。列表支持公共参数 `page, pageSize, search?, sortBy?, sortOrder?`；按已返回的字段键排序。元数据查询和单笔订单查询无需分页。列表返回 `{fields, rows, total, page, pageSize}`，每个字段含 `key, label, type` 与可选 `description, format`。行对象按 `key` 取值，允许字符串、数字或 null。请求页超出时，Mock 返回最后一页，界面使用响应中的页码。

| 路径                  | 附加参数                                                                  | 成功响应与业务含义                                                                                |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/warehouse/catalog`  | `{}`                                                                      | `{tables, layers, options, range}`；表描述包含物理表名 ID、显示名、所属层、粒度、分区、上游与字段 |
| `/warehouse/rows`     | `table, start?, end?`                                                     | 指定表的分页投影；`table` 使用目录返回的完整表 ID                                                 |
| `/warehouse/orders`   | `start?, end?, channel?, region?, category?, product?, status?, orderId?` | 订单页，每行一单。按品类或 SKU 筛选时行金额和件数仅计算命中商品                                   |
| `/warehouse/order`    | `{orderId}`                                                               | `{row, fields, items, itemFields}`，整单订单头及全部商品明细                                      |
| `/warehouse/changes`  | `start?, end?, operation?, orderId?`                                      | CDC 事件页，包含事件时间、业务键、操作及变更前后状态                                              |
| `/warehouse/versions` | `start?, end?, orderId?` 或 `asOf, orderId?`                              | 版本起始日期范围或指定日期有效快照，区间为左闭右开                                                |

状态枚举为 `CREATED, PAID, SHIPPED, COMPLETED, CANCELLED`，变更操作为 `INSERT, UPDATE, DELETE`。例如 `{"table":"ads.ads_order_stats","start":"2026-11-20","end":"2026-11-20","page":1,"pageSize":10}` 可取指定日期的 ADS 汇总。当前版本的失效日期为 `9999-12-31`。更多字段、历史边界与各表来源见 [数仓映射](./warehouse-mapping.md) 和 [数仓类型](../src/domain/warehouse.ts)。

## 用户画像

| 路径               | 请求体                                                  | 成功响应的 data                                                                          |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/portrait/cohort` | `{asOf, days, group, region?, search?, page, pageSize}` | `{start, end, people, repeatPeople, amount, average, categories, rows, page, pageSize}`  |
| `/portrait/tags`   | `{asOf, days, id}`                                      | `{id, start, end, dt, tags}`；每条标签含 `field, label, value, source` 与可选单位 `unit` |

统计日 `asOf` 计入窗口，`days` 可选 30、60、90。`group` 为 `all/once/repeat`，后两者分别对应窗口下单一次和至少两次。地域按窗口常用地域筛选，`search` 匹配会员 ID；分页从 1 开始，每页最多 100 人。`people` 是过滤后总人数，`repeatPeople` 为其中复购人数，`amount` 与 `average` 分别为总额与人均金额，`categories[].people` 为以该品类为首选的人数。点击行时传 `rows[].id` 和相同窗口读取标签。完整会员行定义见 [画像类型](../src/domain/portrait.ts)。

## Text2SQL

| 路径                 | 请求体                                                                        | 成功响应的 data                                             |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `/textsql/workspace` | `{}`                                                                          | `{examples, sources, rowLimit, history, favorites}`         |
| `/textsql/generate`  | `{question, previous}`，首轮 `previous: null`，追问传上一轮的 `question, sql` | `SqlContext`                                                |
| `/textsql/validate`  | `{sql}`                                                                       | `{valid, message}`                                          |
| `/textsql/execute`   | `{query: SqlContext, confirmed: true}`                                        | `{columns, rows, elapsedMs, truncated}`，行数组与列顺序一致 |
| `/textsql/favorite`  | `{query: SqlContext, saved: boolean}`                                         | 更新后的当前用户收藏数组                                    |

`SqlContext` 含 `id, question, sql, explanation, source, createdAt`。执行和收藏使用编辑器当前 SQL。Mock 数据源、SQL 方言、执行限制、历史与收藏保存方式，以及生产服务端需落实的校验和授权见 [Text2SQL 接入说明](./text2sql.md)。
