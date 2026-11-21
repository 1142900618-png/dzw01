import { defineStore } from 'pinia'
import { request, isMock } from '@/api/client'
import type { Permission, Session, Role } from '@/domain/session'

let pending: Promise<void> | null = null
export const useSessionStore = defineStore('session', {
  state: () => ({
    user: { id: '', name: '', initials: '' },
    role: 'viewer' as Role,
    permissions: [] as Permission[],
    ready: false,
    error: '',
  }),
  actions: {
    can(permission: Permission) {
      return this.permissions.includes(permission)
    },
    async load(force = false) {
      if (this.ready && !force) return
      if (pending) return pending
      this.error = ''
      pending = request<Session>('/session/me')
        .then((data) => {
          if (!data?.user?.id || !Array.isArray(data.permissions))
            throw new Error('会话响应缺少用户或权限')
          this.$patch({ ...data, ready: true, error: '' })
        })
        .catch((error: Error) => {
          this.error = error.message
          this.ready = false
        })
        .finally(() => {
          pending = null
        })
      await pending
    },
    async switchRole(role: Role) {
      if (!isMock) return
      const next = await request<Session>('/session/switch', { role })
      this.$patch({ ...next, ready: true, error: '' })
    },
  },
})
