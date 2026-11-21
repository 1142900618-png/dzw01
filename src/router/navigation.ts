import {
  ChartNoAxesCombined,
  Layers3,
  Rows3,
  GitPullRequest,
  PanelsTopLeft,
  UsersRound,
  Sparkles,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { Permission } from '@/domain/session'

export interface NavItem {
  path: string
  title: string
  icon: Component
  view: () => Promise<{ default: Component }>
  permission: Permission
  group: string
}
export const navigation: NavItem[] = [
  {
    path: '/',
    view: () => import('@/views/DashboardView.vue'),
    title: '经营总览',
    icon: PanelsTopLeft,
    permission: 'dashboard:view',
    group: '数据分析',
  },
  {
    path: '/dimensions',
    view: () => import('@/views/DimensionsView.vue'),
    title: '维度分析',
    icon: ChartNoAxesCombined,
    permission: 'dimensions:view',
    group: '数据分析',
  },
  {
    path: '/portrait',
    view: () => import('@/views/PortraitView.vue'),
    title: '用户画像',
    icon: UsersRound,
    permission: 'portrait:view',
    group: '数据分析',
  },
  {
    path: '/warehouse',
    view: () => import('@/views/WarehouseView.vue'),
    title: '分层数据探查',
    icon: Layers3,
    permission: 'warehouse:view',
    group: '数据仓库',
  },
  {
    path: '/changes',
    view: () => import('@/views/ChangesView.vue'),
    title: '变更追踪',
    icon: GitPullRequest,
    permission: 'changes:view',
    group: '数据仓库',
  },
  {
    path: '/details',
    view: () => import('@/views/DetailsView.vue'),
    title: '明细查询',
    icon: Rows3,
    permission: 'details:view',
    group: '数据仓库',
  },
  {
    path: '/textsql',
    view: () => import('@/views/TextSqlView.vue'),
    title: 'Text2SQL 工作台',
    icon: Sparkles,
    permission: 'sql:view',
    group: '智能工具',
  },
]
