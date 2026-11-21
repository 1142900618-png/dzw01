<script setup lang="ts">
import { computed } from 'vue'
import { ChartPie } from 'lucide-vue-next'
import type { EChartsOption } from 'echarts'
import ChartView from '@/components/ChartView.vue'
import type { BreakdownRow } from '@/domain/analytics'

const props = defineProps<{ rows: BreakdownRow[]; total: number }>()
const emit = defineEmits<{ category: [id: string] }>()
const palette = ['#3779f4', '#26b7a9', '#9a7cec', '#f3ac4f', '#63b6ed', '#df88a6', '#84bd6a']
const money = computed(() =>
  props.total >= 10000
    ? {
        value: (props.total / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }),
        unit: '交易总额 · 万元',
      }
    : {
        value: props.total.toLocaleString('zh-CN', { maximumFractionDigits: 0 }),
        unit: '交易总额 · 元',
      },
)
const option = computed<EChartsOption>(() => ({
  animationDuration: 320,
  aria: { enabled: true },
  tooltip: {
    trigger: 'item',
    renderMode: 'richText',
    valueFormatter: (value) =>
      '¥' + Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
  },
  series: [
    {
      type: 'pie',
      name: '品类交易额',
      radius: ['69%', '91%'],
      center: ['50%', '50%'],
      label: { show: false },
      labelLine: { show: false },
      padAngle: props.rows.length > 1 ? 2 : 0,
      emphasis: { scale: true, scaleSize: 3 },
      data: props.rows.map((r, i) => ({
        name: r.name,
        value: r.gmv,
        itemStyle: { color: palette[i % palette.length], borderRadius: 2 },
      })),
    },
  ],
}))
function click(index: number) {
  const row = props.rows[index]
  if (row) emit('category', row.id)
}
</script>

<template>
  <section class="dash-panel category-panel" aria-labelledby="category-title">
    <div class="chart-panel-header">
      <h2 id="category-title"><i class="section-mark teal"></i>品类销售占比</h2>
      <ChartPie class="category-icon" :size="17" />
    </div>
    <div class="donut-plot">
      <ChartView
        :option="option"
        aria-label="各商品品类交易额占比，选择扇区下钻"
        @chart-click="click($event.dataIndex)"
      />
      <div class="donut-center" aria-hidden="true">
        <strong>{{ money.value }}</strong><small>{{ money.unit }}</small>
      </div>
    </div>
    <div class="category-list">
      <button
        v-for="(row, i) in rows"
        :key="row.id"
        :title="'查看' + row.name + '经营数据'"
        @click="emit('category', row.id)"
      >
        <i :style="{ backgroundColor: palette[i % palette.length] }"></i>
        <span>{{ row.name }}</span><b>{{ row.share.toFixed(1) }}%</b>
      </button>
    </div>
  </section>
</template>
