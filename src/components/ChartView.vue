<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import {
  AriaComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

echarts.use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  RadarChart,
  GridComponent,
  RadarComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
  GraphicComponent,
  AriaComponent,
])

const props = defineProps<{ option: EChartsOption; ariaLabel?: string }>()
const emit = defineEmits<{
  chartClick: [event: { name: string; dataIndex: number; seriesName: string; value: unknown }]
}>()
const root = ref<HTMLElement>()
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined

function paint() {
  if (!root.value || !root.value.clientWidth || !root.value.clientHeight) return
  if (!chart) {
    chart = echarts.init(root.value, undefined, { renderer: 'canvas' })
    chart.on('click', (event) =>
      emit('chartClick', {
        name: event.name,
        dataIndex: event.dataIndex,
        seriesName: event.seriesName ?? '',
        value: event.value,
      }),
    )
  }

  const style = getComputedStyle(root.value)
  const textColor = style.getPropertyValue('--text').trim() || '#172238'
  const panelColor = style.getPropertyValue('--panel').trim() || '#ffffff'
  const lineColor = style.getPropertyValue('--line').trim() || '#e3e8ef'
  const sourceTooltip = props.option.tooltip
  chart.setOption(
    {
      ...props.option,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: style.fontFamily, color: textColor, ...props.option.textStyle },
      tooltip:
        sourceTooltip && !Array.isArray(sourceTooltip)
          ? {
              confine: true,
              backgroundColor: panelColor,
              borderColor: lineColor,
              padding: [8, 12],
              ...sourceTooltip,
              textStyle: {
                fontFamily: style.fontFamily,
                color: textColor,
                fontSize: 12,
                ...sourceTooltip.textStyle,
              },
            }
          : sourceTooltip,
    },
    { notMerge: true, lazyUpdate: false },
  )
}

onMounted(() => {
  paint()
  if (!root.value) return
  observer = new ResizeObserver(() => {
    if (chart) chart.resize()
    else paint()
  })
  observer.observe(root.value)
  themeObserver = new MutationObserver(paint)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  })
})
watch(
  () => props.option,
  () => nextTick(paint),
  { deep: true },
)
onBeforeUnmount(() => {
  observer?.disconnect()
  themeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="root" class="chart-canvas" role="img" :aria-label="ariaLabel || '数据图表'"></div>
</template>

<style scoped>
.chart-canvas {
  width: 100%;
  height: 100%;
  min-width: 0;
}
</style>
