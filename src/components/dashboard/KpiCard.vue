<script setup lang="ts">
import { computed, useId } from 'vue'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ShoppingBag,
  UsersRound,
  WalletCards,
  Minus,
} from 'lucide-vue-next'
import type { MetricKey } from '@/domain/analytics'

const props = defineProps<{
  metric: MetricKey
  label: string
  display: string
  change: number | null
  series: number[]
}>()
const icons = { gmv: Banknote, orders: ShoppingBag, buyers: UsersRound, basket: WalletCards }
const gradientId = 'spark-' + useId().replace(/[^\w-]/g, '')
// Smoothed paths share the same end points as the underlying daily observations.
const spark = computed(() => {
  const min = Math.min(...props.series)
  const max = Math.max(...props.series)
  const points = props.series.map(
    (v, i, a) =>
      [
        a.length === 1 ? 37 : (i / (a.length - 1)) * 76 + 1,
        28 - ((v - min) / (max - min || 1)) * 23,
      ] as const,
  )
  if (!points.length) return ''
  let path = 'M' + points[0].join(' ')
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const mid = (a[0] + b[0]) / 2
    path += ' C' + [mid, a[1], mid, b[1], b[0], b[1]].join(' ')
  }
  return path
})
</script>

<template>
  <article class="kpi-card" :class="'kpi-' + metric">
    <div class="kpi-caption">
      <span class="kpi-symbol"
        ><component :is="icons[metric]" :size="17" :stroke-width="1.9"
      /></span>
      <h2>{{ label }}</h2>
    </div>
    <div class="kpi-number" :title="display">{{ display }}</div>
    <div class="kpi-footer">
      <span
        v-if="change !== null"
        class="kpi-delta"
        :class="change < 0 ? 'fall' : change > 0 ? 'rise' : 'steady'"
      >
        <component
          :is="change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus"
          :size="13"
          :stroke-width="2.4"
        />
        {{ Math.abs(change).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }}%
      </span>
      <span v-else class="kpi-baseline">无可比值</span>
      <span class="kpi-baseline">较上期</span>
      <svg
        v-if="series.length > 1"
        class="kpi-spark"
        viewBox="0 0 78 34"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop stop-color="currentColor" stop-opacity=".21" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="spark + ' L77 34 L1 34 Z'" :fill="'url(#' + gradientId + ')'" />
        <path
          :d="spark"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </article>
</template>
