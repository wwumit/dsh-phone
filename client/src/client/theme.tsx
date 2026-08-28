/**
 * dsh-phone 主题系统 + iOS 风格图标库
 * - THEMES：皮肤定义（颜色/形状/键盘/字体）
 * - SF：SF Symbols 风格 SVG path（Material Design Icons 形状 Apache-2.0）
 * - AppBar / AppIcon：统一导航栏 + iOS 风格 App 图标
 */
import React from 'react'

export interface Theme {
  name: string; label: string; unlock?: number
  shell: string; screen: string; key: string; card: string; border: string
  accent: string; ok: string; bad: string; warn: string
  sub: string; muted: string; text: string; msgMine: string; msgOther: string
  shape: 'round' | 'squared' | 'retro'
  keys: 'circle' | 'square' | 'retro'
  font: string
}

export const THEMES: Record<string, Theme> = {
  classic: { name: 'classic', label: '经典深色', shell: '#000', screen: '#000', key: '#1c1c1e', card: '#1c1c1e', border: '#2c2c2e', accent: '#0a84ff', ok: '#34c759', bad: '#ff3b30', warn: '#fbbf24', sub: '#8e8e93', muted: '#48484a', text: '#fff', msgMine: '#0b84ff', msgOther: '#26262a', shape: 'round', keys: 'circle', font: '-apple-system, "SF Pro", sans-serif' },
  nebula: { name: 'nebula', label: '星空蓝', shell: '#070a24', screen: '#0a0e2e', key: '#161b3f', card: '#161b3f', border: '#2a3160', accent: '#7c6cf6', ok: '#30d158', bad: '#ff453a', warn: '#ffd60a', sub: '#9a9ac8', muted: '#55558a', text: '#eef0ff', msgMine: '#5e5ce6', msgOther: '#23285c', shape: 'round', keys: 'circle', font: '-apple-system, "SF Pro", sans-serif' },
  sunset: { name: 'sunset', label: '活力橙', shell: '#1a0d04', screen: '#241206', key: '#33200f', card: '#33200f', border: '#4a2f16', accent: '#ff9f0a', ok: '#ffd60a', bad: '#ff453a', warn: '#ff9f0a', sub: '#b08a5e', muted: '#6e5636', text: '#fff3e6', msgMine: '#ff9500', msgOther: '#3a2a14', shape: 'squared', keys: 'square', font: '-apple-system, "SF Pro", sans-serif' },
  mint: { name: 'mint', label: '薄荷绿', shell: '#03130d', screen: '#051b12', key: '#0e2e20', card: '#0e2e20', border: '#1c4a35', accent: '#30d158', ok: '#30d158', bad: '#ff453a', warn: '#ffd60a', sub: '#7fb8a0', muted: '#3f6e5c', text: '#eafff4', msgMine: '#248a3d', msgOther: '#13352a', shape: 'round', keys: 'circle', font: '-apple-system, "SF Pro", sans-serif' },
  graphite: { name: 'graphite', label: '深空黑', shell: '#000', screen: '#050505', key: '#141414', card: '#141414', border: '#262626', accent: '#8e8e93', ok: '#30d158', bad: '#ff453a', warn: '#ffd60a', sub: '#6e6e73', muted: '#3a3a3c', text: '#f5f5f7', msgMine: '#48484a', msgOther: '#1c1c1e', shape: 'squared', keys: 'square', font: '-apple-system, "SF Pro", sans-serif' },
  retro: { name: 'retro', label: '复古电话', shell: '#f4e9d8', screen: '#f9f3e7', key: '#d8c49a', card: '#efe4d0', border: '#b3a07c', accent: '#b45309', ok: '#16a34a', bad: '#dc2626', warn: '#d97706', sub: '#6b5433', muted: '#8a7355', text: '#241a0d', msgMine: '#b45309', msgOther: '#e0d2ba', shape: 'retro', keys: 'retro', font: '"Courier New", monospace' },
}

// ── SF Symbols 风格图标（Material Design Icons 形状，Apache-2.0）──
export const SF: Record<string, string> = {
  phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  people: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  note: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  chart: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z',
  sim: 'M19.99 4c0-1.1-.89-2-1.99-2h-8L4 8v12c0 1.1.9 2 2 2h12.01c1.1 0 1.99-.9 1.99-2l-.01-16zM9 19H7v-2h2v2zm8 0h-2v-2h2v2zm-8-4H7v-4h2v4zm4 4h-2v-4h2v4zm0-6h-2v-2h2v2zm4 2h-2v-4h2v4z',
  palette: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  backspace: 'M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  creditcard: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  contacts: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 5c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 12c-2.5 0-4.5.75-6 2h12c-1.5-1.25-3.5-2-6-2z',
}

// ── 统一 App 导航栏（左上角 < 返回 + 右侧 App 名）──
export function AppBar({ title, onBack, theme }: { title: string; onBack: () => void; theme: Theme }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: `1px solid ${theme.border || '#2c2c2e'}` }}>
      <button onClick={onBack}
        style={{ background: 'none', border: 'none', color: theme.accent, fontSize: 20, cursor: 'pointer', padding: '0 6px', lineHeight: 1 }}>
        &lt;
      </button>
      <span style={{ fontSize: 12, color: '#fff' }}>{title}</span>
    </div>
  )
}

// ── iOS 风格 App 图标：渐变圆角方形 + 白色 SF 图形 ──
export function AppIcon({ d, img, bg, size = 50, iconSize = 26 }: { d?: string; img?: string; bg: string; size?: number; iconSize?: number }): JSX.Element {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(0,0,0,.45)' }}>
      {img
        ? <img src={img} alt="app" style={{ width: '100%', height: '100%', borderRadius: Math.round(size * 0.22), display: 'block' }} />
        : <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="#fff" style={{ display: 'block' }}><path d={d} /></svg>}
    </div>
  )
}
