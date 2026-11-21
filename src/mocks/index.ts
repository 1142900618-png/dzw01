import { mockSessions } from './data/sessions'
import { readStorage, writeStorage } from '@/lib/storage'
import type { Permission, Role } from '@/domain/session'

// An entry with several permissions is shared metadata for the listed pages.
const access: Record<string, Permission[]> = {
  '/analytics/options': ['dashboard:view', 'dimensions:view', 'portrait:view'],
  '/analytics/overview': ['dashboard:view'],
  '/analytics/daily': ['dashboard:view'],
  '/analytics/breakdown': ['dimensions:view'],
  '/warehouse/catalog': ['warehouse:view', 'changes:view', 'details:view'],
  '/warehouse/rows': ['warehouse:view'],
  '/warehouse/orders': ['details:view'],
  '/warehouse/order': ['details:view'],
  '/warehouse/changes': ['changes:view'],
  '/warehouse/versions': ['changes:view'],
  '/portrait/cohort': ['portrait:view'],
  '/portrait/tags': ['portrait:view'],
  '/textsql/workspace': ['sql:view'],
  '/textsql/generate': ['sql:view'],
  '/textsql/validate': ['sql:view'],
  '/textsql/favorite': ['sql:view'],
  '/textsql/execute': ['sql:execute'],
}

let activeRole: Role = 'admin'
try {
  const stored = readStorage('taiyi:mock-role')
  if (stored && Object.hasOwn(mockSessions, stored)) activeRole = stored as Role
} catch {
  /* Storage may be disabled. */
}
function waitForMock(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const timeout = setTimeout(finish, 130)
    const abort = () => {
      clearTimeout(timeout)
      reject(new DOMException('请求已取消', 'AbortError'))
    }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}
export async function dispatchMock(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  await waitForMock(signal)
  if (path === '/session/switch') {
    const role = (body as { role?: Role })?.role
    if (!role || !Object.hasOwn(mockSessions, role)) throw new Error('无效的角色')
    activeRole = role
    writeStorage('taiyi:mock-role', role)
  }
  const session = mockSessions[activeRole]
  if (path === '/session/me' || path === '/session/switch') return structuredClone(session)
  const allowed = access[path]
  if (!allowed) throw new Error('未找到接口')
  if (!allowed.some((key) => session.permissions.includes(key)))
    throw new Error('当前角色无权访问此接口')
  if (path.startsWith('/analytics/'))
    return (await import('./analytics')).handleAnalytics(path, body)
  if (path.startsWith('/warehouse/')) return (await import('./warehouse')).warehouseMock(path, body)
  if (path.startsWith('/portrait/')) return (await import('./portrait')).portraitMock(path, body)
  if (path.startsWith('/textsql/')) return (await import('./textsql')).textsqlMock(path, body)
  throw new Error('未找到接口')
}
