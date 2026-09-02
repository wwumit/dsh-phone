/**
 * 发送侧本地签名（P1-5）：经 node 半签名服务（127.0.0.1:8098 /sign，P0-1 已做 Origin 白名单）
 * 用 agent 私钥对消息 payload 签名（私钥不出 node 半）。
 *
 * 返回签名 base64；失败返回 null（调用方决定提示/降级，不在这里抛）。
 * 验签对象规则（两端一致，见 verify-message.ts）：签名内容 = 传入对象本身（发送方签什么，
 * 收方就验什么——结构化消息签业务 payload；纯文本消息签 { text }）。
 */
import { SIGN_PORT } from './config.ts'

export async function signViaLocal(payload: object): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(`http://127.0.0.1:${SIGN_PORT}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    if (!d?.ok || !d.signature) return null
    return d.signature as string
  } catch {
    return null
  }
}
