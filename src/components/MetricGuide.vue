<script setup lang="ts">
import { ref } from 'vue'
import { X, BookOpen } from 'lucide-vue-next'
const dialog = ref<HTMLDialogElement>()
defineExpose({ open: () => dialog.value?.showModal() })
</script>
<template>
  <dialog
    ref="dialog"
    class="app-dialog metric-guide"
    @click="
      (e) => {
        if (e.target === dialog) dialog.close()
      }
    "
  >
    <div class="dialog-head">
      <span class="guide-icon"><BookOpen :size="20" /></span>
      <h2>指标口径</h2>
      <button class="icon-btn" aria-label="关闭指标口径" @click="dialog?.close()">
        <X :size="18" />
      </button>
    </div>
    <p class="subtle">优品购 · 交易主题</p>
    <dl>
      <dt>成交总额（GMV）</dt>
      <dd>按下单日期汇总订单行成交金额，单位为人民币元，采用数仓的下单口径。</dd>
      <dt>订单数 / 下单人数</dt>
      <dd>在筛选窗口内分别对订单编号、会员编号去重，同一会员跨日下单只计一次。</dd>
      <dt>客单价</dt>
      <dd>成交总额 ÷ 去重下单人数。笔单价则按去重订单数作为分母。</dd>
      <dt>环比</dt>
      <dd>与当前窗口紧邻的前一个等长窗口比较，沿用相同维度筛选。基期为零时显示无可比值。</dd>
    </dl>
    <p class="guide-ref">依据《太一数科平台之需求分析》第 6 章及《主题计算》第 10 章</p>
  </dialog>
</template>
