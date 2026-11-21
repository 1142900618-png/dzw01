<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, ChevronsUpDown, Database, X } from 'lucide-vue-next'
import { navigation } from '@/router/navigation'
import { useSessionStore } from '@/stores/session'
import { isMock } from '@/api/client'
import { roleLabels, type Role, type Permission } from '@/domain/session'

defineProps<{ mobile?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const session = useSessionStore(),
  route = useRoute(),
  router = useRouter()
const menu = ref<HTMLDialogElement>(),
  switching = ref(false),
  error = ref('')
const groups = computed(() =>
  [...new Set(navigation.map((x) => x.group))]
    .map((group) => ({
      group,
      items: navigation.filter((item) => item.group === group && session.can(item.permission)),
    }))
    .filter((g) => g.items.length),
)
async function switchRole(role: Role) {
  switching.value = true
  error.value = ''
  try {
    await session.switchRole(role)
    if (route.meta.permission && !session.can(route.meta.permission as Permission))
      await router.replace('/')
    else if (route.name === 'forbidden') await router.replace('/')
    menu.value?.close()
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '切换失败'
  } finally {
    switching.value = false
  }
}
</script>
<template>
  <div class="rail-inner">
    <div class="rail-brand">
      <img src="/brand.svg" width="38" height="38" alt="" />
      <div><strong>太一数科</strong><small>Taiyi Analytics</small></div>
      <button
        v-if="mobile"
        class="icon-btn mobile-close"
        aria-label="关闭导航"
        @click="emit('close')"
      >
        <X :size="17" />
      </button>
    </div>
    <nav aria-label="主导航" class="rail-nav">
      <div v-for="section in groups" :key="section.group" class="nav-group">
        <p>{{ section.group }}</p>
        <RouterLink
          v-for="item in section.items"
          :key="item.path"
          :to="item.path"
          :class="['nav-item', { active: route.path === item.path }]"
          :aria-current="route.path === item.path ? 'page' : undefined"
          @click="emit('close')"
          ><component :is="item.icon" :size="18" :stroke-width="1.75" /><span>{{
            item.title
          }}</span></RouterLink
        >
      </div>
    </nav>
    <div class="rail-bottom">
      <div class="workspace-tile">
        <div class="workspace-icon"><Database :size="18" /></div>
        <div><small>当前工作空间</small><strong>优品购电商数仓</strong></div>
      </div>
      <button
        class="account"
        :disabled="!isMock || !session.ready"
        aria-haspopup="dialog"
        @click="menu?.showModal()"
      >
        <span class="avatar">{{ session.user.initials || '—' }}</span><span class="account-copy"
          ><strong>{{ session.user.name || '工作台用户' }}</strong
          ><small>{{ roleLabels[session.role] }}</small></span
        ><ChevronsUpDown v-if="isMock" :size="15" class="account-more" />
      </button>
    </div>
    <dialog
      ref="menu"
      class="app-dialog role-dialog"
      @click="
        (e) => {
          if (e.target === menu) menu.close()
        }
      "
    >
      <div class="dialog-head">
        <h2>切换联调角色</h2>
        <button aria-label="关闭" class="icon-btn" @click="menu?.close()"><X :size="18" /></button>
      </div>
      <p class="subtle">选择身份后，导航和查询权限会同步更新。</p>
      <button
        v-for="(label, role) in roleLabels"
        :key="role"
        :disabled="switching"
        class="role-choice"
        @click="switchRole(role)"
      >
        <span
          ><strong>{{ label }}</strong
          ><small>{{
            role === 'admin'
              ? '查看全部页面，执行只读 SQL'
              : role === 'analyst'
                ? '分析经营与画像，查询明细并执行 SQL'
                : '浏览经营总览与维度分析'
          }}</small></span
        ><Check v-if="session.role === role" :size="17" />
      </button>
      <p v-if="error" role="alert">{{ error }}</p>
    </dialog>
  </div>
</template>
