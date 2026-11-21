<script setup lang="ts">
import { ref, watch, onErrorCaptured } from 'vue'
import { useRoute } from 'vue-router'
import { Menu, PanelLeft, ChevronRight, Moon, Sun, BookOpen, CircleAlert } from 'lucide-vue-next'
import SidebarNav from '@/components/SidebarNav.vue'
import MetricGuide from '@/components/MetricGuide.vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { isMock } from '@/api/client'
const route = useRoute(),
  prefs = usePreferencesStore(),
  session = useSessionStore()
const mobile = ref<HTMLDialogElement>(),
  guide = ref<InstanceType<typeof MetricGuide>>()
const main = ref<HTMLElement>()
const crashed = ref(false),
  version = ref(0)
watch(
  () => route.fullPath,
  () => {
    crashed.value = false
    mobile.value?.close()
  },
)
onErrorCaptured(() => {
  crashed.value = true
  return false
})
function retry() {
  version.value++
  crashed.value = false
}
</script>
<template>
  <a href="#main-content" class="skip" @click.prevent="main?.focus()">跳至主内容</a>
  <aside class="side-rail"><SidebarNav /></aside>
  <dialog
    ref="mobile"
    class="mobile-nav"
    aria-label="工作台导航"
    @click="
      (e) => {
        if (e.target === mobile) mobile.close()
      }
    "
  >
    <SidebarNav mobile @close="mobile?.close()" />
  </dialog>
  <div class="app-body">
    <header class="topbar">
      <div class="crumbs">
        <button class="icon-btn mobile-toggle" aria-label="打开导航" @click="mobile?.showModal()">
          <Menu :size="20" /></button
        ><PanelLeft class="crumb-icon" :size="17" /><span>工作台</span
        ><ChevronRight :size="13" /><strong>{{ route.meta.title || '经营总览' }}</strong>
      </div>
      <div class="header-tools">
        <span class="source-status"><i></i>{{ isMock ? 'Mock 数据源' : '接口数据源' }}</span
        ><span class="tool-divider"></span
        ><button class="icon-btn" title="指标口径" aria-label="查看指标口径" @click="guide?.open()">
          <BookOpen :size="18" /></button
        ><button
          class="icon-btn"
          :title="prefs.dark ? '切换浅色模式' : '切换暗黑模式'"
          :aria-label="prefs.dark ? '切换浅色模式' : '切换暗黑模式'"
          @click="prefs.dark = !prefs.dark"
        >
          <Sun v-if="prefs.dark" :size="18" /><Moon v-else :size="18" />
        </button>
      </div>
    </header>
    <main id="main-content" ref="main" tabindex="-1" class="main-content">
      <div v-if="crashed" role="alert" class="panel status-page">
        <CircleAlert :size="28" />
        <h2>页面加载异常</h2>
        <button class="btn" @click="retry">重新加载</button>
      </div>
      <RouterView v-else :key="session.user.id + '-' + version" />
    </main>
  </div>
  <MetricGuide ref="guide" />
</template>
