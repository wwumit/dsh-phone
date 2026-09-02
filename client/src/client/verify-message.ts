/**
 * 收方通用验签（P1-5）：消息对端验证"发送方确实是它自称的 agent 且消息未被篡改"。
 *
 * 能力层：任何带 payload.signature 的入站消息都可验——解析发送方 DID Document →
 * 取 #agent-key 公钥（multibase base58）→ Ed25519 验签。
 * 验签对象规则（与发送侧 signViaLocal 约定一致）：
 *   ① payload 除 signature 外还有业务字段 → 验该 payload（结构化消息/收款码/订单）
 *   ② payload 仅 signature（纯文本消息）→ 验 { text: 消息原文 }
 * 验证者 = 消息对端（收方 agent）；registry/rcs-server 不参与（签名随消息业务层走）。
 *
 * 策略：结构化验签不受开关影响（安全）；纯文本验签可经 enabled 参数关闭（负担开关预留）。
 */
import { PHONE_BASE } from './config.ts'
import { base58Decode, verifyPayloadWebRaw } from '../webcrypto.ts'

export type VerifyState = 'none' | 'verify' | 'ok' | 'fail'

/** #agent-key 公钥解析：DID 文档 verificationMethod 中 id 以 #agent-key 结尾的 Ed25519 公钥
 *  publicKeyMultibase → multicodec 前缀(0xed 0x01) + raw32，跳过 2 字节 */
export function agentKeyRaw32(doc: unknown): Uint8Array | null {
  try {
    const vm = (doc as any)?.verificationMethod || []
    const agentKey = vm.find((m: any) => String(m.id).endsWith('#agent-key'))
    if (!agentKey?.publicKeyMultibase) return null
    const decoded = base58Decode(agentKey.publicKeyMultibase)
    if (decoded.length === 34 && decoded[0] === 0xed && decoded[1] === 0x01) return decoded.subarray(2)
    return decoded  // 已是 raw32
  } catch {
    return null
  }
}

async function resolveAgentKeyRaw32(did: string): Promise<Uint8Array | null> {
  try {
    const doc = await (await fetch(`${PHONE_BASE}/api/v1/did/${encodeURIComponent(did)}`, { headers: { Accept: 'application/json' } })).json()
    return agentKeyRaw32(doc)
  } catch {
    return null
  }
}

/** 判定验签对象：payload 除 signature 外有业务字段 → 验 payload；仅 signature → 验 {text}
 * 返回 null = 无 signature（无需验） */
export function verifyTarget(payload: Record<string, unknown> | undefined, text?: string):
  { target: object; structured: boolean } | null {
  if (!payload || typeof payload.signature !== 'string') return null
  const { signature: _sig, ...rest } = payload
  if (Object.keys(rest).length > 0) return { target: rest, structured: true }
  if (typeof text === 'string' && text.length > 0) return { target: { text }, structured: false }
  return null
}

/** 验签主入口：解析发送方 DID → 验签对象 → 返回状态 */
export async function verifyMessage(
  from: string | undefined,        // 发送方 DID（did:cha2a:agent:*）
  payload: Record<string, unknown> | undefined,
  text?: string,                   // 消息原文（纯文本验签用）
  enabled = true,                  // 纯文本验签开关（结构化不受影响）
): Promise<VerifyState> {
  if (!payload || typeof payload.signature !== 'string') return 'none'
  const tgt = verifyTarget(payload, text)
  if (!tgt) return 'none'
  // 结构化消息必验（安全）；纯文本受开关控制
  if (!tgt.structured && !enabled) return 'none'
  const did = typeof from === 'string' && from.startsWith('did:cha2a:') ? from : null
  if (!did) return 'none'
  const raw32 = await resolveAgentKeyRaw32(did)
  if (!raw32) return 'none'  // 发送方未注册 #agent-key——无法验（显示为未签名，不误报失败）
  try {
    const ok = await verifyPayloadWebRaw(tgt.target, payload.signature, raw32)
    return ok ? 'ok' : 'fail'
  } catch {
    return 'fail'
  }
}
