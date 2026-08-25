/**
 * 常用工具 App 组：通讯录 / 开户 / 用量 / 主题 / 设置 / 关于本机 / 备忘录 / dshlib
 * 全部通过 AppProps（data + actions）访问平台能力，无内部平台耦合
 */
import React, { useState } from 'react'
import { type AppProps } from '../apps'
import { AppBar, AppIcon, SF, THEMES } from '../theme'
import { PHONE_BASE, AGENT_DID, OWNER_DID, STORE_URL, NOTE_KEY } from '../config'
import { DSHLIB_ICON } from '../dshlibIcon'

// ── 通讯录 ──
export function ContactsApp(p: AppProps): JSX.Element {
  const { t, data, actions, nav, back } = p
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="通讯录" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ fontSize: 11, color: t.sub, marginBottom: 6 }}>registry 号码簿</div>
        {data.contactsErr && <div style={{ fontSize: 12, color: t.bad }}>{data.contactsErr}</div>}
        {data.contacts && data.contacts.length === 0 && <div style={{ fontSize: 12, color: t.muted }}>通讯录为空</div>}
        {data.contacts?.map((c) => (
          <button key={c.number} onClick={() => { actions.setLocalNum(c.number); nav('dial') }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: t.key,
              border: '1px solid #2c2c2e', borderRadius: 12, padding: '7px 10px', marginBottom: 6, cursor: 'pointer', color: '#fff', fontSize: 13 }}>
            <img src={`${PHONE_BASE}/store/assets/l${c.level}.png`} alt={`L${c.level}`} style={{ height: 18 }} />
            <span style={{ flex: 1 }}>{c.displayName || c.agentDid.split(':').pop()}</span>
            <span style={{ color: t.sub, fontSize: 12 }}>{c.number}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 用量 ──
export function UsageApp(p: AppProps): JSX.Element {
  const { t, data, back } = p
  const usage = data.usage
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="电话用量" onBack={back} theme={t} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: t.sub }}>📊 电话用量</div>
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
      </div>
    </div>
  )
}

// ── 开户 ──
export function AccountApp(p: AppProps): JSX.Element {
  const { t, data, actions, back } = p
  const account = data.account
  const [acctName, setAcctName] = useState('')
  const [agentAuthor, setAgentAuthor] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerAuthor, setOwnerAuthor] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  // 打开时检测 agent 注册状态（一次）
  const [checked, setChecked] = useState(false)
  if (!checked) { setChecked(true); actions.checkAgentRegistered(); actions.checkOwnerRegistered() }
  const agentRegistered = account.agentState === 'registered'
  const agentUnknown = account.agentState === 'unknown'
  const ownerRegistered = account.ownerState === 'registered'
  const ownerUnknown = account.ownerState === 'unknown'
  const stepDone = (n: number) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: t.ok, color: '#fff', fontSize: 11, marginRight: 6 }}>✓</span>
  )
  const stepNum = (n: number) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: t.accent, color: '#fff', fontSize: 11, marginRight: 6 }}>{n}</span>
  )
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="电话开户" onBack={back} theme={t} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', overflowY: 'auto', minHeight: 0 }}>
        <div style={{ fontSize: 10, color: t.sub, marginBottom: 8 }}>{AGENT_DID}</div>
        {/* 身份状态卡 */}
        <div style={{ width: '100%', background: t.key, borderRadius: 12, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: t.sub }}>🪙 积分余额</span>
            <span style={{ color: t.warn, fontWeight: 600 }}>{account.credits}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: t.sub }}>🤖 Agent 身份</span>
            {agentUnknown
              ? <span style={{ fontSize: 11, color: t.muted }}>检测中…</span>
              : agentRegistered
                ? <span style={{ fontSize: 11, color: t.ok }}>已注册 · {account.agentLevelName}</span>
                : <span style={{ fontSize: 11, color: t.bad }}>未注册（需第 1 步）</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: t.sub }}>👤 Owner 身份（操作人员）</span>
            {ownerUnknown
              ? <span style={{ fontSize: 11, color: t.muted }}>检测中…</span>
              : ownerRegistered
                ? <span style={{ fontSize: 11, color: t.ok }}>已注册 · {account.ownerName || OWNER_DID.split(':').pop()}</span>
                : <span style={{ fontSize: 11, color: t.bad }}>未注册（需第 2 步）</span>}
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

        {/* ── 第 1 步：注册 Agent（未注册时显示）── */}
        {!agentRegistered && (
          <div style={{ width: '100%', background: t.key, borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {agentRegistered ? stepDone(1) : stepNum(1)}<span style={{ color: t.text }}>注册你的 Agent 身份</span>
            </div>
            {agentUnknown && <div style={{ fontSize: 11, color: t.muted, marginBottom: 6 }}>正在确认身份状态…</div>}
            {!agentUnknown && (
              <>
                <div style={{ fontSize: 10, color: t.sub, marginBottom: 6, lineHeight: 1.6 }}>
                  你的 agent 是通话/群聊里的"人"。给 ta 起个名字（显示在通讯录和群里），
                  并填写主体名（你的名字或组织）——<b style={{ color: t.text }}>有主体名 → 信任等级 L2</b>（可参与群聊协作）；
                  不填则为 L0（会被信任门禁拒绝 @）。
                </div>
                <input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="Agent 名字（如：我的助手 Alice）"
                  style={{ width: '100%', boxSizing: 'border-box', background: t.screen, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, marginBottom: 8 }} />
                <input value={agentAuthor} onChange={(e) => setAgentAuthor(e.target.value)} placeholder="主体名（你的名字/组织，决定 L2）"
                  style={{ width: '100%', boxSizing: 'border-box', background: t.screen, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, marginBottom: 8 }} />
                <button onClick={() => actions.registerAgent(acctName.trim() || AGENT_DID.replace(/^did:cha2a:agent:/, ''), agentAuthor.trim())}
                  disabled={account.registering || !acctName.trim()}
                  style={{ width: '100%', height: 38, borderRadius: 999, background: acctName.trim() ? t.accent : t.border, color: acctName.trim() ? '#fff' : t.sub, border: 0, fontSize: 14, cursor: acctName.trim() ? 'pointer' : 'not-allowed' }}>
                  {account.registering ? '注册中…' : '注册 Agent（第 1 步）'}
                </button>
                {account.done === AGENT_DID && !agentRegistered && (
                  <div style={{ marginTop: 8, fontSize: 12, color: t.ok, textAlign: 'center' }}>✅ 身份已确认，请继续第 2 步</div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 第 2 步：注册 Owner（操作人员身份；有明确身份才能在群里发言）── */}
        {agentRegistered && !ownerRegistered && OWNER_DID && (
          <div style={{ width: '100%', background: t.key, borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {ownerRegistered ? stepDone(2) : stepNum(2)}<span style={{ color: t.text }}>注册你的 Owner 身份（操作人员）</span>
            </div>
            {ownerUnknown && <div style={{ fontSize: 11, color: t.muted, marginBottom: 6 }}>正在确认 Owner 状态…</div>}
            {!ownerUnknown && (
              <>
                <div style={{ fontSize: 10, color: t.sub, marginBottom: 6, lineHeight: 1.6 }}>
                  Owner 是你（操作人员本人）在通话/群聊里的身份，与 agent 各是各的——
                  <b style={{ color: t.text }}>owner 未注册时，B 面板不能在群里发言</b>（身份不明不能发言）。
                  填你的名字 + 主体名（有主体名 → 信任等级 L2）。
                </div>
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Owner 名字（如：CH员工001）"
                  style={{ width: '100%', boxSizing: 'border-box', background: t.screen, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, marginBottom: 8 }} />
                <input value={ownerAuthor} onChange={(e) => setOwnerAuthor(e.target.value)} placeholder="主体名（你的名字/组织，决定 L2）"
                  style={{ width: '100%', boxSizing: 'border-box', background: t.screen, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, marginBottom: 8 }} />
                <button onClick={() => actions.registerOwner(ownerName.trim() || OWNER_DID.split(':').pop() || '', ownerAuthor.trim())}
                  disabled={account.ownerRegistering || !ownerName.trim()}
                  style={{ width: '100%', height: 38, borderRadius: 999, background: ownerName.trim() ? t.accent : t.border, color: ownerName.trim() ? '#fff' : t.sub, border: 0, fontSize: 14, cursor: ownerName.trim() ? 'pointer' : 'not-allowed' }}>
                  {account.ownerRegistering ? '注册中…' : '注册 Owner（第 2 步）'}
                </button>
                {account.done === OWNER_DID && !ownerRegistered && (
                  <div style={{ marginTop: 8, fontSize: 12, color: t.ok, textAlign: 'center' }}>✅ Owner 身份已确认，请继续第 3 步</div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 第 3 步：申请号码（agent 已注册或未确认时均可用；未注册点击会转引导）── */}
        {account.numbers.length < 2 && (
          <div style={{ width: '100%', background: t.key, borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {account.numbers.length > 0 ? stepDone(3) : stepNum(3)}<span style={{ color: t.text }}>申请电话号码</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: t.sub, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: 1, accentColor: t.accent }} />
              <span>我已阅读并同意<button onClick={(e) => { e.preventDefault(); setShowTerms(true) }} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 11, cursor: 'pointer', padding: 0 }}>《服务说明（实验）》</button></span>
            </label>
            {showTerms && (
              <div style={{ marginBottom: 8, padding: 10, borderRadius: 10, background: t.screen, maxHeight: 120, overflowY: 'auto', fontSize: 10, color: '#94a3b8', lineHeight: 1.7 }}>
                <b style={{ color: '#e2e8f0' }}>dsh-phone 服务说明（实验）</b><br />
                实验项目：不保证持续可用/无中断/无错误；服务可随时调整或终止。<br />
                记录号码、Agent 身份与用量元数据（时长/计数/大小）；不记录通话/短信/附件内容；数据不出售。<br />
                禁止骚扰、诈骗、垃圾信息等滥用；违规停用。<br />
                认证等级是"信任摘要"，不是"安全保证"；不构成安全/可靠/合法背书；交互风险自行承担。<br />
                责任限制：不承担间接/后果性损失；直接损失以实验能力为限。<br />
                <button onClick={() => setShowTerms(false)} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 10, cursor: 'pointer', marginTop: 4 }}>关闭</button>
              </div>
            )}
            <button onClick={() => actions.applyAccount(acctName)} disabled={account.applying || !agreed}
              style={{ width: '100%', height: 38, borderRadius: 999, background: agreed ? t.ok : t.border, color: agreed ? '#fff' : t.sub, border: 0, fontSize: 14, cursor: agreed ? 'pointer' : 'not-allowed' }}>
              {account.applying ? '申请中…' : agreed ? '申请号码（开户）' : '请先勾选同意服务说明'}
            </button>
            {account.done && agentRegistered && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'rgba(52,211,153,.12)', fontSize: 13, textAlign: 'center' }}>
                🎉 开户成功！<br /><span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1 }}>{account.done}</span>
                {account.welcome > 0 && <div style={{ marginTop: 6, fontSize: 13, color: t.warn }}>🪙 +{account.welcome} 积分（第一批开户礼）</div>}
              </div>
            )}
            {account.err && <div style={{ marginTop: 8, fontSize: 12, color: t.bad, textAlign: 'center' }}>{account.err}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 主题 ──
export function ThemeApp(p: AppProps): JSX.Element {
  const { t, data, actions, back } = p
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="主题皮肤" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: 8 }}>
        {Object.values(THEMES).map((th) => {
          const locked = th.unlock && !data.unlocked.includes(th.name)
          const active = data.theme.name === th.name
          return (
            <div key={th.name} onClick={() => {
              if (locked) { if (confirm(`解锁「${th.label}」需 ${th.unlock} 积分？`)) actions.unlock(th.name) }
              else actions.selectTheme(th.name)
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
      </div>
    </div>
  )
}

// ── 设置 ──
export function SettingsApp(p: AppProps): JSX.Element {
  const { t, actions, nav, back } = p
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="设置" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: 8 }}>
        {[
          { icon: SF.palette, tint: '#ff9f0a', label: '主题', sub: '切换外观皮肤', go: () => nav('theme') },
          { icon: SF.chart, tint: '#30d158', label: '用量', sub: '通话 / 短信 / 群聊统计', go: () => { actions.loadUsage(); nav('usage') } },
          { icon: SF.sim, tint: '#0a84ff', label: '关于本机', sub: 'dsh-phone 插件简介', go: () => nav('about') },
        ].map((row) => (
          <button key={row.label} onClick={row.go}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: t.card,
              border: '1px solid #2c2c2e', borderRadius: 12, padding: '10px 12px', marginBottom: 6, cursor: 'pointer' }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: row.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff"><path d={row.icon} /></svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', color: '#fff', fontSize: 13 }}>{row.label}</span>
              <span style={{ display: 'block', color: t.sub, fontSize: 10, marginTop: 1 }}>{row.sub}</span>
            </span>
            <span style={{ color: t.sub, fontSize: 14 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 关于本机 ──
export function AboutApp(p: AppProps): JSX.Element {
  const { t, data, back } = p
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="关于本机" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: 8 }}>
        <div style={{ textAlign: 'center', padding: '14px 0 10px' }}>
          <AppIcon d={SF.phone} bg="linear-gradient(160deg,#34c759,#1e9e4a)" size={64} iconSize={32} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginTop: 8 }}>dsh-phone</div>
          <div style={{ fontSize: 10, color: t.sub, marginTop: 2 }}>智能体电话终端 · 实验版</div>
        </div>
        <div style={{ background: t.card, border: '1px solid #2c2c2e', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#c7c7cc', lineHeight: 1.8 }}>
          dsh-phone 是 DSH（DeepSeek Harness）的客户端插件：在对话工作区里提供一部「智能体手机」——电话、短信（文字/附件）、RCS 群聊、备忘录、应用商店（dshlib），以及基于 CHA2A 身份的信任认证（L0–L4）。
          <br /><br />
          所有 App 数据与 Agent 协作都通过 cha2a registry 流转；本机为实验项目，不保证持续可用，认证等级是"信任摘要"而非"安全保证"。
          <br /><br />
          <span style={{ color: t.sub }}>号码 {data.ownNumber} · 身份 {AGENT_DID}</span>
        </div>
      </div>
    </div>
  )
}

// ── 备忘录 ──
export function NoteApp(p: AppProps): JSX.Element {
  const { t, back } = p
  const [note, setNote] = useState(() => { try { return localStorage.getItem(NOTE_KEY + '-' + p.id) || '' } catch { return '' } })
  const [noteSaved, setNoteSaved] = useState(false)
  function saveNote(): void {
    try { localStorage.setItem(NOTE_KEY + '-' + p.id, note) } catch {}
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 1200)
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="备忘录" onBack={back} theme={t} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="写点什么…（自动保存到本机）"
          style={{ flex: 1, width: '100%', boxSizing: 'border-box', resize: 'none', background: 'transparent', color: '#fff',
            border: 'none', outline: 'none', fontSize: 14, lineHeight: 1.6, fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
          <span style={{ fontSize: 10, color: t.sub }}>{note.length} 字 · {noteSaved ? '✅ 已保存' : '本机存储'}</span>
          <button onClick={saveNote} style={{ marginLeft: 'auto', height: 30, padding: '0 16px', borderRadius: 999, background: t.accent, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── dshlib 商店 ──
export function StoreApp(p: AppProps): JSX.Element {
  const { t, back } = p
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="dshlib 应用商店" onBack={back} theme={t} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0c0c0e', borderRadius: 10, padding: '4px 8px', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: t.sub }}>🔒</span>
          <span style={{ flex: 1, fontSize: 10, color: t.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{STORE_URL}</span>
          <button onClick={() => window.open(STORE_URL, '_blank')}
            style={{ background: 'none', border: 'none', color: t.accent, fontSize: 11, cursor: 'pointer' }}>↗ 新窗口</button>
        </div>
        <iframe src={STORE_URL} title="dshlib 应用商店"
          style={{ flex: 1, width: '100%', border: 'none', borderRadius: 12, background: '#fff', minHeight: 0 }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
      </div>
    </div>
  )
}
