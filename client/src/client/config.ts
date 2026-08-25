/**
 * dsh-phone 统一配置（node 半与 client 半共享的常量集中于此）
 *
 * 注意：node 半（src/index.ts）是独立打包的，如需共享应放 src/shared/；
 * 此文件供 client 半（浏览器端）使用。node 半当前用 src/config 或内联，见 src/index.ts。
 *
 * 环境变量化（构建时注入，缺省值 = 原 dshlib 演示配置，不设环境变量行为完全不变）：
 *   DSH_PHONE_BASE    registry 地址（缺省 https://compliancehub.cn）
 *   DSH_PHONE_DID     本环境 agent 身份（缺省 did:cha2a:agent:dshlib）
 *   DSH_PHONE_NUM_A/B 本环境两个号码（缺省 +86 95123 0001 / 0002）
 * 客户端由 tsdown define 注入；服务端（node 半）运行时读 process.env。
 */
declare const process: any

export const PHONE_BASE = process.env.DSH_PHONE_BASE || 'https://compliancehub.cn'
export const AGENT_DID = process.env.DSH_PHONE_DID || 'did:cha2a:agent:dshlib'   // 电话对应的 agent 身份（号码簿绑定）
export const STORE_URL = 'https://compliancehub.cn/store/'

// 双面板号码（同页两部电话演示）；A/B 可由环境变量覆盖
export const MINE_NUM = {
  A: process.env.DSH_PHONE_NUM_A || '+86 95123 0001',
  B: process.env.DSH_PHONE_NUM_B || '+86 95123 0002',
} as Record<'A' | 'B', string>
export const PEER_NUM = { A: MINE_NUM.B, B: MINE_NUM.A } as Record<'A' | 'B', string>
export const NUM_A = MINE_NUM.A.replace(/[^0-9+]/g, '')
export const NUM_B = MINE_NUM.B.replace(/[^0-9+]/g, '')

// 本地存储 key
export const THEME_KEY = 'dsh-phone-theme'
export const UNLOCKED_KEY = 'dsh-phone-unlocked'
export const NOTE_KEY = 'dsh-phone-note'
export const POS_KEY = 'dsh-phone-pos'
