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
import { useRef, useState, useSyncExternalStore } from 'react'
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

// ── 电话面板（单部电话完整画面：拨号盘 + 来电/通话 + 独立短信窗）────

interface SmsMsg {
  from: 'A' | 'B'
  text?: string
  attachment?: { name: string; size: number; type: string; url: string; hash?: string }
  ts: number
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
  badgeLevel: number
  call: { stage: 'ringing' | 'connected'; callerId: 'A' | 'B'; calleeId: 'A' | 'B'; call?: any; connectedAt: number } | null
  onDial(fromId: 'A' | 'B', target: string): void
  onAnswer(): void
  onHangup(): void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<null | { num: string }>(null)
  const [smsInput, setSmsInput] = useState('')
  const [view, setView] = useState<'dial' | 'contacts' | 'group' | 'usage' | 'account'>('dial')
  const [contacts, setContacts] = useState<Array<{ number: string; agentDid: string; displayName: string | null; level: number }> | null>(null)
  const [contactsErr, setContactsErr] = useState('')
  const [groupInput, setGroupInput] = useState('')
  const [usage, setUsage] = useState<any>(null)
  const [account, setAccount] = useState<{ numbers: string[]; applying: boolean; done: string | null; err: string }>({ numbers: [], applying: false, done: null, err: '' })
  const [acctName, setAcctName] = useState('')
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
      .catch(() => {})
  }
  async function applyAccount(): Promise<void> {
    setAccount((a) => ({ ...a, applying: true, err: '' }))
    try {
      const r = await fetch(`${PHONE_BASE}/api/v1/phone/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentDid: AGENT_DID, displayName: acctName }),
      })
      const d = await r.json()
      if (r.status === 201) {
        setAccount((a) => ({ ...a, numbers: [...a.numbers, d.number], done: d.number, applying: false }))
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
  const mine = props.smsList.filter((m) => m.from === props.id)
  const theirs = props.smsList.filter((m) => m.from !== props.id)

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

  const ringTone = { idle: '#64748b', ok: '#34d399', warn: '#fbbf24', bad: '#f87171', ring: '#22d3ee' }
  const tone: 'idle' | 'ok' | 'warn' | 'bad' | 'ring' =
    isConnected ? 'ok' : incoming ? (props.call && props.call.call && props.call.call.trust && props.call.call.trust.level > 0 ? 'ok' : 'warn') : 'idle'

  const shellStyle: React.CSSProperties = {
    position: 'fixed', right: props.id === 'A' ? 18 : 82, bottom: 150, width: 300,
    background: '#000', borderRadius: 38, border: '2px solid #3a3a3c',
    boxShadow: '0 20px 60px rgba(0,0,0,.6)', padding: '8px 8px 12px', zIndex: 1000, fontFamily: '-apple-system, "SF Pro", "PingFang SC", sans-serif',
  }
  const screenStyle: React.CSSProperties = {
    background: '#000', borderRadius: 30, overflow: 'hidden', color: '#fff',
    display: 'flex', flexDirection: 'column', height: 520,
  }
  const keyStyle: React.CSSProperties = {
    height: 46, borderRadius: '50%', background: '#1c1c1e', color: '#fff', border: 0, fontSize: 20, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  }
  const roundBtn = (bg: string, w = 56): React.CSSProperties => ({
    width: w, height: w, borderRadius: '50%', background: bg, color: '#fff', border: 0, fontSize: 11, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
  })

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{ position: 'fixed', right: props.id === 'A' ? 18 : 82, bottom: 88, width: 52, height: 52, borderRadius: '50%',
          background: '#1c1c1e', color: '#22d3ee', border: incoming ? '2px solid #22d3ee' : '1px solid #3a3a3c',
          fontSize: 20, cursor: 'pointer', zIndex: 999, boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}
        aria-label={`dsh-phone ${props.id}`} title={`${props.label} · ${props.ownNumber}`}
      >
        📞{incoming ? '🔔' : ''}
        <span style={{ position: 'absolute', bottom: -7, left: 0, right: 0, fontSize: 9, color: '#8e8e93' }}>{props.id}</span>
      </button>

      {effectiveOpen && (
        <div style={shellStyle}>
          <div style={{ width: 84, height: 20, background: '#000', borderRadius: 12, margin: '2px auto 6px', border: '1px solid #1c1c1e' }} />
          <div style={screenStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 18px 0', fontSize: 11, color: '#fff' }}>
              <span>{new Date().toTimeString().slice(0, 5)}</span>
              <span>📶 🔋</span>
            </div>

            <div style={{ flex: 1, padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div style={{ fontSize: 12, color: '#8e8e93' }}>{props.label}{incoming ? ' · 来电' : ''}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setView('group')} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer' }}>💬</button>
                  <button onClick={loadContacts} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer' }}>👥</button>
                  <button onClick={loadUsage} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer' }}>📊</button>
                  <button onClick={loadAccount} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer' }}>📱</button>
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
                  <div style={{ fontSize: 15, color: '#8e8e93', margin: '4px 0 10px' }}>{props.id === 'A' ? '+86 95123 0002' : '+86 95123 0001'}</div>
                  {props.call && props.call.call && props.call.call.registered && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8e8e93', marginBottom: 14 }}>
                      <img src={`${PHONE_BASE}/store/assets/l${props.call.call.trust?.level ?? 0}.png`} alt="badge" style={{ height: 18 }} />
                      <span>{props.call.call.agentDid}{props.call.call.trust?.revoked ? ' · 已撤销' : ''}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 40, marginTop: 10 }}>
                    <button onClick={props.onAnswer} style={roundBtn('#34c759', 64)}>📞<span>接听</span></button>
                    <button onClick={hangup} style={roundBtn('#ff3b30', 64)}>✕<span>拒接</span></button>
                  </div>
                </div>
              )}

              {isConnected && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#000,#1c1c1e)', borderRadius: 24, margin: '4px 0 8px', padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 600 }}>{props.id === 'A' ? '电话 B' : '电话 A'}</div>
                  <div style={{ fontSize: 14, color: '#8e8e93', margin: '4px 0 6px' }}>{props.id === 'A' ? '+86 95123 0002' : '+86 95123 0001'}</div>
                  <div style={{ fontSize: 30, fontWeight: 300, margin: '8px 0 18px' }}>{((Date.now() - props.call.connectedAt) / 1000) | 0}<span style={{ fontSize: 16 }}>s</span></div>
                  <div style={{ display: 'flex', gap: 26 }}>
                    <button onClick={() => props.voice.onToggleMute()} style={roundBtn('#1c1c1e', 58)}>{props.voice.muted ? '🔇' : '🔊'}<span style={{ fontSize: 9 }}>{props.voice.muted ? '已静音' : '语音'}</span></button>
                    <button onClick={hangup} style={roundBtn('#ff3b30', 66)}>📵<span>挂断</span></button>
                  </div>
                </div>
              )}

              {view === 'contacts' && (
                <div style={{ flex: 1, overflowY: 'auto', margin: '4px 0 8px' }}>
                  <div style={{ fontSize: 11, color: '#8e8e93', marginBottom: 6 }}>通讯录（registry 号码簿）</div>
                  {contactsErr && <div style={{ fontSize: 12, color: '#ff453a' }}>{contactsErr}</div>}
                  {contacts && contacts.length === 0 && <div style={{ fontSize: 12, color: '#48484a' }}>通讯录为空</div>}
                  {contacts?.map((c) => (
                    <button key={c.number} onClick={() => { setLocal({ num: c.number }); setView('dial') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: '#1c1c1e',
                        border: '1px solid #2c2c2e', borderRadius: 12, padding: '7px 10px', marginBottom: 6, cursor: 'pointer', color: '#fff', fontSize: 13 }}>
                      <img src={`${PHONE_BASE}/store/assets/l${c.level}.png`} alt={`L${c.level}`} style={{ height: 18 }} />
                      <span style={{ flex: 1 }}>{c.displayName || c.agentDid.split(':').pop()}</span>
                      <span style={{ color: '#8e8e93', fontSize: 12 }}>{c.number}</span>
                    </button>
                  ))}
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'usage' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 11, color: '#8e8e93' }}>📊 电话用量（dshlib Agent Line）</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                    {[
                      ['📞 通话', usage ? ((usage.callSeconds / 60).toFixed(1)) + ' 分' : '—'],
                      ['💬 短信', usage ? usage.smsSent + ' 发 / ' + usage.smsReceived + ' 收' : '—'],
                      ['📎 附件', usage ? (usage.attachmentBytes / 1048576).toFixed(2) + ' MB' : '—'],
                      ['👥 群聊', usage ? usage.groupMsgs + ' 条' : '—'],
                      ['📞 呼叫', usage ? usage.calls + ' 次' : '—'],
                      ['🕒 更新', usage ? (usage.updatedAt || '').slice(11, 19) : '—'],
                    ].map(([k, v], i) => (
                      <div key={i} style={{ background: '#1c1c1e', borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: '#8e8e93' }}>{k}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'account' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>📱 电话开户</div>
                  <div style={{ fontSize: 10, color: '#8e8e93', marginBottom: 8 }}>{AGENT_DID}</div>
                  <div style={{ width: '100%', background: '#1c1c1e', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#8e8e93', marginBottom: 4 }}>我的号码（最多 2 部）</div>
                    {account.numbers.length === 0
                      ? <div style={{ fontSize: 12, color: '#48484a' }}>尚未开户</div>
                      : account.numbers.map((n) => (
                        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0' }}>
                          <span style={{ letterSpacing: 1 }}>{n}</span>
                          <img src={`${PHONE_BASE}/store/assets/l3.png`} alt="L3" style={{ height: 14 }} />
                        </div>
                      ))}
                    <div style={{ fontSize: 10, color: '#48484a', marginTop: 4 }}>{account.numbers.length}/2</div>
                  </div>
                  {account.numbers.length < 2 && (
                    <div style={{ width: '100%' }}>
                      <input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="显示名（可选）"
                        style={{ width: '100%', boxSizing: 'border-box', background: '#1c1c1e', color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, marginBottom: 8 }} />
                      <button onClick={applyAccount} disabled={account.applying}
                        style={{ width: '100%', height: 38, borderRadius: 999, background: '#34c759', color: '#fff', border: 0, fontSize: 14, cursor: 'pointer' }}>
                        {account.applying ? '申请中…' : '申请号码（开户）'}
                      </button>
                      {account.done && (
                        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'rgba(52,211,153,.12)', fontSize: 13, textAlign: 'center' }}>
                          🎉 开户成功！<br /><span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1 }}>{account.done}</span>
                        </div>
                      )}
                      {account.err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff453a', textAlign: 'center' }}>{account.err}</div>}
                    </div>
                  )}
                  <button onClick={() => setView('dial')} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 12, cursor: 'pointer', marginTop: 8 }}>← 返回拨号</button>
                </div>
              )}

              {view === 'group' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: 11, color: '#8e8e93', marginBottom: 6 }}>📡 dshlib 群 · 广播</div>
                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: 6, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
                    {props.group.msgs.length === 0
                      ? <div style={{ fontSize: 12, color: '#48484a' }}>群消息为空</div>
                      : props.group.msgs.map((m, i) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 5 }}>
                          <span style={{ color: '#0a84ff' }}>{m.from.split('（')[0]}</span>{' '}<span>{m.text}</span>
                        </div>
                      ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={groupInput} onChange={(e) => setGroupInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendGroup() }} placeholder="发到群聊"
                      style={{ flex: 1, background: '#1c1c1e', color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                    <button onClick={sendGroup} style={{ height: 32, padding: '0 14px', borderRadius: 999, background: '#0a84ff', color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>发送</button>
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
                        <span style={{ fontSize: 9, color: '#8e8e93' }}>{({ '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ' } as any)[k] || ''}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 36, marginTop: 4 }}>
                    <button onClick={() => { setLocal({ num: '+86' }) }} style={roundBtn('#1c1c1e', 52)}>⌫<span style={{ fontSize: 9 }}>清除</span></button>
                    <button onClick={dial} disabled={!!props.call} style={roundBtn('#34c759', 62)}>📞<span>拨号</span></button>
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid #2c2c2e', paddingTop: 8, marginTop: 6 }}>
                <div style={{ fontSize: 10, color: '#8e8e93', marginBottom: 4 }}>💬 短信（我 ↔ 对端）</div>
                <div style={{ maxHeight: 92, overflowY: 'auto', marginBottom: 6 }}>
                  {mine.length === 0 && theirs.length === 0 ? <div style={{ fontSize: 11, color: '#48484a' }}>暂无消息</div> : null}
                  {[...theirs, ...mine].sort((a, b) => a.ts - b.ts).map((m, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 4, textAlign: m.from === props.id ? 'right' : 'left' }}>
                      <span style={{ display: 'inline-block', padding: '5px 11px', borderRadius: 15, maxWidth: '85%',
                        background: m.from === props.id ? '#0b84ff' : '#26262a', color: '#fff',
                        borderTopRightRadius: m.from === props.id ? 4 : 15, borderTopLeftRadius: m.from === props.id ? 15 : 4 }}>
                        {m.attachment ? (
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
                            {m.attachment.type.startsWith('image/')
                              ? <img src={m.attachment.url} alt={m.attachment.name} style={{ maxWidth: 140, maxHeight: 90, borderRadius: 8, display: 'block' }} />
                              : <span style={{ fontSize: 11 }}>📄 {m.attachment.name}（{(m.attachment.size / 1024).toFixed(1)}KB）</span>}
                            <span style={{ fontSize: 8, color: '#8e8e93' }} title="SHA-256 前 16 位">#{m.attachment.hash}</span>
                          </span>
                        ) : m.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={smsInput} onChange={(e) => setSmsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendSms() }} placeholder="iMessage"
                    style={{ flex: 1, background: '#1c1c1e', color: '#fff', border: '1px solid #2c2c2e', borderRadius: 16, padding: '6px 12px', fontSize: 13, boxSizing: 'border-box' }} />
                  <input ref={fileRef} type="file" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = '' }} />
                  <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>📎</button>
                  <button onClick={sendSms} style={{ height: 30, padding: '0 14px', borderRadius: 999, background: '#0b84ff', color: '#fff', border: 0, fontSize: 13, cursor: 'pointer' }}>发送</button>
                </div>
              </div>
            </div>

            <div style={{ width: 120, height: 4, background: '#3a3a3c', borderRadius: 2, margin: '6px auto 2px' }} />
          </div>
        </div>
      )}
    </>
  )
}

function PhoneOverlay(): JSX.Element {
  const [smsLog, setSmsLog] = useState<SmsMsg[]>([])
  const [voice, setVoice] = useState<VoiceSession | null>(null)
  const [groupMsgs, setGroupMsgs] = useState<Array<{ from: string; text: string; ts: number }>>([])
  // 共享通话状态：A 拨 B → 唤起 B（B 自动打开显示来电）
  const [call, setCall] = useState<{ stage: 'ringing' | 'connected'; callerId: 'A' | 'B'; calleeId: 'A' | 'B'; call?: any; connectedAt: number } | null>(null)

  function sendSms(from: 'A' | 'B', text?: string, attachment?: SmsMsg['attachment']): void {
    setSmsLog((l) => [...l, { from, text, attachment, ts: Date.now() }])
    setTimeout(() => {
      setSmsLog((l) => [...l, {
        from: (from === 'A' ? 'B' : 'A') as 'A' | 'B',
        text: attachment ? `已收到附件：${attachment.name}` : `已收到：${(text || '').length > 12 ? text!.slice(0, 12) + '…' : text}`,
        ts: Date.now(),
      }])
    }, 600)
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

  // 拨号：解析号码 → 设置通话状态（ringing）→ 对端面板被唤起
  async function onDial(fromId: 'A' | 'B', target: string): Promise<void> {
    reportUsage('calls', 1)
    try {
      const res = await fetch(`${PHONE_BASE}/api/v1/phone/resolve?number=${encodeURIComponent(target)}`, {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json()
      setCall({ stage: 'ringing', callerId: fromId, calleeId: (fromId === 'A' ? 'B' : 'A'), call: data, connectedAt: Date.now() })
    } catch {
      setCall({ stage: 'ringing', callerId: fromId, calleeId: (fromId === 'A' ? 'B' : 'A'), call: { registered: false, reason: '解析失败' }, connectedAt: Date.now() })
    }
  }

  function onAnswer(): void {
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

  async function establishVoice(): Promise<void> {
    if (voice) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const pcA = new RTCPeerConnection()
      const pcB = new RTCPeerConnection()
      stream.getTracks().forEach((t) => pcA.addTrack(t, stream))
      pcB.ontrack = (e) => {
        const audio = new Audio()
        audio.srcObject = e.streams[0]
        audio.play().catch(() => {})
      }
      pcA.onicecandidate = (e) => { if (e.candidate) pcB.addIceCandidate(e.candidate).catch(() => {}) }
      pcB.onicecandidate = (e) => { if (e.candidate) pcA.addIceCandidate(e.candidate).catch(() => {}) }
      const offer = await pcA.createOffer()
      await pcA.setLocalDescription(offer)
      await pcB.setRemoteDescription(offer)
      const answer = await pcB.createAnswer()
      await pcB.setLocalDescription(answer)
      await pcA.setRemoteDescription(answer)
      setVoice({ pcA, pcB, stream, muted: false })
    } catch (e) {
      console.error('语音建连失败（mic 权限或 WebRTC）：', e)
    }
  }

  function endVoice(): void {
    voice?.pcA.close(); voice?.pcB.close()
    voice?.stream.getTracks().forEach((t) => t.stop())
    setVoice(null)
  }

  function toggleMute(): void {
    setVoice((v) => {
      if (!v) return v
      v.stream.getAudioTracks().forEach((t) => { t.enabled = v.muted })
      return { ...v, muted: !v.muted }
    })
  }

  const voiceFace = { active: !!voice, muted: voice?.muted ?? false, onToggleMute: toggleMute } as any

  return (
    <>
      <PhonePanel id="A" label="dshlib · 电话 A" ownNumber="+86 95123 0001" otherNumber="+86 95123 0002"
        badgeLevel={3} smsList={smsLog} onSendSms={sendSms} voice={voiceFace}
        group={{ msgs: groupMsgs, onSend: sendGroup }} onReport={reportUsage} call={call} onDial={onDial} onAnswer={onAnswer} onHangup={onHangup} />
      <PhonePanel id="B" label="dshlib · 电话 B" ownNumber="+86 95123 0002" otherNumber="+86 95123 0001"
        badgeLevel={3} smsList={smsLog} onSendSms={sendSms} voice={voiceFace}
        group={{ msgs: groupMsgs, onSend: sendGroup }} onReport={reportUsage} call={call} onDial={onDial} onAnswer={onAnswer} onHangup={onHangup} />
    </>
  )
}
