import type { SqlSource } from '@/domain/textsql'

export const rowLimit = 100

export const examples = [
  '最近 7 天每天的 GMV 和订单量是多少？',
  '最近 30 天各渠道的 GMV 排名',
  '近 7 天成交额最高的商品品类',
]

// The first schema follows 主题计算 §10.3.1. The other two are derived Mock marts.
export const sources: SqlSource[] = [
  {
    table: 'ads.ads_order_stats',
    title: '当日交易综合统计',
    fields: ['calc_dt', 'order_total_amount', 'sku_cnt', 'order_user_cnt', 'order_cnt'],
  },
  {
    table: 'ads.channel_sales_daily',
    title: '渠道每日成交额',
    fields: ['calc_dt', 'channel_name', 'order_total_amount'],
  },
  {
    table: 'ads.category_sales_daily',
    title: '品类每日成交额',
    fields: ['calc_dt', 'category_name', 'order_total_amount'],
  },
]
