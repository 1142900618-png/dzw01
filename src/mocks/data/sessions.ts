import type { Permission, Role, Session } from '@/domain/session'

const publicViews: Permission[] = ['dashboard:view', 'dimensions:view']
const analysisViews: Permission[] = [
  ...publicViews,
  'portrait:view',
  'details:view',
  'warehouse:view',
  'sql:view',
]
export const mockSessions: Record<Role, Session> = {
  admin: {
    user: { id: 'mock-admin', name: '林予安', initials: '林' },
    role: 'admin',
    permissions: [...analysisViews, 'changes:view', 'sql:execute'],
  },
  analyst: {
    user: { id: 'mock-analyst', name: '陈思远', initials: '陈' },
    role: 'analyst',
    permissions: [...analysisViews, 'sql:execute'],
  },
  viewer: {
    user: { id: 'mock-viewer', name: '周宁', initials: '周' },
    role: 'viewer',
    permissions: publicViews,
  },
}
