/**
 * RechargeSigBadge — 充值二维码消息的验签徽章（A 侧）
 *
 * 收到带 payload.signature 的「收款码」消息时：
 *   resolve 发送方 DID Document → 取 #agent-key 公钥（multibase base58）→ 验签 payload
 *   通过 = 码由发送方私钥签发（任何替换都会验签失败）
 * 显示：✓ 已验签 / ⚠ 验签失败（请勿扫码）/ 验签中
 */
import React, { useEffect, useState } from 'react'
import { PHONE_BASE } from '../config'
import { base58Decode, verifyPayloadWebRaw, canonicalJson } from '../../webcrypto'

type State = 'verify' | 'ok' | 'fail' | 'none'

export function RechargeSigBadge({ payload, from }: { payload?: any; from?: string }): JSX.Element | null {
  const [state, setState] = useState<State>('verify')
  useEffect(() => {
    let cancelled = false
    setState('verify')
    if (!payload?.signature || !payload?.outTradeNo || !payload?.action) { setState('none'); return }
    const did = typeof from === 'string' && from.startsWith('did:cha2a:') ? from : null
    if (!did) { setState('none'); return }
    ;(async () => {
      try {
        const doc = await (await fetch(`${PHONE_BASE}/api/v1/did/${encodeURIComponent(did)}`, { headers: { Accept: 'application/json' } })).json()
        const agentKey = (doc?.verificationMethod || []).find((m: any) => String(m.id).endsWith('#agent-key'))
        if (!agentKey?.publicKeyMultibase) { if (!cancelled) setState('none'); return }
        const decoded = base58Decode(agentKey.publicKeyMultibase)
        // Ed25519 publicKeyMultibase = multicodec 前缀(0xed 0x01) + raw32 —— 跳过 2 字节
        const raw32 = decoded.length === 34 && decoded[0] === 0xed && decoded[1] === 0x01 ? decoded.subarray(2) : decoded
        // 验签对象 = payload 去掉 signature（签名时不含 signature）
        const { signature, ...signed } = payload
        const ok = await verifyPayloadWebRaw(signed, payload.signature, raw32)
        if (!cancelled) setState(ok ? 'ok' : 'fail')
      } catch { if (!cancelled) setState('fail') }
    })()
    return () => { cancelled = true }
  }, [payload, from])

  if (state === 'none') return null
  if (state === 'verify') return <span style={{ fontSize: 9, color: '#8e8e93', marginLeft: 6 }}>验签中…</span>
  if (state === 'ok') return (
    <span style={{ fontSize: 9, color: '#34c759', marginLeft: 6 }}>✓ 已验签 · 订单{String(payload.outTradeNo || '').slice(-6)} · 防替换</span>
  )
  return <span style={{ fontSize: 9, color: '#ff453a', marginLeft: 6, fontWeight: 600 }}>⚠ 验签失败：疑似被替换，请勿扫码</span>
}
