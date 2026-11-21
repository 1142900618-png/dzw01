import { createRouter, createWebHashHistory } from 'vue-router'
import { navigation } from './navigation'
import { useSessionStore } from '@/stores/session'
import type { Permission } from '@/domain/session'

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    ...navigation.map((item) => ({
      path: item.path,
      name: item.path === '/' ? 'dashboard' : item.path.slice(1),
      component: item.view,
      meta: { title: item.title, group: item.group, permission: item.permission },
    })),
    {
      path: '/forbidden',
      name: 'forbidden',
      component: () => import('@/views/StatusView.vue'),
      meta: { title: '访问受限' },
    },
    {
      path: '/unavailable',
      name: 'unavailable',
      component: () => import('@/views/StatusView.vue'),
      meta: { title: '服务连接异常' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'missing',
      component: () => import('@/views/StatusView.vue'),
      meta: { title: '页面未找到' },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})
router.beforeEach(async (to) => {
  const required = to.meta.permission as Permission | undefined
  if (!required) return true
  const session = useSessionStore()
  await session.load()
  if (!session.ready) return { name: 'unavailable', query: { from: to.fullPath }, replace: true }
  if (!session.can(required)) return { name: 'forbidden', replace: true }
  return true
})
router.afterEach((to) => {
  document.title = `${to.meta.title ?? '工作台'} · 太一数科`
})
