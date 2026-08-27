/**
 * dsh-phone WebCrypto 签名工具（浏览器半）
 *
 * agent 自证身份（P7 SaaS 向导）：浏览器端生成 Ed25519 密钥对，**私钥不出设备**。
 * 与 node 半（sign.ts）+ registry 格式完全兼容：
 *   - 公钥：**spki DER base64**（与 sign.ts generateAgentKeyPair 一致——registry
 *     verify/agent-sig 端点按 spki 解析，必须统一格式；raw 32B 仅在 DID Document
 *     #agent-key 显示时取尾部 32 字节，登记/验签一律用 spki）
 *   - 私钥：pkcs8 DER base64（浏览器本地存储/导出）
 *   - payload 规范化：canonicalJson（RFC 8785 风格稳定 JSON，与 node 半/服务端验签对齐）
 *
 * 用法（浏览器）：
 *   const { publicKey, privateKey } = await generateAgentKeyPairWeb()
 *   // 登记 publicKey（spki DER base64）到 registry，私钥留浏览器
 *   const sig = await signPayloadWeb({ action: 'call', to: '+86...' }, privateKey)
 *   const ok = await verifyPayloadWeb(payload, sig, publicKey)
 */

/** 稳定 JSON 序列化：keys 排序 + 紧凑（对齐验签端） */
export function canonicalJson(obj: unknown): string {
  return stableStringify(obj)
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** 浏览器端生成密钥对：publicKey = spki DER base64（与 node 半一致，可直接登记 registry）；privateKey = pkcs8 DER base64（仅本地） */
export async function generateAgentKeyPairWeb(): Promise<{ publicKey: string; privateKey: string }> {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pubSpki = await crypto.subtle.exportKey('spki', publicKey)
  const privPkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey)
  return { publicKey: bufToBase64(pubSpki), privateKey: bufToBase64(privPkcs8) }
}

/** 浏览器端签名：payload → canonicalJson → Ed25519 sign（与 node 半 signPayload 同语义） */
export async function signPayloadWeb(payload: string | object, privateKeyPkcs8B64: string): Promise<string> {
  const payloadStr = typeof payload === 'string' ? payload : canonicalJson(payload)
  const key = await crypto.subtle.importKey('pkcs8', base64ToBuf(privateKeyPkcs8B64), { name: 'Ed25519' }, false, ['sign'])
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(payloadStr))
  return bufToBase64(sig)
}

/** 浏览器端验签：公钥 spki DER base64（与 node 半/服务端一致） */
export async function verifyPayloadWeb(payload: string | object, signatureB64: string, publicKeySpkiB64: string): Promise<boolean> {
  const payloadStr = typeof payload === 'string' ? payload : canonicalJson(payload)
  try {
    const key = await crypto.subtle.importKey('spki', base64ToBuf(publicKeySpkiB64), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, base64ToBuf(signatureB64), new TextEncoder().encode(payloadStr))
  } catch {
    return false
  }
}
