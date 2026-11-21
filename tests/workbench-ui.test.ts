// @vitest-environment jsdom
import { createRequire } from 'node:module'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App as VueApplication } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/router'
import { useSessionStore } from '@/stores/session'
import { analyticsOptions, getOrderFacts } from '@/mocks/data/analyticsFacts'

// JSDOM exercises the Vue controls, requests, guards and real SQLite results.
// Rasterization and native dialog presentation belong to browser-level checks.
vi.mock('@/components/ChartView.vue', () => ({
  default: { name: 'ChartStub', props: ['option', 'ariaLabel'], render: () => null },
}))
vi.mock('sql.js/dist/sql-wasm-browser.wasm?url', () => ({
  default: createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'),
}))
vi.mock('sql.js', () => ({ default: createRequire(import.meta.url)('sql.js') }))

let app: VueApplication
let host: HTMLElement
const wait = { timeout: 8000, interval: 25 }

function element<T extends HTMLElement>(selector: string): T {
  const found = host.querySelector<T>(selector)
  if (!found) throw new Error('未找到页面元素 ' + selector)
  return found
}

beforeAll(() => {
  window.scrollTo = () => {}
  HTMLElement.prototype.scrollTo = () => {}
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
beforeEach(async () => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  setActivePinia(pinia)
  // The page and the in-process API share identity, including across tests.
  await useSessionStore(pinia).switchRole('admin')
  await router.push('/')
  app = createApp(App)
  app.use(pinia).use(router).mount(host)
  await router.isReady()
})
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('工作台界面联调（模拟 DOM）', () => {
  it('将看板所选渠道与日报日期带入明细，并显示同一批订单', async () => {
    const channel = analyticsOptions.channels[0]
    await vi.waitFor(() => expect(element('.daily-scroll tbody .link-action')).toBeTruthy(), wait)
    const select = element<HTMLSelectElement>('select[aria-label="渠道"]')
    select.value = channel.id
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.channel).toBe(channel.id)
      expect(element('.kpi-grid').getAttribute('aria-busy')).toBe('false')
      expect(element('.daily-scroll').getAttribute('aria-busy')).toBe('false')
    }, wait)
    const first = element<HTMLTableRowElement>('.daily-scroll tbody tr')
    const day = first.cells[0].textContent?.trim()
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    first.querySelector('button')!.click()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/details')
      expect(router.currentRoute.value.query).toMatchObject({
        start: day,
        end: day,
        channel: channel.id,
      })
      const ids = getOrderFacts()
        .filter((row) => row.date === day && row.channel === channel.id)
        .map((row) => row.id)
      expect(ids).toContain(element('.wh-grid tbody tr td').textContent?.trim())
    }, wait)
    expect(element<HTMLSelectElement>('.wh-filter-form select').value).toBe(channel.id)
    expect(element<HTMLInputElement>('.wh-filter-form input[type="date"]').value).toBe(day)
  }, 15000)

  it('从角色菜单切换至看板访客后隐藏受限导航，并拦截直接访问', async () => {
    await router.push('/details')
    await nextTick()
    element<HTMLButtonElement>('.side-rail .account').click()
    const menu = element<HTMLDialogElement>('.side-rail .role-dialog')
    expect(menu.open).toBe(true)
    const visitor = [...menu.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('看板访客'),
    )
    expect(visitor).toBeDefined()
    visitor!.click()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/')
      expect(element('.side-rail .account').textContent).toContain('看板访客')
      expect(host.querySelector('.side-rail a[href$="/details"]')).toBeNull()
    }, wait)
    await router.push('/details')
    await nextTick()
    expect(router.currentRoute.value.name).toBe('forbidden')
    expect(element('#main-content h1').textContent).toContain('访问权限')
  }, 15000)

  it('输入问题、预览已校验的 SQL，确认后显示与订单事实一致的结果', async () => {
    await router.push('/textsql')
    await vi.waitFor(() => expect(element('#sql-question')).toBeTruthy(), wait)
    const prompt = element<HTMLTextAreaElement>('#sql-question')
    prompt.value = '最近 7 天每天的 GMV 和订单量是多少？'
    prompt.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    element<HTMLButtonElement>('.sql-send').click()
    await vi.waitFor(() => {
      expect(element<HTMLTextAreaElement>('[aria-label="编辑 SQL"]').value).toContain(
        'ads.ads_order_stats',
      )
      expect(element('.sql-check.pass').textContent).toContain('校验通过')
    }, wait)
    const run = element<HTMLButtonElement>('.sql-execute')
    expect(run.disabled).toBe(true)
    element<HTMLButtonElement>('[role="switch"]').click()
    await nextTick()
    expect(run.disabled).toBe(false)
    run.click()
    await vi.waitFor(
      () => expect(host.querySelectorAll('.sql-result-table tbody tr')).toHaveLength(7),
      wait,
    )
    const first = element<HTMLTableRowElement>('.sql-result-table tbody tr')
    const orders = getOrderFacts().filter((row) => row.date === first.cells[0].textContent)
    expect(orders.length).toBeGreaterThan(0)
    expect(Number(first.cells[1].textContent)).toBe(
      orders.reduce((cents, row) => cents + row.amountCents, 0) / 100,
    )
    expect(Number(first.cells[2].textContent)).toBe(orders.length)
    expect(run.disabled).toBe(true)
  }, 15000)
})
