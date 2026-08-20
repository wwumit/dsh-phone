/**
 * dsh-phone client plugin — DSH 对话中的电话机（浮窗 + /phone 命令）
 *
 * 两种触发：
 *   1. 浮窗：conversation.input.overlay 条目渲染 📞 悬浮按钮（常显）+ 拨号盘（按需展开）
 *   2. /phone 命令：commandUi popupSelect——选择"打开拨号盘"或直拨常用号码
 *
 * 共享状态：dshPhone 服务（ctx.provide）持有浮窗 open/number 的 snapshot store，
 * overlay 组件（useSyncExternalStore 订阅）与命令（onSelect 写）联动。
 */
import React, { useRef, useState, useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

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

const PHONE_BASE = 'https://compliancehub.cn'
const CALLER_NUM = '+86 95123 0001' // 主叫 = 电话 A

export function apply(ctx: ClientContext): void {
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
        options: async () => [
          { id: 'open', label: '📞 打开拨号盘' },
          { id: 'dshlib', label: '拨打 dshlib Agent Line', detail: '+86 95123 0001' },
          { id: 'term-a', label: '拨打 term-a（测试终端）', detail: '+86 95123 0030' },
          { id: 'term-b', label: '拨打 term-b（测试终端）', detail: '+86 95123 0031' },
        ],
        onSelect: (opt) => {
          const direct: Record<string, string> = {
            dshlib: '+86951230001', 'term-a': '+86951230030', 'term-b': '+86951230031',
          }
          if (opt.id === 'open') store.set({ open: true, number: store.getSnapshot().number })
          else if (direct[opt.id]) store.set({ open: true, number: direct[opt.id] })
        },
      },
    })
  })
}

// ── 主题系统（皮肤：颜色 + 形状 + 键盘 + 字体）──────────────────
interface Theme {
  name: string; label: string; unlock?: number
  shell: string; screen: string; key: string; card: string; border: string
  accent: string; ok: string; bad: string; warn: string
  sub: string; muted: string; text: string; msgMine: string; msgOther: string
  shape: 'round' | 'squared' | 'retro'
  keys: 'circle' | 'square' | 'retro'
  font: string
}
const THEMES: Record<string, Theme> = {
  classic: { name: 'classic', label: '经典深色', shell: '#000', screen: '#000', key: '#1c1c1e', card: '#1c1c1e', border: '#2c2c2e', accent: '#0a84ff', ok: '#34c759', bad: '#ff3b30', warn: '#fbbf24', sub: '#8e8e93', muted: '#48484a', text: '#fff', msgMine: '#0b84ff', msgOther: '#26262a', shape: 'round', keys: 'circle', font: '-apple-system, "SF Pro", sans-serif' },
  nebula: { name: 'nebula', label: '星空蓝', shell: '#070a24', screen: '#0a0e2e', key: '#161b3f', card: '#161b3f', border: '#2a3160', accent: '#7c6cf6', ok: '#30d158', bad: '#ff453a', warn: '#ffd60a', sub: '#9a9ac8', muted: '#55558a', text: '#eef0ff', msgMine: '#5e5ce6', msgOther: '#23285c', shape: 'round', keys: 'circle', font: '-apple-system, "SF Pro", sans-serif' },
  sunset: { name: 'sunset', label: '活力橙', shell: '#1a0d04', screen: '#241206', key: '#33200f', card: '#33200f', border: '#4a2f16', accent: '#ff9f0a', ok: '#ffd60a', bad: '#ff453a', warn: '#ff9f0a', sub: '#b08a5e', muted: '#6e5636', text: '#fff3e6', msgMine: '#ff9500', msgOther: '#3a2a14', shape: 'squared', keys: 'square', font: '-apple-system, "SF Pro", sans-serif' },
  mint: { name: 'mint', label: '薄荷绿', shell: '#03130d', screen: '#051b12', key: '#0e2e20', card: '#0e2e20', border: '#1c4a35', accent: '#30d158', ok: '#30d158', bad: '#ff453a', warn: '#ffd60a', sub: '#7fb8a0', muted: '#3f6e5c', text: '#eafff4', msgMine: '#248a3d', msgOther: '#13352a', shape: 'round', keys: 'circle', font: '-apple-system, "SF Pro", sans-serif' },
  graphite: { name: 'graphite', label: '深空黑', shell: '#000', screen: '#050505', key: '#141414', card: '#141414', border: '#262626', accent: '#8e8e93', ok: '#30d158', bad: '#ff453a', warn: '#ffd60a', sub: '#6e6e73', muted: '#3a3a3c', text: '#f5f5f7', msgMine: '#48484a', msgOther: '#1c1c1e', shape: 'squared', keys: 'square', font: '-apple-system, "SF Pro", sans-serif' },
  retro: { name: 'retro', label: '复古电话', shell: '#f4e9d8', screen: '#f9f3e7', key: '#d8c49a', card: '#efe4d0', border: '#b3a07c', accent: '#b45309', ok: '#16a34a', bad: '#dc2626', warn: '#d97706', sub: '#6b5433', muted: '#8a7355', text: '#241a0d', msgMine: '#b45309', msgOther: '#e0d2ba', shape: 'retro', keys: 'retro', font: '"Courier New", monospace' },
}
const THEME_KEY = 'dsh-phone-theme'
const UNLOCKED_KEY = 'dsh-phone-unlocked'

// ── 电话面板（单部电话完整画面：拨号盘 + 来电/通话 + 独立短信窗）────

interface SmsMsg {
  fromNumber: string       // 发送方号码（等于本机号码=自己→右，否则对端→左）
  text?: string
  attachment?: { name: string; size: number; type: string; url?: string; fileId?: string; hash?: string }
  ts: number
  seq?: number
}

function PhonePanel(props: {
  id: 'A' | 'B'
  label: string
  ownNumber: string
  otherNumber: string
  smsList: SmsMsg[]
  onSendSms: (from: 'A' | 'B', text?: string, attachment?: SmsMsg['attachment']) => void
  voice: { active: boolean; muted: boolean; onToggleMute(): void }
  group: { msgs: Array<{ from: string; text: string; ts: number }>; onSend(from: string, text: string): void }
  onReport(type: string, amount: number): void
  theme: Theme
  unlocked: string[]
  onUnlock(name: string): void
  onSelectTheme(name: string): void
  top: boolean
  onFocus(): void
  badgeLevel: number
  call: { stage: 'ringing' | 'connected'; callerId: 'A' | 'B'; calleeId: 'A' | 'B'; call?: any; connectedAt: number } | null
  onDial(fromId: 'A' | 'B', target: string): void
  onAnswer(): void
  onHangup(): void
}): JSX.Element {
  const t = props.theme
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<null | { num: string }>(null)
  const [smsInput, setSmsInput] = useState('')
  const [view, setView] = useState<'dial' | 'contacts' | 'group' | 'usage' | 'account' | 'theme'>('dial')
  const [contacts, setContacts] = useState<Array<{ number: string; agentDid: string; displayName: string | null; level: number }> | null>(null)
  const [contactsErr, setContactsErr] = useState('')
  const [groupInput, setGroupInput] = useState('')
  const [usage, setUsage] = useState<any>(null)
  const [account, setAccount] = useState<{ numbers: string[]; applying: boolean; done: string | null; err: string; credits: number; welcome: number }>({ numbers: [], applying: false, done: null, err: '', credits: 0, welcome: 0 })
  const [acctName, setAcctName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sender = props.id === 'A' ? '电话 A（+86 95123 0001）' : '电话 B（+86 95123 0002）'

  // 来电强制唤起本面板
  const incoming = props.call && props.call.calleeId === props.id
  const isCaller = props.call && props.call.callerId === props.id
  const isConnected = props.call && props.call.stage === 'connected'
  const effectiveOpen = open || !!incoming

  function sendGroup(): void {
    const text = groupInput.trim()
    if (!text) return
    props.group.onSend(sender, text)
    setGroupInput('')
    props.onReport('group_msgs', 1)
  }

  function loadContacts(): void {
    if (contacts) { setView('contacts'); return }
    fetch(`${PHONE_BASE}/api/v1/phone/directory`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { setContacts(d.numbers || []); setView('contacts') })
      .catch(() => setContactsErr('通讯录加载失败'))
  }

  const AGENT_DID = 'did:cha2a:agent:dshlib'
  function loadAccount(): void {
    fetch(`${PHONE_BASE}/api/v1/phone/lookup?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { setAccount((a) => ({ ...a, numbers: d.numbers || [], done: null, err: '' })); setView('account') })
    fetch(`${PHONE_BASE}/api/v1/phone/credits?did=${encodeURIComponent(AGENT_DID)}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { setAccount((a) => ({ ...a, credits: d.credits || 0 })) })
      .catch(() => {})
      .catch(() => {})
  }
  async function applyAccount(): Promise<void> {
    setAccount((a) => ({ ...a, applying: true, err: '' }))
    try {
      const r = await fetch(`${PHONE_BASE}/api/v1/phone/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentDid: AGENT_DID, displayName: acctName, consent: true }),
      })
      const d = await r.json()
      if (r.status === 201) {
        setAccount((a) => ({ ...a, numbers: [...a.numbers, d.number], done: d.number, welcome: d.welcomeCredits || 0, credits: (a.credits || 0) + (d.welcomeCredits || 0), applying: false }))
      } else {
        setAccount((a) => ({ ...a, err: d.error || '申请失败', applying: false }))
      }
    } catch { setAccount((a) => ({ ...a, err: '网络错误', applying: false })) }
  }

  function loadUsage(): void {
    fetch(`${PHONE_BASE}/api/v1/phone/usage?did=${encodeURIComponent('did:cha2a:agent:dshlib')}`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { setUsage(d.usage); setView('usage') })
      .catch(() => {})
  }

  const target = local?.num ?? '+86'
  const isMine = (m: SmsMsg) => m.fromNumber === props.ownNumber
  const mySms = props.smsList.filter(isMine)
  const peerSms = props.smsList.filter((m) => !isMine(m))

  function dial(): void {
    if (target === '+86') return
    props.onDial(props.id, target)   // 交给共享层：解析 + 唤起对端
  }
  function hangup(): void { setOpen(false); setLocal(null); props.onHangup() }

  function sendSms(): void {
    const text = smsInput.trim()
    if (!text) return
    props.onSendSms(props.id, text)
    setSmsInput('')
    props.onReport('sms_sent', 1)
  }

  async function sendAttachment(file: File): Promise<void> {
    const buf = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
    props.onSendSms(props.id, undefined, {
      name: file.name, size: file.size, type: file.type || 'application/octet-stream',
      url: URL.createObjectURL(file), hash,
    })
    props.onReport('attachment_bytes', file.size)
  }

  const ringTone = { idle: '#64748b', ok: '#34d399', warn: t.warn, bad: '#f87171', ring: t.accent }
  const tone: 'idle' | 'ok' | 'warn' | 'bad' | 'ring' =
    isConnected ? 'ok' : incoming ? (props.call && props.call.call && props.call.call.trust && props.call.call.trust.level > 0 ? 'ok' : 'warn') : 'idle'

  const shellRadius = t.shape === 'squared' ? 24 : t.shape === 'retro' ? 36 : 42
  const screenRadius = t.shape === 'squared' ? 18 : t.shape === 'retro' ? 28 : 34
  const keyRadius = t.keys === 'circle' ? '50%' : t.keys === 'square' ? 12 : 6
  const shellStyle: React.CSSProperties = {
    position: 'fixed', right: props.id === 'A' ? 18 : 82, bottom: 150, width: 300,
    background: t.shell, borderRadius: shellRadius, border: `2px solid ${props.top ? t.accent : t.border}`,
    boxShadow: '0 20px 60px rgba(0,0,0,.6)', padding: '8px 8px 12px', zIndex: props.top ? 1100 : 1000, fontFamily: t.font,
  }
  const screenStyle: React.CSSProperties = {
    background: t.screen, borderRadius: screenRadius, overflow: 'hidden', color: t.text,
    display: 'flex', flexDirection: 'column', height: 588,
  }
  const keyStyle: React.CSSProperties = {
    height: t.keys === 'retro' ? 52 : 46, borderRadius: keyRadius, background: t.key, color: t.text, border: t.keys === 'retro' ? '2px solid ' + t.border : 0, fontSize: t.keys === 'retro' ? 22 : 20, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  }
  const roundBtn = (bg: string, w = 56): React.CSSProperties => ({
    width: w, height: w, borderRadius: '50%', background: bg, color: '#fff', border: 0, fontSize: 11, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
  })

  return (
    <>
      <button
        onClick={() => { props.onFocus(); setOpen(!open) }}
        style={{ position: 'fixed', right: props.id === 'A' ? 18 : 82, bottom: 88, width: 52, height: 52, borderRadius: '50%',
          background: t.key, color: t.accent, border: incoming ? '2px solid #22d3ee' : '1px solid #3a3a3c',
          fontSize: 20, cursor: 'pointer', zIndex: 999, boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}
        aria-label={`dsh-phone ${props.id}`} title={`${props.label} · ${props.ownNumber}`}
      >
        📞{incoming ? '🔔' : ''}
        <span style={{ position: 'absolute', bottom: -7, left: 0, right: 0, fontSize: 9, color: t.sub }}>{props.id}</span>
      </button>

      {effectiveOpen && (
        <div style={shellStyle} onClick={() => props.onFocus()}>
          <div style={{ width: 84, height: 20, background: '#000', borderRadius: 12, margin: '2px auto 6px', border: '1px solid #1c1c1e' }} />
          <div style={screenStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 18px 0', fontSize: 11, color: '#fff' }}>
              <span>{new Date().toTimeString().slice(0, 5)}</span>
              <span>📶 🔋</span>
            </div>

            <div style={{ flex: 1, padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div style={{ fontSize: 12, color: t.sub }}>{props.label}{incoming ? ' · 来电' : ''}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setView('group')} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer' }}>💬</button>
                  <button onClick={loadContacts} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer' }}>👥</button>
                  <button onClick={loadUsage} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer' }}>📊</button>
                  <button onClick={loadAccount} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer' }}>📱</button>
                  <button onClick={() => setView('theme')} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer' }}>🎨</button>
                </div>
              </div>

              {view !== 'contacts' && view !== 'group' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '6px 0 10px' }}>
                  <div style={{ fontSize: 20, letterSpacing: 1, color: '#fff' }}>{props.ownNumber}</div>
                  <img src={`${PHONE_BASE}/store/assets/l${props.badgeLevel}.png`} alt={`L${props.badgeLevel}`} style={{ height: 26 }} />
                </div>
              )}

              {incoming && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#1c1c1e,#000)', borderRadius: 24, margin: '4px 0 8px', padding: 16 }}>
                  <div style={{ fontSize: 26, fontWeight: 600, color: '#fff' }}>📞 {props.id === 'A' ? '电话 B' : '电话 A'}</div>
                  <div style={{ fontSize: 15, color: t.sub, margin: '4px 0 10px' }}>{props.id === 'A' ? '+86 95123 0002' : '+86 95123 0001'}</div>
                  {props.call && props.call.call && props.call.call.registered && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.sub, marginBottom: 14 }}>
                      <img src={`${PHONE_BASE}/store/assets/l${props.call.call.trust?.level ?? 0}.png`} alt="badge" style={{ height: 18 }} />
                      <span>{props.call.call.agentDid}{props.call.call.trust?.revoked ? ' · 已撤销' : ''}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 40, marginTop: 10 }}>
                    <button onClick={props.onAnswer} style={roundBtn(t.ok, 64)}>📞<span>接听</span></button>
                    <button onClick={hangup} style={roundBtn(t.bad, 64)}>✕<span>拒接</span></button>
                  </div>
                </div>
              )}

              {isConnected && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#000,#1c1c1e)', borderRadius: 24, margin: '4px 0 8px', padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 600 }}>{props.id === 'A' ? '电话 B' : '电话 A'}</div>
                  <div style={{ fontSize: 14, color: t.sub, margin: '4px 0 6px' }}>{props.id === 'A' ? '+86 95123 0002' : '+86 95123 0001'}</div>
                  <div style={{ fontSize: 30, fontWeight: 300, margin: '8px 0 18px' }}>{((Date.now() - props.call.connectedAt) / 1000) | 0}<span style={{ fontSize: 16 }}>s</span></div>
                  <div style={{ display: 'flex', gap: 26 }}>
                    <button onClick={() => props.voice.onToggleMute()} style={roundBtn(t.key, 58)}>{props.voice.muted ? '🔇' : '🔊'}<span style={{ fontSize: 9 }}>{props.voice.muted ? '已静音' : '语音'}</span></button>
                    <button onClick={hangup} style={roundBtn(t.bad, 66)}>📵<span>挂断</span></button>
                  </div>
                </div>
              )}

              {view === 'contacts' && (
                <div style={{ flex: 1, overflowY: 'auto', margin: '4px 0 8px' }}>
                  <div style={{ fontSize: 11, color: t.sub, marginBottom: 6 }}>通讯录（registry 号码簿）</div>
                  {contactsErr && <div style={{ fontSize: 12, color: t.bad }}>{contactsErr}</div>}
                  {contacts && contacts.length === 0 && <div style={{ fontSize: 12, color: t.muted }}>通讯录为空</div>}
                  {contacts?.map((c) => (
                    <button key={c.number} onClick={() => { setLocal({ num: c.number }); setView('dial') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: t.key,
                        border: '1px solid #2c2c2e', borderRadius: 12, padding: '7px 10px', marginBottom: 6, cursor: 'pointer', color: '#fff', fontSize: 13 }}>
                      <img src={`${PHONE_BASE}/store/assets/l${c.level}.png`} alt={`L${c.level}`} style={{ height: 18 }} />
                      <span style={{ flex: 1 }}>{c.displayName || c.agentDid.split(':').pop()}</span>
                      <span style={{ color: t.sub, fontSize: 12 }}>{c.number}</span>
                    </button>
                  ))}
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'usage' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 11, color: t.sub }}>📊 电话用量（dshlib Agent Line）</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                    {[
                      ['📞 通话', usage ? ((usage.callSeconds / 60).toFixed(1)) + ' 分' : '—'],
                      ['💬 短信', usage ? usage.smsSent + ' 发 / ' + usage.smsReceived + ' 收' : '—'],
                      ['📎 附件', usage ? (usage.attachmentBytes / 1048576).toFixed(2) + ' MB' : '—'],
                      ['👥 群聊', usage ? usage.groupMsgs + ' 条' : '—'],
                      ['📞 呼叫', usage ? usage.calls + ' 次' : '—'],
                      ['🕒 更新', usage ? (usage.updatedAt || '').slice(11, 19) : '—'],
                    ].map(([k, v], i) => (
                      <div key={i} style={{ background: t.key, borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: t.sub }}>{k}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'account' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>📱 电话开户</div>
                  <div style={{ fontSize: 10, color: t.sub, marginBottom: 8 }}>{AGENT_DID}</div>
                  <div style={{ width: '100%', background: t.key, borderRadius: 12, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: t.sub }}>🪙 积分余额</span>
                    <span style={{ color: t.warn, fontWeight: 600 }}>{account.credits}</span>
                  </div>
                  <div style={{ fontSize: 11, color: t.sub, marginBottom: 4 }}>我的号码（最多 2 部）</div>
                    {account.numbers.length === 0
                      ? <div style={{ fontSize: 12, color: t.muted }}>尚未开户</div>
                      : account.numbers.map((n) => (
                        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0' }}>
                          <span style={{ letterSpacing: 1 }}>{n}</span>
                          <img src={`${PHONE_BASE}/store/assets/l3.png`} alt="L3" style={{ height: 14 }} />
                        </div>
                      ))}
                    <div style={{ fontSize: 10, color: t.muted, marginTop: 4 }}>{account.numbers.length}/2</div>
                  </div>
                  {account.numbers.length < 2 && (
                    <div style={{ width: '100%' }}>
                      <input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="显示名（可选）"
                        style={{ width: '100%', boxSizing: 'border-box', background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, marginBottom: 8 }} />
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: t.sub, marginBottom: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                          style={{ marginTop: 1, accentColor: t.accent }} />
                        <span>我已阅读并同意<button onClick={(e) => { e.preventDefault(); setShowTerms(true) }} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 11, cursor: 'pointer', padding: 0 }}>《服务说明（实验）》</button></span>
                      </label>
                      {showTerms && (
                        <div style={{ marginBottom: 8, padding: 10, borderRadius: 10, background: t.key, maxHeight: 120, overflowY: 'auto', fontSize: 10, color: '#94a3b8', lineHeight: 1.7 }}>
                          <b style={{ color: '#e2e8f0' }}>dsh-phone 服务说明（实验）</b><br />
                          实验项目：不保证持续可用/无中断/无错误；服务可随时调整或终止。<br />
                          记录号码、Agent 身份与用量元数据（时长/计数/大小）；不记录通话/短信/附件内容；数据不出售。<br />
                          禁止骚扰、诈骗、垃圾信息等滥用；违规停用。<br />
                          认证等级是"信任摘要"，不是"安全保证"；不构成安全/可靠/合法背书；交互风险自行承担。<br />
                          责任限制：不承担间接/后果性损失；直接损失以实验能力为限。<br />
                          <button onClick={() => setShowTerms(false)} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 10, cursor: 'pointer', marginTop: 4 }}>关闭</button>
                        </div>
                      )}
                      <button onClick={applyAccount} disabled={account.applying || !agreed}
                        style={{ width: '100%', height: 38, borderRadius: 999, background: agreed ? t.ok : t.border, color: agreed ? '#fff' : t.sub, border: 0, fontSize: 14, cursor: agreed ? 'pointer' : 'not-allowed' }}>
                        {account.applying ? '申请中…' : agreed ? '申请号码（开户）' : '请先勾选同意服务说明'}
                      </button>
                      {account.done && (
                        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'rgba(52,211,153,.12)', fontSize: 13, textAlign: 'center' }}>
                          🎉 开户成功！<br /><span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1 }}>{account.done}</span>
                          {account.welcome > 0 && <div style={{ marginTop: 6, fontSize: 13, color: t.warn }}>🪙 +{account.welcome} 积分（第一批开户礼）</div>}
                        </div>
                      )}
                      {account.err && <div style={{ marginTop: 8, fontSize: 12, color: t.bad, textAlign: 'center' }}>{account.err}</div>}
                    </div>
                  )}
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer', marginTop: 8 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'theme' && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, color: t.sub, marginBottom: 6 }}>🎨 主题皮肤</div>
                  {Object.values(THEMES).map((th) => {
                    const locked = th.unlock && !props.unlocked.includes(th.name)
                    const active = props.theme.name === th.name
                    return (
                      <div key={th.name} onClick={() => {
                        if (locked) { if (confirm(`解锁「${th.label}」需 ${th.unlock} 积分？`)) props.onUnlock(th.name) }
                        else props.onSelectTheme(th.name)
                      }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.card, border: active ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
                          borderRadius: 12, padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${th.shell}, ${th.accent})`, border: `1px solid ${th.border}` }} />
                        <span style={{ flex: 1, fontSize: 13, color: t.text }}>{th.label}</span>
                        {locked
                          ? <span style={{ fontSize: 11, color: t.warn }}>🪙 {th.unlock} 积分 · 点击解锁</span>
                          : active
                            ? <span style={{ fontSize: 11, color: t.ok }}>● 使用中</span>
                            : <span style={{ fontSize: 11, color: t.sub }}>点击切换</span>}
                      </div>
                    )
                  })}
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'group' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: 11, color: t.sub, marginBottom: 6 }}>📡 dshlib 群 · 广播</div>
                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: 6, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
                    {props.group.msgs.length === 0
                      ? <div style={{ fontSize: 12, color: t.muted }}>群消息为空</div>
                      : props.group.msgs.map((m, i) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 5 }}>
                          <span style={{ color: t.accent }}>{m.from.split('（')[0]}</span>{' '}<span>{m.text}</span>
                        </div>
                      ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={groupInput} onChange={(e) => setGroupInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendGroup() }} placeholder="发到群聊"
                      style={{ flex: 1, background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                    <button onClick={sendGroup} style={{ height: 32, padding: '0 14px', borderRadius: 999, background: t.accent, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>发送</button>
                  </div>
                </div>
              )}

              {view === 'dial' && !props.call && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <input value={target} onChange={(e) => setLocal({ num: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', color: '#fff',
                      border: 'none', borderBottom: '1px solid #2c2c2e', padding: '6px 4px', fontSize: 24, textAlign: 'center', letterSpacing: 2, marginBottom: 10 }}
                    placeholder="拨给 0002" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                    {['1','2','3','4','5','6','7','8','9','*','0','#'].map((k) => (
                      <button key={k} onClick={() => setLocal({ num: target + k })} style={keyStyle}>
                        {k}
                        <span style={{ fontSize: 9, color: t.sub }}>{({ '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ' } as any)[k] || ''}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 36, marginTop: 4 }}>
                    <button onClick={() => { setLocal({ num: '+86' }) }} style={roundBtn(t.key, 52)}>⌫<span style={{ fontSize: 9 }}>清除</span></button>
                    <button onClick={dial} disabled={!!props.call} style={roundBtn(t.ok, 62)}>📞<span>拨号</span></button>
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid #2c2c2e', paddingTop: 8, marginTop: 6 }}>
                <div style={{ fontSize: 10, color: t.sub, marginBottom: 4 }}>💬 短信（我 ↔ 对端）</div>
                <div style={{ maxHeight: 92, overflowY: 'auto', marginBottom: 6 }}>
                  {mySms.length === 0 && peerSms.length === 0 ? <div style={{ fontSize: 11, color: t.muted }}>暂无消息</div> : null}
                  {[...peerSms, ...mySms].sort((a, b) => a.ts - b.ts).map((m, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 4, textAlign: isMine(m) ? 'right' : 'left' }}>
                      <div style={{ fontSize: 9, color: t.sub, marginBottom: 1 }}>{isMine(m) ? '我' : m.fromNumber}</div>
                      <span style={{ display: 'inline-block', padding: '5px 11px', borderRadius: 15, maxWidth: '85%',
                        background: isMine(m) ? t.msgMine : t.msgOther, color: t.text,
                        borderTopRightRadius: isMine(m) ? 4 : 15, borderTopLeftRadius: isMine(m) ? 15 : 4 }}>
                        {m.attachment ? (
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
                            {m.attachment && m.attachment.url && (m.attachment.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(m.attachment.name || ''))
                              ? <img src={m.attachment.url} alt={m.attachment.name} style={{ maxWidth: 140, maxHeight: 90, borderRadius: 8, display: 'block' }} />
                              : <span style={{ fontSize: 11 }}>📄 {m.attachment ? m.attachment.name : ''}（{m.attachment ? (m.attachment.size / 1024).toFixed(1) : 0}KB）</span>}
                            <span style={{ fontSize: 8, color: t.sub }} title="SHA-256 前 16 位">#{m.attachment.hash}</span>
                          </span>
                        ) : m.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={smsInput} onChange={(e) => setSmsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendSms() }} placeholder="iMessage"
                    style={{ flex: 1, background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 16, padding: '6px 12px', fontSize: 13, boxSizing: 'border-box' }} />
                  <input ref={fileRef} type="file" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = '' }} />
                  <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>📎</button>
                  <button onClick={sendSms} style={{ height: 30, padding: '0 14px', borderRadius: 999, background: t.msgMine, color: '#fff', border: 0, fontSize: 13, cursor: 'pointer' }}>发送</button>
                </div>
              </div>
            </div>

            <div style={{ width: 120, height: 4, background: t.border, borderRadius: 2, margin: '6px auto 2px' }} />
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
  const [smsLog, setSmsLog] = useState<SmsMsg[]>([])
  const [groupMsgs, setGroupMsgs] = useState<Array<{ from: string; text: string; ts: number }>>([])
  // 共享通话状态：A 拨 B → 唤起 B（B 自动打开显示来电）
  const [call, setCall] = useState<{ stage: 'ringing' | 'connected'; callerId: 'A' | 'B'; calleeId: 'A' | 'B'; call?: any; connectedAt: number } | null>(null)

  const [lastSeq, setLastSeq] = useState(0)
  const MINE_NUM = { A: '+86 95123 0001', B: '+86 95123 0002' } as Record<'A' | 'B', string>
  const PEER_NUM = { A: '+86 95123 0002', B: '+86 95123 0001' } as Record<'A' | 'B', string>

  // 短信经中继发送（registry 投递 + 收件箱；同页与跨设备同链路）
  async function sendSms(from: 'A' | 'B', text?: string, attachment?: SmsMsg['attachment']): Promise<void> {
    const to = PEER_NUM[from]
    let att = attachment
    if (attachment && !attachment.fileId) {
      // 先上传附件拿 fileId
      try {
        const buf = await (await fetch(attachment.url!)).blob()
        const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(buf) })
        const up = await (await fetch(`${PHONE_BASE}/api/v1/phone/attachment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ did: AGENT_DID, name: attachment.name, mime: attachment.type, data: b64 }) })).json()
        if (up.ok) att = { ...attachment, fileId: up.fileId, hash: up.hash }
      } catch { return }
    }
    const body: any = { from: AGENT_DID, fromNumber: MINE_NUM[from], to, text: text || undefined, attachment: att ? { fileId: att.fileId, name: att.name, size: att.size, hash: att.hash } : undefined }
    try { await fetch(`${PHONE_BASE}/api/v1/phone/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) } catch { return }
    setSmsLog((l) => [...l, { fromNumber: MINE_NUM[from], text, attachment: att, ts: Date.now() }])
  }

  // 轮询收件箱（增量，seq 游标；5s）
  React.useEffect(() => {
    const poll = async () => {
      try {
        const d = await (await fetch(`${PHONE_BASE}/api/v1/phone/messages?did=${encodeURIComponent(AGENT_DID)}&since=${lastSeq}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })).json()
        if (d.messages && d.messages.length) {
          setLastSeq(Math.max(...d.messages.map((m: any) => m.seq || 0)))
          setSmsLog((l) => [...l, ...d.messages.filter((m: any) => !m.signal).map((m: any) => ({
            fromNumber: m.fromNumber || '对端', text: m.text || undefined,
            attachment: m.attachment ? { name: m.attachment.name, size: m.attachment.size, hash: m.attachment.hash, fileId: m.attachment.fileId, url: `${PHONE_BASE}/api/v1/phone/attachment/${m.attachment.fileId}`, type: 'application/octet-stream' } : undefined,
            ts: Date.parse(m.at) || Date.now(), seq: m.seq,
          }))])
          // 信令消息（语音 offer/answer/candidate）→ 处理
          for (const m of d.messages) { if (m.signal) handleSignal(m) }
        }
      } catch {}
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [lastSeq])

  function onUnlock(name: string): void {
    const th = THEMES[name]
    if (!th || !th.unlock) return
    fetch(`${PHONE_BASE}/api/v1/phone/credits/consume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, amount: th.unlock, reason: `theme-${name}` }),
    }).then((r) => r.json()).then((d) => {
      if (d.ok) { const u = [...unlocked, name]; setUnlocked(u); localStorage.setItem(UNLOCKED_KEY, JSON.stringify(u)); }
      else alert(d.error || '积分不足')
    }).catch(() => alert('解锁失败'))
  }
  function onSelectTheme(id: 'A' | 'B', name: string): void {
    if (id === 'A') { setThemeA(name); localStorage.setItem(THEME_KEY + '-a', name) }
    else { setThemeB(name); localStorage.setItem(THEME_KEY + '-b', name) }
  }

  function sendGroup(from: string, text: string): void {
    setGroupMsgs((l) => [...l, { from, text, ts: Date.now() }])
  }

  const AGENT_DID = 'did:cha2a:agent:dshlib'
  function reportUsage(type: string, amount: number): void {
    fetch(`${PHONE_BASE}/api/v1/phone/usage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: AGENT_DID, type, amount }),
    }).catch(() => {})   // 静默失败，不影响主流程
  }

  // ── 语音角色：本端是主叫还是被叫、本端号码 ──
  const myRole = useRef<'caller' | 'callee' | null>(null)
  const myNumRef = useRef<string | null>(null)
  const NUM_A = '+86951230001'
  const NUM_B = '+86951230002'

  // 拨号：解析号码 → 设置通话状态（ringing）→ 对端面板被唤起
  async function onDial(fromId: 'A' | 'B', target: string): Promise<void> {
    reportUsage('calls', 1)
    myRole.current = 'caller'
    myNumRef.current = fromId === 'A' ? NUM_A : NUM_B
    try {
      const res = await fetch(`${PHONE_BASE}/api/v1/phone/resolve?number=${encodeURIComponent(target)}`, {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json()
      setCall({ stage: 'ringing', callerId: fromId, calleeId: (fromId === 'A' ? 'B' : 'A'), call: data, connectedAt: Date.now() })
      // 主叫方立即发起语音建连（发 offer 经中继，被叫方收到即唤起）
      establishVoice()
    } catch {
      setCall({ stage: 'ringing', callerId: fromId, calleeId: (fromId === 'A' ? 'B' : 'A'), call: { registered: false, reason: '解析失败' }, connectedAt: Date.now() })
    }
  }

  function onAnswer(): void {
    myRole.current = 'callee'
    myNumRef.current = call?.calleeId === 'A' ? NUM_A : NUM_B
    setCall((c) => (c ? { ...c, stage: 'connected', connectedAt: Date.now() } : c))
    establishVoice()
  }

  function onHangup(): void {
    if (call) {
      const secs = Math.max(1, Math.round((Date.now() - call.connectedAt) / 1000))
      reportUsage('call_seconds', secs)
    }
    setCall(null)
    endVoice()
  }

  // ── 语音：信令经中继（P2P 媒体 + STUN 打洞）──
  const ICE = { iceServers: [{ urls: 'stun:compliancehub.cn:3478' }] }
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
    const to = from === NUM_A ? NUM_B : NUM_A
    fetch(`${PHONE_BASE}/api/v1/phone/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: AGENT_DID, fromNumber: from, to, signal: { type, data } }),
    }).catch(() => {})
  }

  async function handleSignal(m: any): Promise<void> {
    const sig = m.signal
    if (!sig) return
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
          // 唤起被叫方来电（跨设备：B 的页面收到 offer → 显示来电）
          pendingOffer.current = sig.data
          if (selfEcho) continue   // 同页回环：仅记录 pendingOffer，供本页对端面板接听时应答，不重复唤起/不应答
          const fromNum = m.fromNumber === NUM_A ? 'A' : 'B'
          const callerId = (fromNum === 'A' ? 'A' : 'B') as 'A' | 'B'
          const calleeId = (fromNum === 'A' ? 'B' : 'A') as 'A' | 'B'
          myRole.current = 'callee'
          myNumRef.current = m.to || NUM_B
          setCall({ stage: 'ringing', callerId, calleeId, call: { registered: true }, connectedAt: Date.now() })
          // 若本端已接听（voiceRef.pc 存在）→ 直接应答
          if (voiceRef.pc) {
            await voiceRef.pc.setRemoteDescription(sig.data)
            flushCandidates()
            const ans = await voiceRef.pc.createAnswer()
            await voiceRef.pc.setLocalDescription(ans)
            sendSignal('answer', ans)
          }
        } else if (sig.type === 'answer') {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      if (myRole.current === 'caller') {
        // 主叫方：发起 offer
        const offer = await p.createOffer()
        await p.setLocalDescription(offer)
        sendSignal('offer', offer)
      } else if (pendingOffer.current) {
        // 被叫方：offer 已由中继拉到（pendingOffer）→ 应答
        await p.setRemoteDescription(pendingOffer.current)
        pendingOffer.current = null
        flushCandidates()
        const ans = await p.createAnswer()
        await p.setLocalDescription(ans)
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
      <PhonePanel id="A" label="dshlib · 电话 A" ownNumber="+86 95123 0001" otherNumber="+86 95123 0002"
        badgeLevel={3} smsList={smsLog} onSendSms={sendSms} voice={voiceFace}
        group={{ msgs: groupMsgs, onSend: sendGroup }} onReport={reportUsage} theme={themeOf('A')} unlocked={unlocked} onUnlock={onUnlock} onSelectTheme={(n) => onSelectTheme('A', n)} top={topPanel === 'A'} onFocus={() => setTopPanel('A')} call={call} onDial={onDial} onAnswer={onAnswer} onHangup={onHangup} />
      <PhonePanel id="B" label="dshlib · 电话 B" ownNumber="+86 95123 0002" otherNumber="+86 95123 0001"
        badgeLevel={3} smsList={smsLog} onSendSms={sendSms} voice={voiceFace}
        group={{ msgs: groupMsgs, onSend: sendGroup }} onReport={reportUsage} theme={themeOf('B')} unlocked={unlocked} onUnlock={onUnlock} onSelectTheme={(n) => onSelectTheme('B', n)} top={topPanel === 'B'} onFocus={() => setTopPanel('B')} call={call} onDial={onDial} onAnswer={onAnswer} onHangup={onHangup} />
    </>
  )
}
