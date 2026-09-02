/**
 * SmsApp — 信息（消息流 + 底部固定输入区）
 * 消息数据来自 data.smsList（共享），发送走 actions.sendSms
 */
import React, { useRef, useState } from 'react'
import { type AppProps } from '../apps'
import { AppBar } from '../theme'
import { api } from '../api'
import { PHONE_BASE, AGENT_DID } from '../config'
import { SigBadge } from './sig-badge'

export function SmsApp(p: AppProps): JSX.Element {
  const { t, data, actions, back } = p
  const [smsInput, setSmsInput] = useState('')
  const [recipient, setRecipient] = useState<string | null>(null)      // 选中的收件人号码（null=默认对端）
  const [recipientName, setRecipientName] = useState('')
  const [rcptQuery, setRcptQuery] = useState<string | null>(null)      // 输入 # 后的过滤串（null=未激活）
  const [rcptIndex, setRcptIndex] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // 打开时确保号码簿已加载（# 收件人选择器数据源）
  React.useEffect(() => {
    if (!data.contacts) actions.loadContacts()
  }, [])

  // 号码簿联系人候选（# 收件人选择器）；自己排除
  const rcptCandidates = (data.contacts || [])
    .filter((c) => c.number.replace(/[^0-9+]/g, '') !== data.ownNumber.replace(/[^0-9+]/g, ''))
    .map((c) => ({ number: c.number, label: c.displayName || c.agentDid.split(':').pop()!, level: c.level }))
  const rcptFiltered = rcptQuery !== null
    ? rcptCandidates.filter((c) => c.label.toLowerCase().includes(rcptQuery.toLowerCase()) || c.number.includes(rcptQuery))
    : rcptCandidates

  function onInputChange(v: string): void {
    setSmsInput(v)
    // 末尾出现 # → 激活收件人选择器（类似群聊 @）；# 后有字符 → 过滤
    const at = v.lastIndexOf('#')
    if (at !== -1 && !v.slice(at + 1).includes(' ')) {
      setRcptIndex(0)
      setRcptQuery(v.slice(at + 1))
    } else {
      setRcptQuery(null)
    }
  }
  function pickRecipient(c: { number: string; label: string }): void {
    // 用 #短号 替换输入流末尾的 #查询；记住收件人（发送时解析）
    const at = smsInput.lastIndexOf('#')
    const head = at === -1 ? smsInput : smsInput.slice(0, at)
    const short = c.number.replace(/^\+86/, '')
    setSmsInput(head + '#' + short + ' ')
    setRecipient(c.number)
    setRecipientName(c.label)
    setRcptQuery(null)
  }

  function sendSms(): void {
    const text = smsInput.trim()
    if (!text) return
    // 解析 #收件人：文本里 #<数字> → 直接补 +86 作为 to（号码簿匹配为标准格式；不依赖 contacts 加载）
    const m = text.match(/#(\+?[0-9]{4,})/)
    let to: string | undefined
    if (m) {
      const target = m[1]
      const hit = rcptCandidates.find((c) => c.number.replace(/^\+86/, '') === target || c.number === target)
      to = hit ? hit.number : (target.startsWith('+') ? target : '+86' + target)
    }
    actions.sendSms(p.id, text.replace(/#\+?[0-9]{4,}\s*/, '').trim() || undefined, undefined, to)
    setSmsInput('')
    setRecipient(null)
    setRecipientName('')
    actions.reportUsage('sms_sent', 1)
  }
  async function sendAttachment(file: File): Promise<void> {
    try {
      const buf = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', buf)
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
      actions.sendSms(p.id, undefined, {
        name: file.name, size: file.size, type: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file), hash,
      })
      actions.reportUsage('attachment_bytes', file.size)
    } catch {}
  }

  // v2.4.1：本机 agent 的回复（fromNumber=AGENT_DID）也算"我"（右侧）——dshlib 手机上 dshlib 的回信在右侧
  const isMine = (m: any) => m.fromNumber === data.ownNumber || m.fromNumber === AGENT_DID
  const mySms = data.smsList.filter(isMine)
  const peerSms = data.smsList.filter((m: any) => !isMine(m))
  // 消息列表自动滚动到底部（新消息进来 / 打开时）
  const smsBoxRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (smsBoxRef.current) smsBoxRef.current.scrollTop = smsBoxRef.current.scrollHeight
  }, [data.smsList.length])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="信息" onBack={back} theme={t} />
      <div ref={smsBoxRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 6, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
        {mySms.length === 0 && peerSms.length === 0 ? <div style={{ fontSize: 11, color: t.muted }}>暂无消息</div> : null}
        {[...peerSms, ...mySms].sort((a: any, b: any) => a.ts - b.ts).map((m: any, i: number) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 4, textAlign: isMine(m) ? 'right' : 'left' }}>
            <div style={{ fontSize: 9, color: t.sub, marginBottom: 1 }}>{isMine(m) ? '我' : (m.fromNumber && m.fromNumber.startsWith('did:') ? '🤖 agent' : m.fromNumber)}</div>
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
            <SigBadge from={m.from} payload={m.payload} text={m.text} />
          </div>
        ))}
      </div>
      {recipientName && <div style={{ marginBottom: 4, fontSize: 10, color: t.accent }}>收件人：{recipientName}</div>}
      {rcptQuery !== null && (
        <div style={{ marginBottom: 6, background: '#0c0c0e', border: '1px solid #2c2c2e', borderRadius: 10, overflow: 'hidden', maxHeight: 140, overflowY: 'auto' }}>
          {rcptFiltered.length === 0
            ? <div style={{ fontSize: 11, color: t.muted, padding: '8px 10px' }}>无匹配联系人（号码簿为空？）</div>
            : rcptFiltered.map((c, i) => (
              <button key={c.number} onClick={() => pickRecipient(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: i === rcptIndex ? 'rgba(10,132,255,.22)' : 'none', border: 'none', padding: '7px 10px', cursor: 'pointer' }}>
                <img src={`${PHONE_BASE}/store/assets/l${c.level}.png`} alt={`L${c.level}`} style={{ height: 13 }} />
                <span style={{ flex: 1, fontSize: 12, color: '#fff' }}>{c.label}</span>
                <span style={{ fontSize: 10, color: t.sub }}>{c.number.replace(/^\+86/, '')}</span>
              </button>
            ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={smsInput} onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (rcptQuery !== null) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setRcptIndex((i) => Math.min(i + 1, Math.max(rcptFiltered.length - 1, 0))) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setRcptIndex((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); if (rcptFiltered[rcptIndex]) pickRecipient(rcptFiltered[rcptIndex]) }
              else if (e.key === 'Escape') { setRcptQuery(null) }
            } else if (e.key === 'Enter') { sendSms() }
          }} placeholder="文字 · # 选收件人（默认对端）"
          style={{ flex: 1, background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 16, padding: '6px 12px', fontSize: 13, boxSizing: 'border-box' }} />
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>📎</button>
        <button onClick={sendSms} style={{ height: 30, padding: '0 14px', borderRadius: 999, background: t.msgMine, color: '#fff', border: 0, fontSize: 13, cursor: 'pointer' }}>发送</button>
      </div>
    </div>
  )
}
