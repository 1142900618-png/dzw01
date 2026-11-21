import type { DataField, TableDescriptor, WarehouseCatalog } from '../../domain/warehouse'

const f = (
  key: string,
  label: string,
  type = 'STRING',
  format?: DataField['format'],
): DataField => ({ key, label, type, format })
const money = (key: string, label: string) => f(key, label, 'DECIMAL(16,2)', 'currency')
const count = (key: string, label: string) => f(key, label, 'BIGINT', 'number')

const sn = f('sn', '订单编号')
const member = f('member_id', '会员编号')
const created = f('create_time', '创建时间')
const dt = f('dt', '分区日期')
const status = f('order_status', '订单状态', 'STRING', 'status')
const moneyFlow = money('flow_price', '订单金额')
const orderFields = [
  sn,
  member,
  created,
  status,
  moneyFlow,
  f('client_type', '来源渠道'),
  count('goods_num', '商品件数'),
]
const itemKey = f('order_sn', '订单编号')
const sku = f('sku_id', '商品编号')
export const itemFields = [
  f('id', '明细编号'),
  itemKey,
  member,
  sku,
  created,
  count('sku_num', '商品件数'),
  money('total_amount', '订单行金额'),
  dt,
]
export const versionFields = [
  sn,
  status,
  f('zip_start_dt', '生效日期'),
  f('zip_end_dt', '失效日期'),
  member,
  moneyFlow,
]
export const changeFields = [
  f('event_at', '采集时间'),
  f('operation', '变更类型', 'STRING', 'operation'),
  sn,
  f('before_status', '变更前状态', 'STRING', 'status'),
  f('after_status', '变更后状态', 'STRING', 'status'),
  f('event_id', '事件编号'),
]
export const detailFields = [
  sn,
  created,
  member,
  moneyFlow,
  count('goods_num', '商品件数'),
  f('channel_name', '渠道'),
  f('region_name', '地区'),
  status,
]
export const lineFields = [
  sku,
  f('sku_name', '商品'),
  f('category_name', '品类'),
  count('sku_num', '数量'),
  money('total_amount', '小计'),
]
export const warehouseLayers: WarehouseCatalog['layers'] = [
  { id: 'ODS', name: '原始数据层', description: '源系统增量采集' },
  { id: 'DWD', name: '明细数据层', description: '清洗后的原子事实' },
  { id: 'DWS', name: '汇总数据层', description: '主题维度聚合' },
  { id: 'ADS', name: '应用数据层', description: '面向分析的指标' },
]
export const warehouseTables: TableDescriptor[] = [
  {
    id: 'ods.ods_yjx_order_inc',
    name: '订单增量表',
    layer: 'ODS',
    grain: '订单 × 变更日期',
    partition: 'dt / 按日',
    description: '按日抽取新增和修改的源订单，保留当天最后一次变更后的快照。',
    upstream: ['MySQL · order'],
    fields: [...orderFields, dt],
  },
  {
    id: 'ods.ods_yjx_order_item_inc',
    name: '订单商品增量表',
    layer: 'ODS',
    grain: '订单商品行',
    partition: 'dt / 按日',
    description: '采集订单行的商品、数量和实际金额，为明细事实表提供输入。',
    upstream: ['MySQL · order_item'],
    fields: [
      f('id', '明细编号'),
      itemKey,
      created,
      sku,
      f('category_id', '品类编号'),
      count('num', '商品件数'),
      money('flow_price', '实际金额'),
      dt,
    ],
  },
  {
    id: 'dwd.dwd_yjx_order_item_inc',
    name: '订单明细事实表',
    layer: 'DWD',
    grain: '订单商品行',
    partition: 'dt / 按日',
    description: '关联订单与商品行，提供用户、SKU、数量及最终订单行金额。',
    upstream: ['ods.ods_yjx_order_inc', 'ods.ods_yjx_order_item_inc'],
    fields: itemFields,
  },
  {
    id: 'dwd.dwd_yjx_order_zip',
    name: '订单事实拉链表',
    layer: 'DWD',
    grain: '订单 × 状态版本',
    partition: '非分区表',
    description: '按变更日期维护订单状态，生效日包含、失效日排除，9999-12-31 表示当前版本。',
    upstream: ['ods.ods_yjx_order_inc'],
    fields: versionFields,
  },
  {
    id: 'dws.dws_order_user_sku_order_1d',
    name: '用户商品日汇总表',
    layer: 'DWS',
    grain: '日期 × 会员 × SKU',
    partition: 'dt / 按日',
    description: '按会员和 SKU 汇总每日订单次数、商品件数及最终金额，并关联商品维度。',
    upstream: ['dwd.dwd_yjx_order_item_inc', 'dim.dim_sku_full'],
    fields: [
      dt,
      member,
      sku,
      f('sku_name', '商品名称'),
      f('category1_name', '一级品类'),
      count('order_cnt_1d', '订单数'),
      count('order_num_1d', '商品件数'),
      money('order_total_amount_1d', '最终总金额'),
    ],
  },
  {
    id: 'ads.ads_order_stats',
    name: '当日交易综合统计表',
    layer: 'ADS',
    grain: '统计日期',
    partition: '非分区表',
    description: '汇总每日交易额、商品件数、下单人数及去重订单数。',
    upstream: ['dws.dws_order_user_sku_order_1d', 'dwd.dwd_yjx_order_zip'],
    fields: [
      f('calc_dt', '统计日期'),
      money('order_total_amount', '订单总金额'),
      count('sku_cnt', '下单总件数'),
      count('order_user_cnt', '下单总人数'),
      count('order_cnt', '下单总次数'),
    ],
  },
]
