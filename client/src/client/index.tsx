/**
 * dsh-phone client plugin — DSH 对话中的电话机（浮窗 + /phone 命令）
 *
 * 两种触发：
 *   1. 浮窗：conversation.input.overlay 条目渲染 📞 悬浮按钮（常显）+ 拨号盘（按需展开）
 *   2. /phone 命令：commandUi popupSelect——选择"打开拨号盘"或直拨常用号码
 *
 * 共享状态：dshPhone 服务（ctx.provide）持有浮窗 open/number 的 snapshot store，
 * overlay 组件（useSyncExternalStore 订阅）与命令（onSelect 写）联动。
 *
 * 架构：client 半 = 平台层（apply/装配/共享状态/语音/API）+ App 层（apps/ 目录，
 * 开放注册表）。App 只依赖 AppProps 契约，不依赖平台实现——第三方可 registerApp 扩展。
 */
import React, { useRef, useState, useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { PHONE_BASE, RCS_BASE, AGENT_DID, OWNER_DID, MINE_NUM, PEER_NUM, NUM_A, NUM_B, THEME_KEY, UNLOCKED_KEY, AGENT_LABEL, OWNER_LABEL, agentKey } from './config'
import { loadAgentProfile } from './profile'
import { THEMES, SF, type Theme } from './theme'
import { api, ApiError } from './api'
import { registerApp, getApp, type AppData, type AppActions, type AppProps } from './apps'
import { registerBuiltinApps } from './apps/index'
import { HomeApp } from './apps/home'

registerBuiltinApps()

export const name = 'dsh-phone'
export const inject = ['slots', 'sessions', 'commandUi']

// ── 共享状态（浮窗 + 命令联动）─────────────────────────────────────
interface PhoneState { open: boolean; number: string }
const store = createSnapshotStore<PhoneState>({ open: false, number: '+86' })

// client 服务与 commandUi 的宽松声明（commandUi 由 ui-commands 提供，类型内联避免跨包依赖）
declare module '@deepseek-ai/cordis' {
  interface Context {
    dshPhone: { toggle(): void; openDialer(n?: string): void }
    commandUi?: {
      register(c: {
        name: string
        description: string
        available(): boolean
        ui: {
          kind: 'popupSelect'
          options(): Promise<Array<{ id: string; label: string; detail?: string }>>
          onSelect(o: { id: string; label: string }): void
        }
      }): () => void
    }
  }
}

let clientCtx: any = null                      // apply 注入的 ctx（供组件访问 sessions）

export function apply(ctx: ClientContext): void {
  clientCtx = ctx
  // ── agent 会话登记（session-bind：凭证驱动——先拿 token 再绑定；号码→agentDID→locate→sessionId）──
  const BIND_INTERVAL = 30 * 60 * 1000   // 心跳：TTL 3600s 的一半
  // 凭证缓存（避免每次心跳都重签）：{ token, expiresAt }
  let cachedToken: { token: string; expiresAt: number } | null = null

  async function getSessionToken(): Promise<string | null> {
    // 缓存有效直接复用；否则签发新凭证
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60 * 1000) return cachedToken.token
    try {
      const r = await api.sessionToken('dsh-phone', 3600)
      if (r && r.ok && r.token) {
        cachedToken = { token: r.token, expiresAt: Date.parse(r.expiresAt) }
        return r.token
      }
      return null
    } catch { return null }
  }

  async function registerSession(sessionId: string): Promise<void> {
    const token = await getSessionToken()
    // 凭证签发失败（白名单外/速率）→ 回退 tokenless（过渡，仍可登记）
    api.sessionBind({ agentDid: AGENT_DID, sessionId, ttlSeconds: 3600, registeredBy: 'dsh-phone', ...(token ? { token } : {}) }).catch(() => {})
  }
  function tryBindSessions(): void {
    try {
      const snap = (clientCtx as any)?.sessions?.list?.getSnapshot?.()
      const rows = snap ? Object.values(snap.byId || {}) : []
      // 选一个标准 agent 会话登记（优先 title 非空、非搜索类的）
      const target = rows.find((r: any) => (r as any).agentPreset === 'standard' && (r as any).title) || rows[0]
      if (target) {
        const sid = (target as any).id
        console.log('[dsh-phone] session-bind 登记:', sid)
        registerSession(sid)
      }
    } catch (e) { console.error('[dsh-phone] session-bind 失败:', String(e).slice(0, 100)) }
  }

  setTimeout(tryBindSessions, 3000)          // 等会话加载
  setTimeout(tryBindSessions, 10000)         // 再试一次（会话可能晚出现）
  const bindTimer = setInterval(tryBindSessions, BIND_INTERVAL)  // 心跳续期
  ctx.on('dispose', () => clearInterval(bindTimer))

  // 1. dshPhone 服务：浮窗开关 + 拨号
  ctx.provide('dshPhone', {
    toggle: () => store.set({ ...store.getSnapshot(), open: !store.getSnapshot().open }),
    openDialer: (n?: string) => store.set({ open: true, number: n ?? store.getSnapshot().number }),
  })

  // 2. 浮窗条目（📞 悬浮按钮 + 拨号盘）
  ctx.inject(['slots'], (scope: ClientContext) => {
    scope.slots.inject('conversation.input.overlay', () =>
      scope.slots.register({
        name: 'conversation.input.overlay',
        id: 'dsh-phone',
        order: 2,
        locale: 'phone',
        inject: () => ({}),
      }, PhoneOverlay),
    )
  })

  // 3. /phone 命令（popupSelect：打开拨号盘 / 直拨常用号码）
  ctx.inject(['commandUi'], (scope: ClientContext) => {
    const commandUi = scope.commandUi
    if (!commandUi) return
    commandUi.register({
      name: 'phone',
      description: '打开电话拨号盘 / 拨打 Agent 号码',
      available: () => true,
      ui: {
        kind: 'popupSelect',
        // 只保留打开拨号盘；不硬编码任何环境专属联系人（清除残留测试终端 dshlib/term-a/term-b，避免所有环境出现别人的号码）
        options: async () => [
          { id: 'open', label: '📞 打开拨号盘' },
        ],
        onSelect: (opt) => {
          if (opt.id === 'open') store.set({ open: true, number: store.getSnapshot().number })
        },
      },
    })
  })
}

// ── 电话面板（单部电话完整画面：拨号盘 + 来电/通话 + 独立短信窗）────

interface SmsMsg {
  fromNumber: string       // 发送方号码（等于本机号码=自己→右，否则对端→左）
  text?: string
  attachment?: { name: string; size: number; type: string; url?: string; fileId?: string; hash?: string }
  ts: number
  seq?: number
}

// 共享身份/开户状态（A=agent、B=owner 同属一个主体 → 归 PhoneOverlay 统一持有，双面板共享）
type AccountState = {
  numbers: string[]
  applying: boolean
  done: string | null
  err: string
  credits: number
  welcome: number
  agentState: string
  agentLevel: number
  agentLevelName: string
  registering: boolean
  ownerState: string
  ownerName: string
  ownerRegistering: boolean
}

function PhonePanel(props: {
  id: 'A' | 'B'
  label: string
  floatLabel: string
  ownNumber: string
  otherNumber: string
  smsList: SmsMsg[]
  onSendSms: (from: 'A' | 'B', text?: string, attachment?: SmsMsg['attachment'], to?: string) => void
  voice: { active: boolean; muted: boolean; onToggleMute(): void }
  group: {
    list: Array<{ groupId: string; name: string; memberCount: number }>
    current: { groupId: string; name: string; members: string[] } | null
    msgs: Array<{ fromNumber: string; text: string; ts: number }>
    onLoadList(): void
    onCreate(name: string, members: string[]): Promise<string | null>
    onOpen(groupId: string): void
    onSend(from: 'A' | 'B', text: string): Promise<{ delivered: string[]; failed: string[] }> | void
    onLeave(groupId: string, member: string): Promise<{ ok: boolean; error?: string }>
    onDisband(groupId: string): Promise<{ ok: boolean; error?: string }>
    onAnnouncement(groupId: string, text: string): Promise<{ ok: boolean; error?: string }>
    onBack(): void
  }
  onReport(type: string, amount: number): void
  theme: Theme
  unlocked: string[]
  onUnlock(name: string): void
  onSelectTheme(name: string): void
  top: boolean
  onFocus(): void
  badgeLevel: number
  call: { stage: 'ringing' | 'connected'; callerId: string; calleeId: string; call?: any; connectedAt: number } | null
  onDial(fromId: 'A' | 'B', target: string): void
  onAnswer(): void
  onHangup(): void
  pos: { x: number; y: number }
  onDragStart(e: React.PointerEvent): void
  justDragged: boolean
  // 共享身份/开户（由 PhoneOverlay 持有，双面板共享）
  account: AccountState
  checkAgentRegistered(): void
  registerAgent(displayName: string, author: string): Promise<void>
  checkOwnerRegistered(): void
  registerOwner(displayName: string, author: string): Promise<void>
  loadAccount(): void
  applyAccount(displayName?: string): Promise<void>
  // 新消息通知横幅（由 PhoneOverlay 轮询触发，经 props 下发到本面板渲染）
  notif: { key: string; title: string; body: string; jump: () => void } | null
  onNotifDismiss(): void
}): JSX.Element {
  const t = props.theme
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<null | { num: string }>(null)
  type View = 'home' | 'dial' | 'sms' | 'contacts' | 'group' | 'group-chat' | 'usage' | 'account' | 'theme' | 'note' | 'store' | 'settings' | 'about'
  const [viewStack, setViewStack] = useState<View[]>(['home'])
  const view = viewStack[viewStack.length - 1]
  // 导航：push 进栈（同视图不重复）；返回：pop（留 home）
  function nav(v: View): void {
    if (v === view) return
    setViewStack((s) => (v === 'home' ? ['home'] : [...s.filter((x) => x !== 'home'), v]))
  }
  function back(): void {
    setViewStack((s) => (s.length > 1 ? s.slice(0, -1) : ['home']))
  }
  const [contacts, setContacts] = useState<Array<{ number: string; agentDid: string; displayName: string | null; level: number }> | null>(null)
  const [contactsErr, setContactsErr] = useState('')
  const [agents, setAgents] = useState<Array<{ agentDid: string; name: string; level: number; numbers: string[] }> | null>(null)
  const [usage, setUsage] = useState<any>(null)

  // 来电强制唤起本面板
  const incoming = props.call && props.call.calleeId === props.id
  const isCaller = props.call && props.call.callerId === props.id
  const isConnected = props.call && props.call.stage === 'connected'
  const effectiveOpen = open || !!incoming

  // 以下 load 函数只负责拉数据，导航由调用方（App onOpen / 设置页）负责
  function loadContacts(): void {
    if (!contacts) {
      fetch(`${PHONE_BASE}/api/v1/phone/directory`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((d) => setContacts(d.numbers || []))
        .catch(() => setContactsErr('通讯录加载失败'))
    }
  }

  /** 拉取所有已注册 agent（含无号码的，建群选人用） */
  function loadAgents(): void {
    if (!agents) {
      fetch(`${PHONE_BASE}/api/v1/agent/list`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((d) => setAgents(d.agents || []))
        .catch(() => {})
    }
  }

  function loadUsage(): void {
    fetch(`${PHONE_BASE}/api/v1/phone/usage?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => setUsage(d.usage))
      .catch(() => {})
  }

  const target = local?.num ?? '+86'

  function hangup(): void { setOpen(false); setLocal(null); props.onHangup() }

  const ringTone = { idle: '#64748b', ok: '#34d399', warn: t.warn, bad: '#f87171', ring: t.accent }
  const tone: 'idle' | 'ok' | 'warn' | 'bad' | 'ring' =
    isConnected ? 'ok' : incoming ? ((props.call.call && props.call.call.trust && (props.call.call.trust.revoked || !props.call.call.trust.active)) ? 'bad' : (props.call.call && props.call.call.trust && props.call.call.trust.level > 0 ? 'ok' : 'warn')) : 'idle'

  const shellRadius = t.shape === 'squared' ? 24 : t.shape === 'retro' ? 36 : 42
  const screenRadius = t.shape === 'squared' ? 18 : t.shape === 'retro' ? 28 : 34
  // 浮窗跟随图标位置（不限制边界，支持把整个浮窗拖到浏览器可视范围之外/跨屏）
  // 手机容器：视口居中弹出（截图/演示友好；浮标拖动不再影响手机画面位置）
  const shellStyle: React.CSSProperties = {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 330,
    background: t.shell, borderRadius: shellRadius, border: `2px solid ${props.top ? t.accent : t.border}`,
    boxShadow: '0 20px 60px rgba(0,0,0,.6)', padding: '8px 8px 12px', zIndex: props.top ? 1100 : 1000, fontFamily: t.font,
  }
  const screenStyle: React.CSSProperties = {
    background: t.screen, borderRadius: screenRadius, overflow: 'hidden', color: t.text,
    display: 'flex', flexDirection: 'column', height: 660, position: 'relative',
  }
  const roundBtn = (bg: string, w = 56): React.CSSProperties => ({
    width: w, height: w, borderRadius: '50%', background: bg, color: '#fff', border: 0, fontSize: 11, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
  })

  // ── App 装配：把本面板的 state/动作打包成 AppProps（App 只依赖此契约）──
  const appData: AppData = {
    ownNumber: props.ownNumber,
    ownerDid: OWNER_DID,
    otherNumber: props.otherNumber,
    badgeLevel: props.badgeLevel,
    dialTarget: target,
    smsList: props.smsList,
    group: props.group,
    contacts, contactsErr, agents,
    account: props.account, usage,
    theme: t, unlocked: props.unlocked,
    call: props.call,
  }
  const appActions: AppActions = {
    nav, back,
    sendSms: (from, text, attachment, to) => props.onSendSms(from, text, attachment, to),
    sendGroup: (from, text) => props.group.onSend(from, text),
    loadContacts, loadAgents, loadAccount: props.loadAccount, loadUsage,
    loadGroupList: () => props.group.onLoadList(),
    openGroup: (gid) => props.group.onOpen(gid),
    leaveGroup: (gid, member) => props.group.onLeave(gid, member),
    disbandGroup: (gid) => props.group.onDisband(gid),
    setAnnouncement: (gid, text) => props.group.onAnnouncement(gid, text),
    createGroup: (name, members) => props.group.onCreate(name, members),
    groupBack: () => props.group.onBack(),
    applyAccount: props.applyAccount,
    registerAgent: props.registerAgent,
    checkAgentRegistered: props.checkAgentRegistered,
    registerOwner: props.registerOwner,
    checkOwnerRegistered: props.checkOwnerRegistered,
    dial: (fromId, num) => props.onDial(fromId, num),
    answer: () => props.onAnswer(),
    hangup,
    toggleMute: () => props.voice.onToggleMute(),
    reportUsage: (type, amount) => props.onReport(type, amount),
    unlock: (name) => props.onUnlock(name),
    selectTheme: (name) => props.onSelectTheme(name),
    setLocalNum: (num) => setLocal({ num }),
  }
  const appProps: AppProps = { id: props.id, data: appData, actions: appActions, t, nav, back }
  const CurrentApp = view === 'home' ? null : getApp(view)

  return (
    <>
      <button
        onClick={() => { if (!props.justDragged) { props.onFocus(); setOpen(!open) } }}
        onPointerDown={props.onDragStart}
        style={{ position: 'fixed', left: props.pos.x - 24, top: props.pos.y - 24,
          width: 48, height: 48, borderRadius: '50%',
          background: t.key, color: t.accent, border: incoming ? '2px solid #22d3ee' : '1px solid #3a3a3c',
          fontSize: 20, cursor: 'grab', zIndex: 1200, boxShadow: '0 4px 14px rgba(0,0,0,.4)', touchAction: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
        aria-label={`dsh-phone ${props.id}`} title={`${props.label} · ${props.ownNumber}`}
      >
        📞{incoming ? '🔔' : ''}
        {/* 名字显示在圆圈正下方（absolute 定位，不改变按钮 48px 固定尺寸；超长省略号，完整名在 title） */}
        <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          marginTop: 3, fontSize: 9.5, color: '#e8e8ea', lineHeight: 1.2, whiteSpace: 'nowrap',
          maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(0,0,0,.9)',
          pointerEvents: 'none' }}>{props.floatLabel}</span>
      </button>

      {effectiveOpen && (
        <div style={shellStyle} onClick={() => props.onFocus()}>
          {view === 'home' && <div style={{ width: 84, height: 20, background: '#000', borderRadius: 12, margin: '2px auto 6px', border: '1px solid #1c1c1e' }} />}
          <div style={screenStyle}>
            {/* 新消息通知横幅（微信式：顶部悬浮，6s 自动消失，点击跳转会话） */}
            {props.notif && (
              <div onClick={() => { props.notif!.jump(); props.onNotifDismiss() }}
                style={{ position: 'absolute', top: 8, left: 10, right: 10, zIndex: 30,
                  background: 'rgba(28,28,30,.97)', border: '1px solid #3a3a3c', borderRadius: 12,
                  padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 9,
                  boxShadow: '0 6px 20px rgba(0,0,0,.55)', cursor: 'pointer' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(160deg,#0a84ff,#1c3faa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>💬</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{props.notif.title}</div>
                  <div style={{ fontSize: 11, color: '#8e8e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{props.notif.body}</div>
                </div>
                <span style={{ fontSize: 13, color: '#48484a', flexShrink: 0 }}>×</span>
              </div>
            )}
            {view === 'home' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 0', fontSize: 11, color: '#fff' }}>
                <button onClick={() => setOpen(false)} title="最小化（关闭浮窗）" aria-label="最小化"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, padding: '0 4px', lineHeight: 1, opacity: 0.85 }}>
                  ▁
                </button>
                <span>{new Date().toTimeString().slice(0, 5)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  {/* WiFi 信号：三弧 + 圆点（标准 iOS 观感） */}
                  <svg width={14} height={11} viewBox="0 0 24 19" fill="none" stroke="#fff" strokeWidth={2.1} strokeLinecap="round">
                    <path d="M2.5 7a14.5 14.5 0 0 1 19 0" />
                    <path d="M6 10.5a9.5 9.5 0 0 1 12 0" />
                    <path d="M9.5 14a4.5 4.5 0 0 1 5 0" />
                    <circle cx="12" cy="16.8" r="1.5" fill="#fff" stroke="none" />
                  </svg>
                  {/* 电池：横放 + 正极凸起 + 电量 75% */}
                  <svg width={21} height={10} viewBox="0 0 24 12" fill="none">
                    <rect x="1" y="1" width="19.5" height="10" rx="3" stroke="#fff" strokeWidth={1.5} />
                    <rect x="21.5" y="4" width="2" height="4" rx="1" fill="#fff" />
                    <rect x="3" y="3" width="14" height="6" rx="1.6" fill="#fff" />
                  </svg>
                </span>
              </div>
            )}

            <div style={{ flex: 1, padding: view === 'home' ? '4px 14px 10px' : '8px 0 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {view === 'home' ? (
                <HomeApp {...appProps} />
              ) : CurrentApp ? (
                <CurrentApp.component {...appProps} />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.muted, fontSize: 12 }}>未知 App：{view}</div>
              )}
            </div>

            {view === 'home' && <div style={{ width: 120, height: 4, background: t.border, borderRadius: 2, margin: '6px auto 2px' }} />}

            {/* 来电 / 呼叫中 / 通话中 覆盖层（任意视图之上） */}
            {props.call && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
                {incoming ? (
                  <>
                    <div style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>来电</div>
                    <div style={{ fontSize: 13, color: '#8e8e93' }}>{props.call.callerId === 'A' ? AGENT_LABEL : props.call.callerId === 'B' ? OWNER_LABEL : props.call.callerId}</div>
                    {/* D9: 撤销/可疑标记——registry resolve 已核验，前端展示（被撤销/未激活/未注册 → 醒目警告） */}
                    {props.call.call && props.call.call.suspicious && (
                      <div style={{ fontSize: 12, color: '#ff3b30', fontWeight: 600, background: 'rgba(255,59,48,.15)', padding: '4px 12px', borderRadius: 6 }}>
                        ⚠ {(props.call.call.trust && props.call.call.trust.revoked) ? '该号码已被撤销' : (props.call.call.trust && !props.call.call.trust.active) ? '该号码未激活' : '未注册/低可信号码'}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 26 }}>
                      <button onClick={() => props.onAnswer()} style={{ width: 64, height: 64, borderRadius: '50%', background: '#34c759', color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>接听</button>
                      <button onClick={() => props.onHangup()} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ff3b30', color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>挂断</button>
                    </div>
                  </>
                ) : isCaller ? (
                  <>
                    <div style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>呼叫中…</div>
                    <div style={{ fontSize: 13, color: '#8e8e93' }}>{props.call.calleeId === 'A' ? AGENT_LABEL : props.call.calleeId === 'B' ? OWNER_LABEL : props.call.calleeId}</div>
                    {/* D9: 主叫侧同样提示目标可疑（撤销/未注册） */}
                    {props.call.call && props.call.call.suspicious && (
                      <div style={{ fontSize: 12, color: '#ff3b30', fontWeight: 600, background: 'rgba(255,59,48,.15)', padding: '4px 12px', borderRadius: 6 }}>
                        ⚠ {(props.call.call.trust && props.call.call.trust.revoked) ? '目标已被撤销' : '目标未注册/低可信'}
                      </div>
                    )}
                    <button onClick={() => props.onHangup()} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ff3b30', color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>挂断</button>
                  </>
                ) : isConnected ? (
                  <>
                    <div style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>通话中</div>
                    <div style={{ fontSize: 13, color: '#8e8e93' }}>{props.call.callerId === 'A' ? AGENT_LABEL : props.call.callerId === 'B' ? OWNER_LABEL : props.call.callerId}</div>
                    <button onClick={() => props.onHangup()} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ff3b30', color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>挂断</button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function PhoneOverlay(): JSX.Element {
  const [topPanel, setTopPanel] = useState<'A' | 'B' | null>(null)
  const [themeA, setThemeA] = useState<string>(() => localStorage.getItem(THEME_KEY + '-a') || 'classic')
  const [themeB, setThemeB] = useState<string>(() => localStorage.getItem(THEME_KEY + '-b') || 'classic')
  const [unlocked, setUnlocked] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY) || '[]') } catch { return [] } })
  function themeOf(id: 'A' | 'B'): Theme { return THEMES[(id === 'A' ? themeA : themeB)] || THEMES.classic }
  // ── 浮标显示名（注册名优先；无则通用占位——不硬编码任何主人专属名）──
  // A 面板 = agent 注册名（metadata.name）；B 面板 = owner 注册名（metadata.name）→ 号码 displayName → 占位
  const [dispName, setDispName] = useState<{ a: string; b: string }>({ a: AGENT_LABEL, b: OWNER_LABEL })

  // ── 共享身份/开户状态（A=agent、B=owner 同属一个主体 → 归 PhoneOverlay 持有，双面板共享）──
  // 之前误放在 PhonePanel（每面板独立）导致 sendGroup/sendSms 在 PhoneOverlay 引用 account 越界 → ReferenceError → 发消息静默失败
  const [account, setAccount] = useState<AccountState>({ numbers: [], applying: false, done: null, err: '', credits: 0, welcome: 0, agentState: 'unknown', agentLevel: 0, agentLevelName: '', registering: false, ownerState: 'unknown', ownerName: '', ownerRegistering: false })

  /** 检测当前 AGENT_DID 是否已注册 + 等级（开户引导第一步） */
  function checkAgentRegistered(): void {
    fetch(`${PHONE_BASE}/api/v1/did/${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => {
        // DID Document 的标识字段是 id（不是 did）；registry /api/v1/did/<did> 返回 { id, metadata, ... }
        if (d && (d.id === AGENT_DID || d.did === AGENT_DID)) {
          const lvl = d.level ?? 0
          setAccount((a) => ({ ...a, agentState: 'registered', agentLevel: lvl, agentLevelName: d.levelName || `L${lvl}`, err: '' }))
        } else {
          setAccount((a) => ({ ...a, agentState: 'unregistered', agentLevel: 0, agentLevelName: '', err: '' }))
        }
      })
      .catch(() => setAccount((a) => ({ ...a, agentState: 'unregistered', err: '无法确认 agent 状态' })))
  }

  /** 注册 agent（名字 + author → L 等级；author 决定能否过信任门禁） */
  async function registerAgent(displayName: string, author: string): Promise<void> {
    setAccount((a) => ({ ...a, registering: true, err: '' }))
    try {
      // 1. 注册身份主体
      const r1 = await fetch(`${PHONE_BASE}/api/v1/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'agent', id: AGENT_DID.replace(/^did:cha2a:agent:/, ''), metadata: { name: displayName, author } }),
      })
      const d1 = await r1.json()
      if (r1.status !== 201) {
        // 已存在则尝试补 metadata（升级 author → L2）
        if (r1.status === 409 && author) {
          await fetch(`${PHONE_BASE}/api/v1/update`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'agent', id: AGENT_DID.replace(/^did:cha2a:agent:/, ''), metadata: { author } }),
          })
        } else {
          setAccount((a) => ({ ...a, registering: false, err: d1.error || 'agent 注册失败' }))
          return
        }
      }
      // 2. 重新确认状态
      checkAgentRegistered()
      setAccount((a) => ({ ...a, registering: false, done: AGENT_DID }))
    } catch { setAccount((a) => ({ ...a, registering: false, err: '网络错误' })) }
  }

  /** 检测 Owner 身份（did:cha2a:user:<agent短名>-owner）是否已注册 + 注册名 */
  function checkOwnerRegistered(): void {
    if (!OWNER_DID) { setAccount((a) => ({ ...a, ownerState: 'unregistered', ownerName: '' })); return }
    fetch(`${PHONE_BASE}/api/v1/did/${encodeURIComponent(OWNER_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.id === OWNER_DID) {
          const meta = d.metadata || {}
          setAccount((a) => ({ ...a, ownerState: 'registered', ownerName: meta.name || OWNER_DID.split(':').pop() || '', err: '' }))
        } else {
          setAccount((a) => ({ ...a, ownerState: 'unregistered', ownerName: '' }))
        }
      })
      .catch(() => setAccount((a) => ({ ...a, ownerState: 'unregistered', err: '无法确认 Owner 状态' })))
  }

  /** 注册 Owner 身份（名字 + 主体名 → L2；owner 有明确身份才能在群里发言） */
  async function registerOwner(displayName: string, author: string): Promise<void> {
    if (!OWNER_DID) { setAccount((a) => ({ ...a, err: '本环境未配置 Owner DID' })); return }
    setAccount((a) => ({ ...a, ownerRegistering: true, err: '' }))
    try {
      const short = OWNER_DID.split(':').pop() || ''
      const r1 = await fetch(`${PHONE_BASE}/api/v1/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', id: short, metadata: { name: displayName, author } }),
      })
      const d1 = await r1.json()
      if (r1.status !== 201) {
        if (r1.status === 409 && author) {
          await fetch(`${PHONE_BASE}/api/v1/update`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'user', id: short, metadata: { author } }),
          })
        } else {
          setAccount((a) => ({ ...a, ownerRegistering: false, err: d1.error || 'Owner 注册失败' }))
          return
        }
      }
      checkOwnerRegistered()
      setAccount((a) => ({ ...a, ownerRegistering: false, done: OWNER_DID }))
    } catch { setAccount((a) => ({ ...a, ownerRegistering: false, err: '网络错误' })) }
  }

  function loadAccount(): void {
    fetch(`${PHONE_BASE}/api/v1/phone/lookup?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { setAccount((a) => ({ ...a, numbers: d.numbers || [], done: null, err: '' })) })
      .catch(() => {})
    fetch(`${PHONE_BASE}/api/v1/phone/credits?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { setAccount((a) => ({ ...a, credits: d.credits || 0 })) })
      .catch(() => {})
    checkAgentRegistered()
    checkOwnerRegistered()
  }

  async function applyAccount(displayName = ''): Promise<void> {
    setAccount((a) => ({ ...a, applying: true, err: '' }))
    try {
      const r = await fetch(`${PHONE_BASE}/api/v1/phone/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentDid: AGENT_DID, displayName, consent: true }),
      })
      const d = await r.json()
      if (r.status === 201) {
        setAccount((a) => ({ ...a, numbers: [...a.numbers, d.number], done: d.number, welcome: d.welcomeCredits || 0, credits: (a.credits || 0) + (d.welcomeCredits || 0), applying: false }))
      } else if (r.status === 409 && /agent not registered/i.test(d.error || '')) {
        // 未注册 agent → 转引导注册（不报硬错误）
        setAccount((a) => ({ ...a, applying: false, agentState: 'unregistered', err: '请先注册你的 agent（下方第 1 步）' }))
      } else {
        setAccount((a) => ({ ...a, err: d.error || '申请失败', applying: false }))
      }
    } catch { setAccount((a) => ({ ...a, err: '网络错误', applying: false })) }
  }

  React.useEffect(() => {
    let alive = true
    const load = async () => {
      const out = { a: AGENT_LABEL, b: OWNER_LABEL }
      // agent 展示名：优先 RCS 业务档案（agent profile），回退 registry 注册名
      try {
        const prof = await loadAgentProfile(AGENT_DID)
        if (alive && prof && prof.displayName) out.a = prof.displayName
      } catch {}
      if (out.a === AGENT_LABEL) {
        try {
          const da = await (await fetch(`${PHONE_BASE}/api/v1/did/${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })).json()
          if (alive && da && da.metadata && (da.metadata.name || da.metadata.author)) out.a = da.metadata.name || da.metadata.author
        } catch {}
      }
      // owner 注册名（B 面板身份）
      if (OWNER_DID) {
        try {
          const db = await (await fetch(`${PHONE_BASE}/api/v1/did/${encodeURIComponent(OWNER_DID)}`, { headers: { Accept: 'application/json' } })).json()
          if (alive && db && db.metadata && (db.metadata.name || db.metadata.author)) out.b = db.metadata.name || db.metadata.author
        } catch {}
      }
      // 回退：B 号码 displayName（号码簿）
      if (out.b === OWNER_LABEL) {
        try {
          const dd = await (await fetch(`${PHONE_BASE}/api/v1/phone/directory`, { headers: { Accept: 'application/json' } })).json()
          if (alive && dd && Array.isArray(dd.numbers)) {
            const mine = dd.numbers.find((n: any) => n.number.replace(/[^0-9+]/g, '') === NUM_B.replace(/[^0-9+]/g, ''))
            if (mine && mine.displayName) out.b = mine.displayName
          }
        } catch {}
      }
      if (alive) setDispName(out)
    }
    load()
    return () => { alive = false }
  }, [])
  const [smsLog, setSmsLog] = useState<SmsMsg[]>([])
  // ── RCS 群（团队协作空间）：群列表 + 当前群 + 群消息（经 registry）──
  const [groupMsgs, setGroupMsgs] = useState<Array<{ from: string; text: string; ts: number }>>([])
  const [groupList, setGroupList] = useState<Array<{ groupId: string; name: string; memberCount: number }>>([])
  const [currentGroup, setCurrentGroup] = useState<{ groupId: string; name: string; members: string[]; conversationId?: string; createdBy?: string } | null>(null)
  const [groupMsgLog, setGroupMsgLog] = useState<Array<{ from?: string; fromNumber: string; text: string; ts: number; agent?: { did: string; name: string; level: number }; kind?: string; payload?: any; status?: string; seq?: number }>>([])
  const groupLastSeq = useRef<Record<string, number>>({})
  // 通知横幅用最新 groupList（轮询 effect 依赖不随其重建）
  const groupListRef = useRef(groupList); groupListRef.current = groupList

  // ── 新消息通知横幅（微信式：轮询到新消息 → 顶部横幅 6s 自动消失，点击跳转会话）──
  const [notif, setNotif] = useState<{ key: string; title: string; body: string; jump: () => void } | null>(null)
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showNotif(n: { key: string; title: string; body: string; jump: () => void }): void {
    setNotif(n)
    if (notifTimer.current) clearTimeout(notifTimer.current)
    notifTimer.current = setTimeout(() => setNotif(null), 6000)
  }

  // 群列表加载（我是成员/创建者）
  function loadGroupList(): void {
    fetch(`${RCS_BASE}/api/v1/phone/group/list?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => setGroupList(d.groups || []))
      .catch(() => {})
  }
  // 创建群（人号码 + agent DID 混合成员）
  async function createGroup(name: string, members: string[]): Promise<{ gid: string | null; error: string }> {
    try {
      const r = await (await fetch(`${RCS_BASE}/api/v1/phone/group`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, creator: AGENT_DID, members }),
      })).json()
      if (r && r.ok && r.groupId) {
        loadGroupList()
        return { gid: r.groupId, error: '' }
      }
      return { gid: null, error: r?.error || '创建失败（成员需是号码簿中的号码或已注册 agent）' }
    } catch { return { gid: null, error: '网络错误' } }
  }
  // 打开群会话：加载群详情 + 拉群消息
  async function openGroup(groupId: string): Promise<void> {
    try {
      const g = await (await fetch(`${RCS_BASE}/api/v1/phone/group/${groupId}`, { headers: { Accept: 'application/json' } })).json()
      if (g && g.ok) setCurrentGroup({ groupId: g.groupId, name: g.name, members: g.members || [], ...(g.conversationId ? { conversationId: g.conversationId } : {}), ...(g.createdBy ? { createdBy: g.createdBy } : {}), ...(g.announcement ? { announcement: g.announcement } : {}) })
      setGroupMsgLog([])
      // 打开群即标记已读（读游标 = 最新 lastMsgSeq，防群列表角标残留）
      markGroupRead(groupId)
      pollGroupMessages(groupId, true)
    } catch {}
  }
  // 群已读游标：localStorage（groupId → 已读 seq）；打开群 / 收到当前群新消息时更新
  const GROUP_READ_KEY = agentKey('group-read')
  function loadGroupRead(): Record<string, number> { try { return JSON.parse(localStorage.getItem(GROUP_READ_KEY) || '{}') } catch { return {} } }
  function saveGroupRead(r: Record<string, number>): void { try { localStorage.setItem(GROUP_READ_KEY, JSON.stringify(r)) } catch {} }
  function markGroupRead(groupId: string, seq?: number): void {
    const r = loadGroupRead()
    const g = groupList.find((x) => x.groupId === groupId)
    const target = seq ?? g?.lastMsgSeq ?? 0
    if (target > (r[groupId] || 0)) { r[groupId] = target; saveGroupRead(r) }
  }
  // 群消息拉取：用 v2 群历史分页端点（聚合所有成员收件箱，含发送者自己）
  // —— 不用"自己收件箱过滤"，因为广播已排除发送者，自己发的消息不在自己收件箱，会被 force 全量替换冲掉
  function pollGroupMessages(groupId: string, force = false): void {
    const since = force ? 0 : (groupLastSeq.current[groupId] || 0)
    fetch(`${RCS_BASE}/api/v1/phone/group/${groupId}/messages?since=${since}&limit=100`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const gm = (d.messages || [])
        if (gm.length) {
          groupLastSeq.current[groupId] = Math.max(...gm.map((m: any) => m.seq || 0), groupLastSeq.current[groupId] || 0)
          // 当前打开的群收到新消息 → 已读游标同步推进（角标不残留）
          if (currentGroup?.groupId === groupId) markGroupRead(groupId, groupLastSeq.current[groupId])
          const mapped = gm.map((m: any) => ({ from: m.from || '', fromNumber: m.fromNumber || '对端', text: m.text || '', ts: Date.parse(m.at) || Date.now(), ...(m.agent ? { agent: m.agent } : {}), ...(m.kind ? { kind: m.kind } : {}), ...(m.payload ? { payload: m.payload } : {}), ...(m.status ? { status: m.status } : {}), seq: m.seq }))
          // force（打开群）：全量替换（防与轮询竞争重复）；增量：追加
          if (force) setGroupMsgLog(mapped)
          else setGroupMsgLog((l) => [...l, ...mapped])
        }
      })
      .catch(() => {})
  }
  // 发送群消息（广播；@agent 走投递，@人仅广播提及）返回投递结果供 UI 反馈
  async function sendGroup(from: string, text: string): Promise<{ delivered: string[]; failed: string[]; error?: string }> {
    const res = { delivered: [] as string[], failed: [] as string[], error: undefined as string | undefined }
    // 发言身份：A 面板 = agent（AGENT_DID）；B 面板 = owner（操作人员）——各是各的
    // B 面板：owner 已注册 → 用 OWNER_DID；未注册 → 回退号码身份（号码在簿即身份，OWNER_DID 预留）
    const panelIsB = from === 'B'
    const ownerRegistered = account.ownerState === 'registered'
    const normNum = (s: string) => s.replace(/^\+86/, '').replace(/[^0-9]/g, '')
    // B 面板号码身份用归一化号码 NUM_B（无空格）——后端 PHONE_RE 不认带空格号码（MINE_NUM.B 会 400 invalid from）
    const speakAs = panelIsB ? (ownerRegistered && OWNER_DID ? OWNER_DID : NUM_B) : AGENT_DID
    const speakNumber = panelIsB ? (ownerRegistered && OWNER_DID ? OWNER_DID : NUM_B) : MINE_NUM.A
    // 身份守卫：身份不明不能参与群聊——A 查 agent 注册、B 查 owner 注册（owner 未注册用号码，号码在簿即身份）
    if (panelIsB ? (account.ownerState === 'unregistered' && !account.numbers.some((n) => normNum(n) === normNum(NUM_B))) : (account.agentState === 'unregistered')) {
      res.error = panelIsB
        ? '⚠ Owner 身份未注册，且号码未开户，不能在群里发言。请先打开「开户」完成注册'
        : '⚠ 身份未注册，不能在群里发言。请先打开「开户」完成 agent 注册（第 1 步）'
      return res
    }
    if (!currentGroup) return res
    // 提取所有 @ 提及（任意位置：开头/句中/句尾）
    const mentions = [...new Set([...text.matchAll(/@([\w\u4e00-\u9fa5.-]+)/g)].map((m) => m[1]))]
    // @昵称 → 成员 DID 解析：agent 成员可用昵称（metadata.name/author）@，需映射回 DID 才能投递
    // 拉一次 members-detail 建昵称→成员映射（含号码成员 + agent 成员）
    let nickToMember: Record<string, string> = {}
    try {
      const md = await (await fetch(`${RCS_BASE}/api/v1/phone/group/${currentGroup.groupId}/members-detail`, { headers: { Accept: 'application/json' } })).json()
      if (md && Array.isArray(md.members)) {
        for (const x of md.members) {
          if (x.nickname) nickToMember[x.nickname] = x.member
          if (x.member?.startsWith('did:')) nickToMember[x.member.split(':').pop()!] = x.member  // DID 短名也映射
        }
      }
    } catch {}
    // 成员校验：@ 目标必须是群成员（agent 短名/昵称 → 成员 DID；号码按 +86 归一）
    const notInGroup = mentions.filter((name) => {
      const member = nickToMember[name] || name
      return !(currentGroup.members || []).some((mm) =>
        mm === member || mm === `did:cha2a:agent:${name}` || (!mm.startsWith('did:') && normNum(mm) === normNum(name)))
    })
    if (notInGroup.length) { res.error = `${notInGroup.join('、')} 不在本群，无法 @`; return res }
    const conv = currentGroup.conversationId ? { conversationId: currentGroup.conversationId } : {}
    const r = await fetch(`${RCS_BASE}/api/v1/phone/group/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: speakAs, fromNumber: speakNumber, groupId: currentGroup.groupId, ...conv, text }),
    }).catch(() => null)
    // 信任门禁/广播错误透传给 UI（409 = @agent 等级低于门禁；后端检查所有 @agent）
    if (r && r.status >= 400) {
      const d = await r.json().catch(() => null)
      res.error = (d && (d.error || '')) || `broadcast failed (${r.status})`
      if (d && d.denied) res.error += '：' + d.denied.map((x: any) => `@${x.agent}(L${x.level})`).join(', ')
      return res
    }
    // @agent 投递：所有 @ 到的 agent 成员都投递（@人仅提及，不投递）；内容 = 整条消息
    for (const mentioned of mentions) {
      // 解析 @昵称/@短名 → 成员 DID（昵称必须映射回 DID 才能投递）
      const memberDid = nickToMember[mentioned] || (currentGroup.members || []).find((mm) => mm === `did:cha2a:agent:${mentioned}`) || null
      // 跳过 @ 自己（自己的短名/昵称）——sendSmsToAgent 已挡，这里避免进 delivered 列表
      if (!memberDid) continue
      const mentionedShort = memberDid.split(':').pop()!
      if (mentionedShort === AGENT_DID.replace(/^did:cha2a:agent:/, '')) continue
      const ok = await sendSmsToAgent(mentionedShort, text, from === 'A' ? NUM_A : NUM_B, 'group', currentGroup.groupId, currentGroup.conversationId)
      if (ok) res.delivered.push(mentionedShort)
      else res.failed.push(mentionedShort)
    }
    // 乐观追加（立即显示自己的消息）+ 立即 force 刷新（替换为生产全量，防乐观+轮询重复）
    setGroupMsgLog((l) => [...l, { fromNumber: speakNumber, text, ts: Date.now() }])
    pollGroupMessages(currentGroup.groupId, true)
    return res
  }
  // 退出群（成员自助）
  async function leaveGroup(groupId: string, member: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await (await fetch(`${RCS_BASE}/api/v1/phone/group/leave`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, member }),
      })).json()
      if (r && r.ok) { loadGroupList(); return { ok: true } }
      return { ok: false, error: r?.error || '退出失败' }
    } catch { return { ok: false, error: '网络错误' } }
  }
  // 解散群（管理操作）
  async function disbandGroup(groupId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await (await fetch(`${RCS_BASE}/api/v1/phone/group/disband`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, actor: AGENT_DID }),
      })).json()
      if (r && r.ok) { loadGroupList(); return { ok: true } }
      return { ok: false, error: r?.error || '解散失败' }
    } catch { return { ok: false, error: '网络错误' } }
  }
  // 群公告（管理操作）
  async function setAnnouncement(groupId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await (await fetch(`${RCS_BASE}/api/v1/phone/group/announcement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, text, actor: AGENT_DID }),
      })).json()
      if (r && r.ok) { loadGroupList(); return { ok: true } }
      return { ok: false, error: r?.error || '公告设置失败' }
    } catch { return { ok: false, error: '网络错误' } }
  }
  // 共享通话状态：A 拨 B → 唤起 B（B 自动打开显示来电）
  const [call, setCall] = useState<{ stage: 'ringing' | 'connected'; callerId: string; calleeId: string; call?: any; connectedAt: number } | null>(null)

  // ── 每部电话独立位置（拖动锚点，屏幕坐标 left/top；localStorage 持久化）──
  // v3：初始位置改为 DSH 对话框内部右侧（v2 的窗口右上角旧位置不再贴合，升级重置）
  const POS_KEY = agentKey('pos-v3')
  // 缺省位置：DSH 对话框内部右侧（对话区容器内，不遮挡输入区）——用 DOM 查询对话区，找不到回退窗口右侧
  function defaultPos(): Record<'A' | 'B', { x: number; y: number }> {
    let box: DOMRect | null = null
    try {
      const scroll = document.querySelector('[data-conversation-scroll]') || document.querySelector('[data-composer-seat]')
      if (scroll) box = scroll.getBoundingClientRect()
    } catch {}
    if (box && box.width > 100 && box.height > 100) {
      // 对话框底部中间（截图/演示友好：浮标在画面下方居中，手机容器视口居中弹出）
      const cx = box.left + box.width / 2
      return {
        A: { x: cx + 30, y: box.bottom - 30 },
        B: { x: cx - 30, y: box.bottom - 30 },
      }
    }
    // 回退：窗口底部中间（无对话区时）
    return {
      A: { x: window.innerWidth / 2 + 30, y: window.innerHeight - 30 },
      B: { x: window.innerWidth / 2 - 30, y: window.innerHeight - 30 },
    }
  }
  function loadPos(): Record<'A' | 'B', { x: number; y: number }> {
    try {
      const d = JSON.parse(localStorage.getItem(POS_KEY) || '{}')
      const def = defaultPos()
      // 用户拖过（localStorage 有值）→ 沿用；否则用缺省（对话框内）
      return {
        A: { x: typeof d.A?.x === 'number' ? d.A.x : def.A.x, y: typeof d.A?.y === 'number' ? d.A.y : def.A.y },
        B: { x: typeof d.B?.x === 'number' ? d.B.x : def.B.x, y: typeof d.B?.y === 'number' ? d.B.y : def.B.y },
      }
    } catch { return defaultPos() }
  }
  const [pos, setPos] = useState<Record<'A' | 'B', { x: number; y: number }>>(loadPos)
  const posRef = useRef(pos)
  posRef.current = pos
  const dragRef = useRef<{ id: 'A' | 'B'; dx: number; dy: number; moved: boolean } | null>(null)
  const [justDragged, setJustDragged] = useState(false)

  function startDrag(id: 'A' | 'B', e: React.PointerEvent): void {
    e.preventDefault()
    dragRef.current = { id, dx: e.clientX - pos[id].x, dy: e.clientY - pos[id].y, moved: false }
    setTopPanel(id)
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(ev.clientX - (d.dx + pos[id].x)) > 4 || Math.abs(ev.clientY - (d.dy + pos[id].y)) > 4) d.moved = true
      // 不限制边界：支持把图标拖到浏览器可视范围之外（跨屏/贴边）
      const x = ev.clientX - d.dx
      const y = ev.clientY - d.dy
      setPos((p) => ({ ...p, [d.id]: { x, y } }))
    }
    const onUp = () => {
      const d = dragRef.current
      if (d && d.moved) {
        setJustDragged(true)
        setTimeout(() => { setJustDragged(false) }, 120)
      }
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)) } catch {}
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 收件箱游标持久化（localStorage，按 DID 隔离）：刷新后不重放历史消息/信令
  // （否则持久化的 signal offer 会在刷新后重新触发振铃——bug 修复）
  const SEQ_KEY = 'dsh-phone-seq-' + AGENT_DID.replace(/[^A-Za-z0-9]/g, '')
  const [lastSeq, setLastSeq] = useState(() => {
    try { return parseInt(localStorage.getItem(SEQ_KEY) || '0', 10) || 0 } catch { return 0 }
  })
  function bumpSeq(seq: number): void {
    if (seq > lastSeq) { setLastSeq(seq); try { localStorage.setItem(SEQ_KEY, String(seq)) } catch {} }
  }

  // @agent 投递（短信和群聊共用）：resolve→locate→ 投递到 agent 会话
  // source: 'sms'（回短信）| 'group'（回群广播）；groupId 群聊时带；groupConvId 群级会话 id（RCS 持续会话）
  async function sendSmsToAgent(agentName: string, content: string, fromNumber: string, source: 'sms' | 'group' = 'sms', groupId?: string, groupConvId?: string): Promise<boolean> {
    const agentDid = `did:cha2a:agent:${agentName}`
    // 排除投递给自己：@ 自己的短名/完整 DID → 不投递（否则自己收到自己发的消息，火山 A 案例）
    const myShort = AGENT_DID.replace(/^did:cha2a:agent:/, '')
    if (agentDid === AGENT_DID || agentName === myShort) return true
    try {
      const loc = await (await fetch(`${PHONE_BASE}/api/v1/agent/locate?did=${encodeURIComponent(agentDid)}`, { headers: { Accept: 'application/json' } })).json()
      if (loc && loc.bound && loc.sessionId) {
        const snap = (clientCtx as any)?.sessions?.list?.getSnapshot?.()
        const row = snap ? (snap.byId || {})[loc.sessionId] : undefined
        const binding = row ? (clientCtx as any)?.sessions?.binding?.(loc.sessionId) : null
        if (binding && binding.session && binding.session.prompt) {
          // 本实例会话存在 → 快路径直接注入（实例内，低延迟）
          const conversationId = source === 'group' && groupConvId ? groupConvId : `${source}-${fromNumber}-${Date.now()}`
          const srcTag = `<dsh-phone>{"source":"${source}","fromNumber":"${fromNumber}","conversationId":"${conversationId}"${groupId ? `,"groupId":"${groupId}"` : ''}}</dsh-phone>`
          const prompt = source === 'group'
            ? `${srcTag} [群聊消息] ${fromNumber} 在群里发来消息，请直接回复（回复会原样发回群里）。消息：${content}`
            : `${srcTag} [电话短信] 号码 ${fromNumber} 发来短信，请直接回复（你的回复会原样回给该号码）。短信内容：${content}`
          await binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
          return true
        }
        // 跨实例：locate 到会话但本实例无此会话（目标 agent 在别的 DSH 实例）
        // → 消息已广播进 registry 收件箱，目标实例的 node 半会轮询处理 → 视为已投递，不报错
        console.log(`[dsh-phone] @投递跨实例: ${agentDid} → 收件箱（目标实例处理）`)
        return true
      }
    } catch (e) { console.error('[dsh-phone] @agent 异常:', String(e).slice(0, 120)) }
    return false
  }

  // 短信经中继发送（registry 投递 + 收件箱；同页与跨设备同链路）
  async function sendSms(from: 'A' | 'B', text?: string, attachment?: SmsMsg['attachment'], to?: string): Promise<void> {
    // 发言身份：A 面板 = agent；B 面板 = owner（操作人员）——各是各的
    const panelIsB = from === 'B'
    const speakAs = panelIsB ? (OWNER_DID || MINE_NUM.B) : AGENT_DID
    const speakNumber = panelIsB ? (OWNER_DID || MINE_NUM.B) : MINE_NUM.A
    // 身份守卫：身份不明不能发短信——A 查 agent 注册、B 查 owner 注册
    if (panelIsB ? (account.ownerState === 'unregistered') : (account.agentState === 'unregistered')) {
      if (text) console.warn('[dsh-phone] 身份未注册，禁止发送短信')
      return
    }
    // @agent 投递：文本以 @<agent名> 开头 → resolve→locate→ 投递到 agent 会话（智能体互联网寻址）
    const m = text && text.match(/^@([\w\u4e00-\u9fa5.-]+)\s+([\s\S]*)$/)
    if (m && !attachment) {
      const agentName = m[1]
      const content = m[2].trim()
      const fromNumber = panelIsB ? NUM_B : NUM_A
      const delivered = await sendSmsToAgent(agentName, content, fromNumber)
      setSmsLog((l) => [...l, { fromNumber: `@${agentName}`, text: content, ts: Date.now() }])
      return
    }
    const target = to || PEER_NUM[from]
    let att = attachment
    if (attachment && !attachment.fileId) {
      // 先上传附件拿 fileId
      try {
        const buf = await (await fetch(attachment.url!)).blob()
        const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(buf) })
        const up = await (await fetch(`${RCS_BASE}/api/v1/phone/attachment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ did: AGENT_DID, name: attachment.name, mime: attachment.type, data: b64 }) })).json()
        if (up.ok) att = { ...attachment, fileId: up.fileId, hash: up.hash }
      } catch { return }
    }
    const body: any = { from: speakAs, fromNumber: speakNumber, to, text: text || undefined, attachment: att ? { fileId: att.fileId, name: att.name, size: att.size, hash: att.hash } : undefined }
    // 检查响应状态：402（余额不足）/其他错误必须提示，不能"假成功"（本地显示已发送但实际未发出）
    try {
      const r = await fetch(`${RCS_BASE}/api/v1/phone/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) {
        let msg = `发送失败（HTTP ${r.status}）`
        try { const d = await r.json(); if (d && d.error) msg = d.error } catch {}
        if (r.status === 402) msg = '余额不足，请先充值（群聊页右上「充值」）'
        alert(msg)
        return
      }
    } catch { alert('发送失败（网络错误）'); return }
    setSmsLog((l) => [...l, { fromNumber: speakNumber, text, attachment: att, ts: Date.now() }])
  }

  // 轮询收件箱（增量，seq 游标；5s）
  React.useEffect(() => {
    const poll = async () => {
      try {
        const d = await (await fetch(`${RCS_BASE}/api/v1/phone/messages?did=${encodeURIComponent(AGENT_DID)}&since=${lastSeq}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })).json()
        if (d.messages && d.messages.length) {
          bumpSeq(Math.max(...d.messages.map((m: any) => m.seq || 0)))
          // 新消息通知（微信式横幅）：排除信令；当前正看对应会话则不弹
          const fresh = d.messages.filter((m: any) => !m.signal)
          const latestMsg = fresh.length ? fresh[fresh.length - 1] : null
          if (latestMsg) {
            const isGrp = !!latestMsg.groupId
            // 群消息：当前正看该群则不弹；短信消息：总是弹（轮询在共享层，无 per-panel view 信息）
            const viewingSame = isGrp && currentGroup?.groupId === latestMsg.groupId
            if (!viewingSame) {
              const sender = latestMsg.agent?.name
                || (latestMsg.fromNumber ? String(latestMsg.fromNumber).replace(/^\+/, '') : String(latestMsg.from || '新消息'))
              const body = latestMsg.text
                ? String(latestMsg.text).slice(0, 40) + (String(latestMsg.text).length > 40 ? '…' : '')
                : latestMsg.attachment ? '📎 附件'
                : latestMsg.kind === 'card' ? '🃏 卡片消息' : '新消息'
              const grpName = isGrp ? (groupListRef.current.find((g) => g.groupId === latestMsg.groupId)?.name || '群消息') : null
              showNotif({
                key: String(latestMsg.seq || Date.now()),
                title: isGrp ? (grpName || '群消息') : sender,
                body: isGrp ? `${sender}：${body}` : body,
                jump: isGrp
                  ? async () => { const g = groupListRef.current.find((x) => x.groupId === latestMsg.groupId); if (g) { await openGroup(g.groupId); nav('group-chat') } }
                  : () => nav('sms'),
              })

            }
          }
          // 短信列表：排除信令 + 群消息（群消息有自己的会话流）
          setSmsLog((l) => [...l, ...d.messages.filter((m: any) => !m.signal && !m.groupId).map((m: any) => ({
            fromNumber: m.fromNumber || '对端', text: m.text || undefined,
            attachment: m.attachment ? { name: m.attachment.name, size: m.attachment.size, hash: m.attachment.hash, fileId: m.attachment.fileId, url: `${RCS_BASE}/api/v1/phone/attachment/${m.attachment.fileId}`, type: 'application/octet-stream' } : undefined,
            ts: Date.parse(m.at) || Date.now(), seq: m.seq,
          }))])
          // 群消息：当前打开了群 → 增量追加（seq > 已处理游标，防与 openGroup 全量拉取重复）
          if (currentGroup) {
            const gid = currentGroup.groupId
            const base = groupLastSeq.current[gid] || 0
            const gm = d.messages.filter((m: any) => m.groupId === gid && (m.seq || 0) > base)
            if (gm.length) {
              groupLastSeq.current[gid] = Math.max(...gm.map((m: any) => m.seq || 0), base)
              setGroupMsgLog((l) => [...l, ...gm.map((m: any) => ({ fromNumber: m.fromNumber || '对端', text: m.text || '', ts: Date.parse(m.at) || Date.now(), ...(m.agent ? { agent: m.agent } : {}), ...(m.kind ? { kind: m.kind } : {}), ...(m.payload ? { payload: m.payload } : {}), ...(m.status ? { status: m.status } : {}), seq: m.seq }))])
            }
          }
          // 信令消息（语音 offer/answer/candidate）→ 处理
          for (const m of d.messages) { if (m.signal) handleSignal(m) }
        }
        // 群消息实时性：广播排除发送者（自己发的群消息不在自己收件箱），当前打开群时增量拉群历史
        // ——否则 agent（node 半）的回复/自己发的群消息要刷新（重开群全量）才显示
        if (currentGroup) pollGroupMessages(currentGroup.groupId)
      } catch {}
    }
    poll()
    const t = setInterval(poll, 2500)
    return () => clearInterval(t)
  }, [lastSeq, currentGroup])

  function onUnlock(name: string): void {
    const th = THEMES[name]
    if (!th) return
    // 2026-08-28：积分消费端点已加服务端鉴权（rcs-server 内部专用），主题解锁改为免费本地解锁
    const u = [...unlocked, name]; setUnlocked(u); localStorage.setItem(UNLOCKED_KEY, JSON.stringify(u))
  }
  function onSelectTheme(id: 'A' | 'B', name: string): void {
    if (id === 'A') { setThemeA(name); localStorage.setItem(THEME_KEY + '-a', name) }
    else { setThemeB(name); localStorage.setItem(THEME_KEY + '-b', name) }
  }


  
  function reportUsage(type: string, amount: number): void {
    fetch(`${PHONE_BASE}/api/v1/phone/usage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, type, amount }),
    }).catch(() => {})   // 静默失败，不影响主流程
  }

  // ── 语音角色：本端是主叫还是被叫、本端号码 ──
  const myRole = useRef<'caller' | 'callee' | null>(null)
  const myNumRef = useRef<string | null>(null)
  const callTargetRef = useRef<string | null>(null)   // 当前呼叫目标号码（跨设备信令寻址）
  // NUM_A/NUM_B 已从 config 导入（MINE_NUM 环境变量推导），此处不重复定义

  // 拨号：解析号码 → 设置通话状态（ringing）→ 对端面板被唤起
  // 振铃超时：30s 无应答自动挂断（防测试残留/对方不接一直响）
  const ringingTimer = useRef<any>(null)
  function armRingingTimeout(): void {
    clearTimeout(ringingTimer.current)
    ringingTimer.current = setTimeout(() => {
      setCall((c) => {
        if (c && c.stage === 'ringing') { reportUsage('call_seconds', 0); return null }
        return c
      })
      try { endVoice() } catch { /* 无会话时忽略 */ }
    }, 30000)
  }
  function clearRingingTimeout(): void { clearTimeout(ringingTimer.current) }

  async function onDial(fromId: 'A' | 'B', target: string): Promise<void> {
    reportUsage('calls', 1)
    myRole.current = 'caller'
    myNumRef.current = fromId === 'A' ? NUM_A : NUM_B
    try {
      const res = await fetch(`${PHONE_BASE}/api/v1/phone/resolve?number=${encodeURIComponent(target)}`, {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json()
      // 呼叫目标 = resolve 返回的规范号码（跨设备寻址：信令发给被叫号码，非固定对端）
      const targetNum = (data && data.number) || target.replace(/[^0-9+]/g, '')
      callTargetRef.current = targetNum
      // calleeId：目标为同页对端才映射对面面板（B 振铃）；跨设备用目标号码（B 面板不振铃，等对端设备）
      const isPeer = targetNum === (fromId === 'A' ? NUM_B : NUM_A)
      const calleeId = isPeer ? (fromId === 'A' ? 'B' : 'A') : targetNum
      setCall({ stage: 'ringing', callerId: fromId, calleeId, call: data, connectedAt: Date.now() })
      armRingingTimeout()
      // 主叫方立即发起语音建连（发 offer 经中继，被叫方收到即唤起）
      establishVoice()
    } catch {
      const tNum = target.replace(/[^0-9+]/g, '')
      const isPeer2 = tNum === (fromId === 'A' ? NUM_B : NUM_A)
      setCall({ stage: 'ringing', callerId: fromId, calleeId: isPeer2 ? (fromId === 'A' ? 'B' : 'A') : tNum, call: { registered: false, reason: '解析失败' }, connectedAt: Date.now() })
      armRingingTimeout()
    }
  }

  function onAnswer(): void {
    myRole.current = 'callee'
    myNumRef.current = call?.calleeId === 'A' ? NUM_A : (call?.calleeId === 'B' ? NUM_B : (call?.calleeId || NUM_B))
    console.log('[dsh-phone] onAnswer: role=callee myNum=' + myNumRef.current + ' pendingOffer=' + !!pendingOffer.current + ' pc=' + !!voiceRef.pc)
    clearRingingTimeout()
    setCall((c) => (c ? { ...c, stage: 'connected', connectedAt: Date.now() } : c))
    establishVoice()
  }

  function onHangup(): void {
    clearRingingTimeout()
    if (call) {
      const secs = Math.max(1, Math.round((Date.now() - call.connectedAt) / 1000))
      reportUsage('call_seconds', secs)
    }
    setCall(null)
    endVoice()
  }

  // ── 语音：信令经中继（P2P 媒体 + STUN 打洞）──
  // STUN 服务器：默认从 PHONE_BASE 推导（去掉协议 → stun:<host>:3478），可 env DSH_PHONE_STUN 覆盖
  const stunHost = (typeof process !== 'undefined' && (process as any).env?.DSH_PHONE_STUN) || PHONE_BASE.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const ICE = { iceServers: [{ urls: `stun:${stunHost}:3478` }] }
  const [pc, setPc] = useState<RTCPeerConnection | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const voiceRef = { pc: pc, local: localStream, muted: false }
  const signalBuf = useRef<Array<any>>([])   // 待处理信令缓冲
  const pendingOffer = useRef<any>(null)
  const candBuf = useRef<Array<any>>([])     // 待加入的 ICE candidate（remoteDescription 就绪前缓冲）

  function flushCandidates(): void {
    while (candBuf.current.length) {
      const c = candBuf.current.shift()!
      voiceRef.pc?.addIceCandidate(c).catch(() => {})
    }
  }

  function sendSignal(type: string, data: any): void {
    const from = myNumRef.current || NUM_A
    // 信令目标：优先当前呼叫目标（跨设备拨号目标号码）；同页 A↔B 回退固定对端
    const to = callTargetRef.current || (from === NUM_A ? NUM_B : NUM_A)
    fetch(`${RCS_BASE}/api/v1/phone/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AGENT_DID, fromNumber: from, to, signal: { type, data } }),
    }).catch(() => {})
  }

  // 已消费信令去重（localStorage：signal id → 处理过；防刷新/多面板重复消费持久化信令）
  const SIG_KEY = 'dsh-phone-sig-' + AGENT_DID.replace(/[^A-Za-z0-9]/g, '')
  function signalSeen(id: string | undefined): boolean {
    if (!id) return false
    try {
      const seen = JSON.parse(localStorage.getItem(SIG_KEY) || '[]') as string[]
      if (seen.includes(id)) return true
      seen.push(id)
      localStorage.setItem(SIG_KEY, JSON.stringify(seen.slice(-200)))  // 只留最近 200 条
      return false
    } catch { return false }
  }
  // 信令时效（TTL）：超过该时长的信令视为陈旧，不再触发振铃（历史残留 offer 会在刷新后误振铃）
  const SIGNAL_TTL_MS = 5 * 60 * 1000   // 5 分钟
  async function handleSignal(m: any): Promise<void> {
    const sig = m.signal
    if (!sig) return
    // 陈旧信令过滤：at 超过 TTL 的 offer/answer/candidate 不再处理
    // （振铃超时 30s 已处理"未应答"；这里的 TTL 防"历史信令在刷新后被重放"）
    if (m.at) {
      const age = Date.now() - Date.parse(m.at)
      if (!isNaN(age) && age > SIGNAL_TTL_MS) {
        signalSeen(m.id)   // 顺手标记为已见（防反复检查）
        return
      }
    }
    if (signalSeen(m.id)) return  // 已处理过的信令（刷新后轮询到持久化旧信令）不再触发
    // 旧版本/无身份来源的信令（fromNumber 为 '信令'）不再处理
    if (!m.fromNumber || m.fromNumber === '信令') return
    // 同页双面板共享组件：发给任一号码的信令都可能是本页的
    const from = myNumRef.current
    if (from && m.to !== from && m.to !== (from === NUM_A ? NUM_B : NUM_A)) return
    // answer/candidate 的自回声丢弃（避免重复处理自己的应答/候选）
    if (from && m.fromNumber === from && sig.type !== 'offer') return
    signalBuf.current.push(m)
    await drainSignals()
  }

  async function drainSignals(): Promise<void> {
    while (signalBuf.current.length) {
      const m = signalBuf.current.shift()!
      const sig = m.signal
      try {
        if (sig.type === 'offer') {
          const selfEcho = !!myNumRef.current && m.fromNumber === myNumRef.current
          // 呼叫目标 = 主叫号码（应答/候选信令回主叫）
          if (m.fromNumber && !selfEcho) callTargetRef.current = m.fromNumber.replace(/[^0-9+]/g, '')
          // 唤起被叫方来电（跨设备：对端页面收到 offer → 显示来电）
          pendingOffer.current = sig.data
          if (selfEcho) {
            // 同页回环：唤起本页对端面板来电（可手动接听）
            const calleePanel2 = m.to === NUM_A ? 'A' : 'B'
            setCall({ stage: 'ringing', callerId: 'A', calleeId: calleePanel2, call: { registered: true }, connectedAt: Date.now() })
            armRingingTimeout()
            continue
          }
          const calleePanel = m.to === NUM_A ? 'A' : (m.to === NUM_B ? 'B' : (myNumRef.current === NUM_A ? 'A' : 'B'))
          const callerPanel = m.fromNumber === NUM_A ? 'A' : (m.fromNumber === NUM_B ? 'B' : (m.fromNumber || 'remote'))
          const callerId = callerPanel
          const calleeId = calleePanel
          myRole.current = 'callee'
          myNumRef.current = m.to || NUM_B
          setCall({ stage: 'ringing', callerId, calleeId, call: { registered: true }, connectedAt: Date.now() })
          armRingingTimeout()
          // 若本端已接听（voiceRef.pc 存在）→ 直接应答
          if (voiceRef.pc) {
            await voiceRef.pc.setRemoteDescription(sig.data)
            flushCandidates()
            const ans = await voiceRef.pc.createAnswer()
            await voiceRef.pc.setLocalDescription(ans)
            sendSignal('answer', ans)
          }
        } else if (sig.type === 'answer') {
          console.log('[dsh-phone] 收到 answer, pc=' + !!voiceRef.pc)
          await voiceRef.pc?.setRemoteDescription(sig.data)
          setVoiceState('connected')
          setCall((c) => (c ? { ...c, stage: 'connected' } : c))
          flushCandidates()
        } else if (sig.type === 'candidate') {
          // candidate 可能先于 remoteDescription 到达 → 缓冲，remote 就绪后再加
          if (!voiceRef.pc || !voiceRef.pc.remoteDescription) { candBuf.current.push(sig.data) }
          else await voiceRef.pc.addIceCandidate(sig.data)
        }
      } catch (e) { console.error('信令处理失败', e) }
    }
  }

  async function establishVoice(): Promise<void> {
    console.log('[dsh-phone] establishVoice: role=' + myRole.current + ' pc=' + !!voiceRef.pc + ' pendingOffer=' + !!pendingOffer.current)
    if (voiceRef.pc) {
      // 同页回环：pc 已存在（本页主叫建的）→ 被叫面板接听时用现有 pc 应答
      if (myRole.current === 'callee' && pendingOffer.current) {
        try {
          await voiceRef.pc.setRemoteDescription(pendingOffer.current)
          pendingOffer.current = null
          const ans = await voiceRef.pc.createAnswer()
          await voiceRef.pc.setLocalDescription(ans)
          sendSignal('answer', ans)
        } catch (e) { console.error('回环应答失败', e) }
      }
      return
    }
    try {
      console.log('[dsh-phone] establishVoice: 请求麦克风…')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
        alert('[dsh-phone] 语音需要麦克风权限：请在浏览器地址栏允许使用麦克风（' + (e.name || '') + '）')
        throw e
      })
      console.log('[dsh-phone] establishVoice: 麦克风 OK, 建 pc…')
      const p = new RTCPeerConnection(ICE)
      stream.getTracks().forEach((t) => p.addTrack(t, stream))
      p.onicecandidate = (e) => { if (e.candidate) sendSignal('candidate', e.candidate) }
      p.ontrack = (e) => {
        const audio = new Audio()
        audio.srcObject = e.streams[0]
        audio.play().catch(() => {})
      }
      setPc(p); setLocalStream(stream)
      voiceRef.pc = p; voiceRef.local = stream
      console.log('[dsh-phone] establishVoice: pc 就绪, role=' + myRole.current)
      if (myRole.current === 'caller') {
        // 主叫方：发起 offer
        const offer = await p.createOffer()
        await p.setLocalDescription(offer)
        sendSignal('offer', offer)
      } else if (pendingOffer.current) {
        // 被叫方：offer 已由中继拉到（pendingOffer）→ 应答
        console.log('[dsh-phone] 被叫应答: setRemoteDescription…')
        await p.setRemoteDescription(pendingOffer.current)
        pendingOffer.current = null
        flushCandidates()
        console.log('[dsh-phone] 被叫应答: createAnswer…')
        const ans = await p.createAnswer()
        await p.setLocalDescription(ans)
        console.log('[dsh-phone] 被叫应答: send answer')
        sendSignal('answer', ans)
      }
    } catch (e) { console.error('语音建连失败：', e) }
  }

  function endVoice(): void {
    pc?.close(); setPc(null); setLocalStream(null)
    voiceRef.pc = null
    localStream?.getTracks().forEach((t) => t.stop())
  }

  function toggleMute(): void {
    voiceRef.muted = !voiceRef.muted
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !voiceRef.muted })
    setVoiceState((s) => s)  // 触发重渲染
  }

  const [voiceState, setVoiceState] = useState<'idle' | 'calling' | 'connected'>('idle')
  const voiceFace = { active: voiceState === 'connected' || voiceState === 'calling', muted: voiceRef.muted, onToggleMute: toggleMute } as any

  return (
    <>
      <PhonePanel id="A" label={`${dispName.a} · ${MINE_NUM.A}`} floatLabel={dispName.a} ownNumber={MINE_NUM.A} otherNumber={PEER_NUM.A}
        badgeLevel={3} smsList={smsLog} onSendSms={sendSms} voice={voiceFace}
        group={{ list: groupList, current: currentGroup, msgs: groupMsgLog, onLoadList: loadGroupList, onCreate: createGroup, onOpen: (gid) => { setCurrentGroup(null); setGroupMsgLog([]); return openGroup(gid) }, onSend: sendGroup, onLeave: leaveGroup, onDisband: disbandGroup, onAnnouncement: setAnnouncement, onBack: () => { setCurrentGroup(null); setGroupMsgLog([]) } }} onReport={reportUsage} theme={themeOf('A')} unlocked={unlocked} onUnlock={onUnlock} onSelectTheme={(n) => onSelectTheme('A', n)} top={topPanel === 'A'} onFocus={() => setTopPanel('A')} call={call} onDial={onDial} onAnswer={onAnswer} onHangup={onHangup} pos={pos.A} onDragStart={(e) => startDrag('A', e)} justDragged={justDragged} account={account} checkAgentRegistered={checkAgentRegistered} registerAgent={registerAgent} checkOwnerRegistered={checkOwnerRegistered} registerOwner={registerOwner} loadAccount={loadAccount} applyAccount={applyAccount} notif={notif} onNotifDismiss={() => setNotif(null)} />
      <PhonePanel id="B" label={`${dispName.b} · ${MINE_NUM.B}`} floatLabel={dispName.b} ownNumber={MINE_NUM.B} otherNumber={PEER_NUM.B}
        badgeLevel={3} smsList={smsLog} onSendSms={sendSms} voice={voiceFace}
        group={{ list: groupList, current: currentGroup, msgs: groupMsgLog, onLoadList: loadGroupList, onCreate: createGroup, onOpen: (gid) => { setCurrentGroup(null); setGroupMsgLog([]); return openGroup(gid) }, onSend: sendGroup, onLeave: leaveGroup, onDisband: disbandGroup, onAnnouncement: setAnnouncement, onBack: () => { setCurrentGroup(null); setGroupMsgLog([]) } }} onReport={reportUsage} theme={themeOf('B')} unlocked={unlocked} onUnlock={onUnlock} onSelectTheme={(n) => onSelectTheme('B', n)} top={topPanel === 'B'} onFocus={() => setTopPanel('B')} call={call} onDial={onDial} onAnswer={onAnswer} onHangup={onHangup} pos={pos.B} onDragStart={(e) => startDrag('B', e)} justDragged={justDragged} account={account} checkAgentRegistered={checkAgentRegistered} registerAgent={registerAgent} checkOwnerRegistered={checkOwnerRegistered} registerOwner={registerOwner} loadAccount={loadAccount} applyAccount={applyAccount} notif={notif} onNotifDismiss={() => setNotif(null)} />
    </>
  )
}
