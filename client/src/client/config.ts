/**
 * dsh-phone 统一配置（node 半与 client 半共享的常量集中于此）
 *
 * 注意：node 半（src/index.ts）是独立打包的，如需共享应放 src/shared/；
 * 此文件供 client 半（浏览器端）使用。node 半当前用 src/config 或内联，见 src/index.ts。
 *
 * 环境变量化（构建时注入，缺省值 = 通用占位，不设环境变量行为不变）：
 *   DSH_PHONE_BASE    registry 地址（缺省 https://compliancehub.cn）
 *   DSH_PHONE_DID     本环境 agent 身份（缺省 did:cha2a:agent:dshlib）
 *   DSH_PHONE_NUM_A/B 本环境两个号码（缺省 +86 95123 0001 / 0002）
 * 客户端由 tsdown define 注入；服务端（node 半）运行时读 process.env。
 */
declare const process: any

export const PHONE_BASE = process.env.DSH_PHONE_BASE || 'https://compliancehub.cn'
// RCS 服务基址（微信类比）：消息/群/附件走独立的 rcs-server，经 nginx /rcs/ 前缀路由
// 网关/身份端点（resolve/lookup/directory/apply/credits/agent 等）仍走 PHONE_BASE（registry）
export const RCS_BASE = PHONE_BASE + '/rcs'
export const AGENT_DID = process.env.DSH_PHONE_DID || 'did:cha2a:agent:dshlib'   // 电话对应的 agent 身份（号码簿绑定）

// Owner 终端身份（2.0）：owner 也注册独立 DID（did:cha2a:user:<agent短名>-owner），
// 开户 App 注册（填 owner 名字）后才能发言；未注册时 B 面板以纯号码身份发言（号码在簿即可）
export const OWNER_DID = process.env.DSH_PHONE_OWNER_DID || (AGENT_DID.startsWith('did:cha2a:agent:') ? `did:cha2a:user:${AGENT_DID.replace(/^did:cha2a:agent:/, '')}-owner` : '')

// 终端缺省显示名（通用占位；实际显示名 = registry 注册名，见 index.tsx loadNames）：
// 用户开户时自定义的名字优先（agent metadata.name / owner metadata.name / 号码 displayName），
// 未注册或无显示名时回退到此处占位——每个 agent 的主人都可自定义，不硬编码任何主人专属名
export const AGENT_LABEL = process.env.DSH_PHONE_AGENT_LABEL || 'Agent'
export const OWNER_LABEL = process.env.DSH_PHONE_OWNER_LABEL || 'Owner'
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
// v2：浮标改为胶囊形显示名字后，旧 pos（52px 圆钮时代）不再贴合，升级重置一次
export const POS_KEY = 'dsh-phone-pos-v2'
