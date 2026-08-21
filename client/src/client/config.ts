/**
 * dsh-phone 统一配置（node 半与 client 半共享的常量集中于此）
 *
 * 注意：node 半（src/index.ts）是独立打包的，如需共享应放 src/shared/；
 * 此文件供 client 半（浏览器端）使用。node 半当前用 src/config 或内联，见 src/index.ts。
 */
export const PHONE_BASE = 'https://compliancehub.cn'
export const AGENT_DID = 'did:cha2a:agent:dshlib'   // 电话对应的 agent 身份（号码簿绑定）
export const CALLER_NUM = '+86 95123 0001'          // 主叫 = 电话 A
export const STORE_URL = 'https://compliancehub.cn/store/'

// 双面板号码（同页两部电话演示）
export const MINE_NUM = { A: '+86 95123 0001', B: '+86 95123 0002' } as Record<'A' | 'B', string>
export const PEER_NUM = { A: '+86 95123 0002', B: '+86 95123 0001' } as Record<'A' | 'B', string>
export const NUM_A = '+86951230001'
export const NUM_B = '+86951230002'

// 本地存储 key
export const THEME_KEY = 'dsh-phone-theme'
export const UNLOCKED_KEY = 'dsh-phone-unlocked'
export const NOTE_KEY = 'dsh-phone-note'
export const POS_KEY = 'dsh-phone-pos'
