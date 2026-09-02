/**
 * dsh-phone 签名工具（node 半）
 *
 * agent 自证身份：用 agent 私钥对 payload 签名（Ed25519），对方用公钥验签。
 * 私钥来源：阶段 3 的身份文件（~/.dsh/identity-<did>.json）；本模块只提供原语。
 *
 * 用途：
 *  - signPayload: agent 出站请求签名（X-DID + X-DID-Sig）
 *  - verifyPayload: 服务端/对方验签
 *  - payload 规范化：RFC 8785 风格（本实现用稳定 JSON：sorted keys + 无空格，
 *    与 server 端 verify 端点对齐——详见 cha2a-registry 验签端点）
 */
import crypto from 'crypto'
import { canonicalJson } from './canonical-json.ts'

export { canonicalJson } from './canonical-json.ts'  // P1-6: 共享单一实现

/** 用 Ed25519 私钥（pkcs8 DER base64）对 payload 签名，返回 base64 签名 */
export function signPayload(payload: string | object, privateKeyB64: string): string {
  const payloadStr = typeof payload === 'string' ? payload : canonicalJson(payload)
  const key = crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    type: 'pkcs8',
    format: 'der',
  })
  return crypto.sign(null, Buffer.from(payloadStr, 'utf8'), key).toString('base64')
}

/** 用 Ed25519 公钥（spki DER base64）验签，返回布尔 */
export function verifyPayload(payload: string | object, signatureB64: string, publicKeyB64: string): boolean {
  const payloadStr = typeof payload === 'string' ? payload : canonicalJson(payload)
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      type: 'spki',
      format: 'der',
    })
    return crypto.verify(null, Buffer.from(payloadStr, 'utf8'), key, Buffer.from(signatureB64, 'base64'))
  } catch {
    return false
  }
}

/** 生成 agent 密钥对（本地生成，私钥不外出），返回 pkcs8/spki DER base64 */
export function generateAgentKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  }
}
