/**
 * SmsApp — 信息（消息流 + 底部固定输入区）
 * 消息数据来自 data.smsList（共享），发送走 actions.sendSms
 */
import React, { useRef, useState } from 'react'
import { type AppProps } from '../apps'
import { AppBar } from '../theme'
import { api } from '../api'

export function SmsApp(p: AppProps): JSX.Element {
  const { t, data, actions, back } = p
  const [smsInput, setSmsInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function sendSms(): void {
    const text = smsInput.trim()
    if (!text) return
    actions.sendSms(p.id, text)
    setSmsInput('')
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

  const isMine = (m: any) => m.fromNumber === data.ownNumber
  const mySms = data.smsList.filter(isMine)
  const peerSms = data.smsList.filter((m: any) => !isMine(m))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="信息" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 6, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
        {mySms.length === 0 && peerSms.length === 0 ? <div style={{ fontSize: 11, color: t.muted }}>暂无消息</div> : null}
        {[...peerSms, ...mySms].sort((a: any, b: any) => a.ts - b.ts).map((m: any, i: number) => (
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
          onKeyDown={(e) => { if (e.key === 'Enter') sendSms() }} placeholder="文字"
          style={{ flex: 1, background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 16, padding: '6px 12px', fontSize: 13, boxSizing: 'border-box' }} />
        <input ref={fileRef} type="file" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>📎</button>
        <button onClick={sendSms} style={{ height: 30, padding: '0 14px', borderRadius: 999, background: t.msgMine, color: '#fff', border: 0, fontSize: 13, cursor: 'pointer' }}>发送</button>
      </div>
    </div>
  )
}
