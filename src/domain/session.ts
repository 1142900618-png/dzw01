export const roleLabels = {
  admin: '数据管理员',
  analyst: '数据分析师',
  viewer: '看板访客',
} as const
export type Role = keyof typeof roleLabels
export type Permission =
  | 'dashboard:view'
  | 'dimensions:view'
  | 'portrait:view'
  | 'warehouse:view'
  | 'details:view'
  | 'changes:view'
  | 'sql:view'
  | 'sql:execute'
export interface Session {
  user: { id: string; name: string; initials: string }
  role: Role
  permissions: Permission[]
}
