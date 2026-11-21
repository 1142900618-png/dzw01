<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChartNoAxesColumn, ChartSpline, ChevronDown } from 'lucide-vue-next'
import type { EChartsOption } from 'echarts'
import type { MetricKey, TrendPoint } from '@/domain/analytics'
import ChartView from '@/components/ChartView.vue'

const props = defineProps<{ points: TrendPoint[] }>()
const emit = defineEmits<{ day: [date: string, previous: boolean] }>()
const metric = ref<MetricKey>('gmv')
const mode = ref<'line' | 'bar'>('line')
const visible = ref({ current: true, previous: true })
const root = ref<HTMLElement>()
const muted = ref('#8491a6')
const grid = ref('#e6edf5')
let observer: MutationObserver | undefined
const metricOptions = {
  gmv: { label: '交易总额', unit: '万元', previous: 'previousGmv' },
  orders: { label: '订单数', unit: '单', previous: 'previousOrders' },
  buyers: { label: '下单人数', unit: '人', previous: 'previousBuyers' },
  basket: { label: '客单价', unit: '元', previous: 'previousBasket' },
} as const
const detail = computed(() => metricOptions[metric.value])
const option = computed<EChartsOption>(() => {
  const isGmv = metric.value === 'gmv'
  const convert = (v: number) => (isGmv ? +(v / 10000).toFixed(4) : v)
  const series = [
    {
      key: 'current' as const,
      name: '本期',
      color: '#3777f5',
      data: props.points.map((r) => convert(r[metric.value])),
    },
    {
      key: 'previous' as const,
      name: '上期',
      color: '#29b6ae',
      data: props.points.map((r) =>
        r.previousAvailable ? convert(r[detail.value.previous]) : '-',
      ),
    },
  ]
  return {
    animationDuration: 320,
    aria: { enabled: true },
    grid: { top: 8, left: 4, right: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      axisPointer: { type: 'line', lineStyle: { type: 'dashed', color: '#91a4c0' } },
      valueFormatter: (v) =>
        v === '-' || v == null || !Number.isFinite(Number(v))
          ? '无可比值'
          : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) +
            ' ' +
            detail.value.unit,
    },
    xAxis: {
      type: 'category',
      boundaryGap: mode.value === 'bar',
      data: props.points.map((p) => p.date.slice(5).replace('-', '/')),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: muted.value,
        margin: 13,
        fontSize: 11,
        hideOverlap: true,
        showMaxLabel: true,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 4,
      axisLabel: {
        color: muted.value,
        fontSize: 11,
        margin: 12,
        formatter: (v: number) =>
          Number.isInteger(v) ? v.toLocaleString('zh-CN') : String(+v.toFixed(2)),
      },
      splitLine: { lineStyle: { type: 'dashed', color: grid.value } },
    },
    series: series
      .filter((s) => visible.value[s.key])
      .map((s) => {
        if (mode.value === 'bar')
          return {
            type: 'bar' as const,
            name: s.name,
            data: s.data,
            barMaxWidth: 22,
            itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
          }
        return {
          type: 'line' as const,
          name: s.name,
          data: s.data,
          smooth: 0.32,
          symbol: 'circle',
          symbolSize: s.key === 'current' ? 6 : 4.5,
          showSymbol: props.points.length <= 15,
          itemStyle: { color: s.color, borderColor: '#fff', borderWidth: 1.4 },
          lineStyle: {
            width: s.key === 'current' ? 3 : 2.2,
            color: s.color,
            type: s.key === 'current' ? ('solid' as const) : ('dashed' as const),
          },
          areaStyle:
            s.key === 'current'
              ? {
                  color: {
                    type: 'linear' as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: 'rgba(64,132,248,.32)' },
                      { offset: 1, color: 'rgba(64,132,248,.025)' },
                    ],
                  },
                }
              : undefined,
          emphasis: { focus: 'series' as const },
          z: s.key === 'current' ? 3 : 2,
        }
      }),
  }
})
function toggle(key: 'previous' | 'current') {
  if (visible.value[key] && !visible.value[key === 'current' ? 'previous' : 'current']) return
  visible.value[key] = !visible.value[key]
}
function colors() {
  if (!root.value) return
  const style = getComputedStyle(root.value)
  muted.value = style.getPropertyValue('--muted').trim()
  grid.value = style.getPropertyValue('--line').trim()
}
function choosePoint(click: { dataIndex: number; seriesName: string }) {
  const point = props.points[click.dataIndex]
  const previous = click.seriesName === '上期'
  if (point && (!previous || point.previousAvailable)) emit('day', point.date, previous)
}
onMounted(() => {
  colors()
  observer = new MutationObserver(colors)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section ref="root" class="dash-panel trend-panel" aria-labelledby="trend-title">
    <div class="chart-panel-header">
      <h2 id="trend-title"><i class="section-mark"></i>交易趋势</h2>
      <div class="trend-controls">
        <label class="dash-select-wrap trend-metric"
          ><select v-model="metric" aria-label="趋势指标">
            <option v-for="(v, k) in metricOptions" :key="k" :value="k">
              {{ v.label }}
            </option></select
          ><ChevronDown :size="12"
        /></label>
        <div class="chart-toggle" aria-label="趋势图类型">
          <button
            title="折线图"
            aria-label="折线图"
            :aria-pressed="mode === 'line'"
            @click="mode = 'line'"
          >
            <ChartSpline :size="15" />
          </button>
          <button
            title="柱状图"
            aria-label="柱状图"
            :aria-pressed="mode === 'bar'"
            @click="mode = 'bar'"
          >
            <ChartNoAxesColumn :size="15" />
          </button>
        </div>
      </div>
    </div>
    <div class="trend-meta">
      <span>单位：{{ detail.unit }}</span>
      <div class="trend-key">
        <button :aria-pressed="visible.current" @click="toggle('current')"><i></i>本期</button>
        <button :aria-pressed="visible.previous" @click="toggle('previous')">
          <i class="comparison"></i>上期
        </button>
      </div>
    </div>
    <div class="trend-canvas">
      <ChartView
        :option="option"
        :aria-label="detail.label + '本期与上期趋势'"
        @chart-click="choosePoint"
      />
    </div>
  </section>
</template>
