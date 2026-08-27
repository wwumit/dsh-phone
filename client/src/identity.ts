/**
 * dsh-phone agent 身份文件（node 半）
 *
 * agent 的密钥/凭证本地化存储：~/.dsh/identity-<did>.json（chmod 600）
 * 替代 env 注入（DSH_PHONE_DID），env 保留为降级路径（阶段 3 过渡期）。
 *
 * 安全：
 *  - 私钥仅存本地（chmod 600），不上传、不进浏览器
 *  - 公钥登记到 registry（POST /api/v1/agent/key/register）
 *  - 文件权限 600（Unix）
 */
import fs from 'fs'
import path from 'path'
import { generateAgentKeyPair } from './sign'

export interface AgentIdentity {
  did: string
  publicKey: string   // spki DER base64
  privateKey: string  // pkcs8 DER base64（仅本地）
  algorithm: 'Ed25519'
  createdAt: string
  registeredAt?: string
}

const hasProcess = typeof process !== 'undefined' && !!process?.env
const env = (k: string, d: string) => (hasProcess ? (process.env[k] || d) : d)
const DSH_HOME = env('DSH_HOME', path.join(env('HOME', '/tmp'), '.dsh'))

function identityFile(did: string): string {
  const safe = did.replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(DSH_HOME, `identity-${safe}.json`)
}

/** 读身份文件；不存在返回 null */
export function loadIdentity(did: string): AgentIdentity | null {
  try {
    const raw = fs.readFileSync(identityFile(did), 'utf8')
    const id = JSON.parse(raw)
    if (id.did !== did || !id.privateKey || !id.publicKey) return null
    return id
  } catch {
    return null
  }
}

/** 创建身份（本地生成密钥对 + 写文件 chmod 600）；返回身份对象 */
export function createIdentity(did: string): AgentIdentity {
  const { publicKey, privateKey } = generateAgentKeyPair()
  const identity: AgentIdentity = {
    did,
    publicKey,
    privateKey,
    algorithm: 'Ed25519',
    createdAt: new Date().toISOString(),
  }
  fs.mkdirSync(DSH_HOME, { recursive: true })
  const file = identityFile(did)
  fs.writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 })
  try { fs.chmodSync(file, 0o600) } catch { /* 非 Unix 忽略 */ }
  return identity
}

/** 已登记公钥后更新身份文件（记录 registeredAt） */
export function markRegistered(did: string, registeredAt: string): void {
  const id = loadIdentity(did)
  if (!id) return
  id.registeredAt = registeredAt
  const file = identityFile(did)
  fs.writeFileSync(file, JSON.stringify(id, null, 2), { mode: 0o600 })
}

/** 身份文件路径（调试/展示用） */
export function identityPath(did: string): string {
  return identityFile(did)
}
