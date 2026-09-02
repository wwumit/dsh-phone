/**
 * 通用消息验签徽章（P1-5）：任何带 payload.signature 的入站消息（结构化 payload 或纯文本）
 * 由对端（收方）验证发送方签名。策略：结构化消息必验；纯文本受 enabled 开关控制（负担开关预留）。
 * 显示：✓ 已验签 / ⚠ 验签失败（内容可能被篡改）/ 验签中；无 signature 或发送方无 #agent-key 不显示。
 */
import React, { useEffect, useState } from 'react'
import { verifyMessage, type VerifyState } from '../verify-message'

export function SigBadge({ from, payload, text, enabled = true }:
  { from?: string; payload?: any; text?: string; enabled?: boolean }): JSX.Element | null {
  const [state, setState] = useState<VerifyState>('verify')
  useEffect(() => {
    let cancelled = false
    setState('verify')
    verifyMessage(from, payload, text, enabled).then((s) => { if (!cancelled) setState(s) })
    return () => { cancelled = true }
  }, [from, payload, text, enabled])

  if (state === 'none') return null
  if (state === 'verify') return <span style={{ fontSize: 9, color: '#8e8e93', marginLeft: 6 }}>验签中…</span>
  if (state === 'ok') return <span style={{ fontSize: 9, color: '#34d399', marginLeft: 6 }}>✓ 已验签 · 发送方签名</span>
  return <span style={{ fontSize: 9, color: '#ff453a', marginLeft: 6, fontWeight: 600 }}>⚠ 签名验证失败：内容可能被篡改</span>
}
