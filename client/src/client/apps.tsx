/**
 * dsh-phone App 契约（开放架构）：任何开发者可以注册自己的 App
 *
 * 用法（第三方插件 / 同包内置）：
 * ```ts
 * import { registerApp, type PhoneApp } from '../apps'
 *
 * const myApp: PhoneApp = {
 *   id: 'weather',            // 唯一 id，导航栈用它作为视图名
 *   label: '天气',
 *   icon: { d: SF.cloud },    // SF path 或 { img }（base64/URL）
 *   bg: 'linear-gradient(160deg,#0a84ff,#1c3faa)',
 *   component: WeatherApp,    // React 组件，接收 AppProps
 * }
 * registerApp(myApp)
 * ```
 *
 * App 组件通过 AppProps 拿到平台能力：主题、导航、共享数据、动作。
 * 类似 skill 的"输入输出契约"——App 只依赖契约，不依赖实现。
 */
import React from 'react'
import type { Theme } from '../theme'

/** App 可用的共享数据（由 PhoneOverlay 装配注入） */
export interface AppData {
  ownNumber: string
  otherNumber: string
  badgeLevel: number
  /** 拨号输入（通讯录点号码 → 拨号 App 预填） */
  dialTarget: string
  /** 共享短信流（A/B 双面板合并） */
  smsList: Array<any>
  /** RCS 群（列表 + 当前群 + 消息） */
  group: {
    list: Array<{ groupId: string; name: string; memberCount: number; lastMsgSeq?: number; announcement?: string }>
    current: { groupId: string; name: string; members: string[]; createdBy?: string; conversationId?: string; announcement?: string } | null
    msgs: Array<{ fromNumber: string; text: string; ts: number }>
  }
  /** 通讯录 / 开户 / 用量 */
  contacts: Array<{ number: string; agentDid: string; displayName: string | null; level: number }> | null
  contactsErr: string
  account: { numbers: string[]; applying: boolean; done: string | null; err: string; credits: number; welcome: number }
  usage: any
  /** 主题 */
  theme: Theme
  unlocked: string[]
  /** 通话状态（ringing/connected 等；App 可据此渲染来电/通话界面） */
  call: any
}

/** App 可调用的平台动作 */
export interface AppActions {
  nav(v: string): void
  back(): void
  sendSms(fromId: 'A' | 'B', text?: string, attachment?: any, to?: string): void
  sendGroup(from: string, text: string): Promise<{ delivered: string[]; failed: string[]; error?: string }> | void
  loadContacts(): void
  loadAccount(): void
  loadUsage(): void
  loadGroupList(): void
  openGroup(groupId: string): Promise<void> | void
  leaveGroup(groupId: string, member: string): Promise<{ ok: boolean; error?: string }>
  disbandGroup(groupId: string): Promise<{ ok: boolean; error?: string }>
  setAnnouncement(groupId: string, text: string): Promise<{ ok: boolean; error?: string }>
  createGroup(name: string, members: string[]): Promise<{ gid: string | null; error: string }>
  groupBack(): void
  applyAccount(displayName?: string): void
  dial(fromId: 'A' | 'B', target: string): void
  answer(): void
  hangup(): void
  toggleMute(): void
  reportUsage(type: string, amount: number): void
  unlock(name: string): void
  selectTheme(name: string): void
  setLocalNum(num: string): void
}

/** App 组件收到的 props：契约即平台能力面 */
export interface AppProps {
  id: 'A' | 'B'
  data: AppData
  actions: AppActions
  /** 便捷访问 */
  t: Theme
  nav(v: string): void
  back(): void
}

export interface PhoneApp {
  /** 唯一 id；同时作为导航栈视图名（view === app.id） */
  id: string
  /** Launcher 显示名 */
  label: string
  /** 图标：SF path（d）或图片（img） */
  icon: { d?: string; img?: string }
  /** 图标渐变背景 */
  bg: string
  /** App 视图组件（渲染在浮窗内容区） */
  component: React.FC<AppProps>
  /** 打开 App 时的副作用（可选，如预加载数据） */
  onOpen?(props: AppProps): void
  /** 是否为"系统页"（不进 Launcher，仅内部导航可达，如设置子页） */
  system?: boolean
  /** 是否隐藏（内部页） */
  hidden?: boolean
}

// ── 注册表 ──
const registry = new Map<string, PhoneApp>()

export function registerApp(app: PhoneApp): void {
  if (registry.has(app.id)) console.warn(`[dsh-phone] App id 重复，覆盖：${app.id}`)
  registry.set(app.id, app)
}

export function getApps(): PhoneApp[] {
  return [...registry.values()]
}

export function getApp(id: string): PhoneApp | undefined {
  return registry.get(id)
}

export function hasApp(id: string): boolean {
  return registry.has(id)
}
