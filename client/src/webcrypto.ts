import { canonicalJson } from './canonical-json.ts'
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

export { canonicalJson } from './canonical-json.ts'  // P1-6: 共享单一实现

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

/** base58btc 解码（DID Document #agent-key 的 publicKeyMultibase 用：z 前缀 + base58btc 32B raw） */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function base58Decode(input: string): Uint8Array {
  let raw = input
  if (raw.startsWith('z')) raw = raw.slice(1)
  const bytes = [0]
  for (const ch of raw) {
    const v = BASE58_ALPHABET.indexOf(ch)
    if (v === -1) throw new Error('invalid base58 char')
    let carry = v
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8 }
  }
  // 处理前导 '1'（= 0）
  let zeros = 0
  for (const ch of raw) { if (ch === '1') zeros++; else break }
  const out = new Uint8Array(zeros + bytes.length)
  out.fill(0, 0, zeros)
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i]
  return out
}

/** 用 raw 32B Ed25519 公钥验签（DID Document #agent-key multibase 解码后） */
export async function verifyPayloadWebRaw(payload: string | object, signatureB64: string, rawKey32: Uint8Array): Promise<boolean> {
  const payloadStr = typeof payload === 'string' ? payload : canonicalJson(payload)
  try {
    const key = await (crypto.subtle as unknown as { importKey(fmt: string, kd: BufferSource, alg: { name: string }, extractable: boolean, usages: string[]): Promise<CryptoKey> }).importKey('raw', rawKey32 as unknown as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, base64ToBuf(signatureB64), new TextEncoder().encode(payloadStr))
  } catch {
    return false
  }
}
