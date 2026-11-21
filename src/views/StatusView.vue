<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ShieldAlert, SearchX, Unplug } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session'
const route = useRoute(),
  router = useRouter(),
  session = useSessionStore(),
  pending = ref(false)
const issue = computed(() =>
  route.name === 'forbidden'
    ? {
        icon: ShieldAlert,
        title: '此页面需要其他访问权限',
        description: '可通过左侧导航进入当前角色有权访问的页面。',
      }
    : route.name === 'unavailable'
      ? {
          icon: Unplug,
          title: '暂时无法连接数据服务',
          description: session.error || '请检查接口地址和网络连接后重试。',
        }
      : {
          icon: SearchX,
          title: '没有找到这个页面',
          description: '请核对链接，或返回经营总览继续浏览。',
        },
)
async function retry() {
  pending.value = true
  try {
    await session.load(true)
    if (session.ready) {
      const target = route.query.from
      await router.replace(
        typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
          ? target
          : '/',
      )
    }
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <section class="panel status-page">
    <component :is="issue.icon" :size="38" />
    <h1>{{ issue.title }}</h1>
    <p>{{ issue.description }}</p>
    <button
      v-if="route.name === 'unavailable'"
      class="btn primary"
      :disabled="pending"
      @click="retry"
    >
      {{ pending ? '正在连接…' : '重新连接' }}</button><RouterLink v-else class="btn" to="/"
      >返回总览</RouterLink
    >
  </section>
</template>
