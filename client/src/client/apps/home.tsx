/**
 * HomeApp — Launcher 主界面（iPhone 风格：左上 2×2 时钟 widget + 4 列图标）
 * 布局：时钟占 (1,1)-(2,2)，右边 4 图标（电话/信息/RCS/备忘录），第三行 4 图标
 * 从注册表读取 App，网格渲染；点击调用 app.onOpen + nav(app.id)
 */
import React, { useEffect, useState } from 'react'
import { getApps, type AppProps } from '../apps'
import { AppIcon } from '../theme'
import { PHONE_BASE } from '../config'

// ── iPhone 风格指针表（analog clock，实时走动，占 2×2）──
function ClockWidget({ theme }: { theme: any }): JSX.Element {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const h = now.getHours() % 12
  const m = now.getMinutes()
  const s = now.getSeconds()
  // 指针角度（度）
  const hourDeg = h * 30 + m * 0.5
  const minDeg = m * 6 + s * 0.1
  const secDeg = s * 6
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
  const month = now.getMonth() + 1
  const date = now.getDate()
  return (
    <div style={{ gridColumn: 'span 2', gridRow: 'span 2',
      background: 'linear-gradient(160deg,#1c1c1e,#000)',
      borderRadius: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4px 6px 2px', boxShadow: '0 3px 10px rgba(0,0,0,.45)', minHeight: 0, overflow: 'hidden' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: 'auto', flex: 1, minHeight: 0, maxHeight: '100%', aspectRatio: '1/1' }}>
        {/* 表盘 */}
        <circle cx="50" cy="50" r="49" fill="#0c0c0e" stroke="#3a3a3c" strokeWidth="2" />
        {/* 刻度（12 个主刻度 + 60 小刻度）*/}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = i * 30 * Math.PI / 180
          const x1 = 50 + 43 * Math.sin(a), y1 = 50 - 43 * Math.cos(a)
          const x2 = 50 + 37.5 * Math.sin(a), y2 = 50 - 37.5 * Math.cos(a)
          return <line key={'h' + i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={i % 3 === 0 ? 2.8 : 1.5} strokeLinecap="round" />
        })}
        {Array.from({ length: 60 }).map((_, i) => {
          if (i % 5 === 0) return null
          const a = i * 6 * Math.PI / 180
          const x1 = 50 + 45 * Math.sin(a), y1 = 50 - 45 * Math.cos(a)
          const x2 = 50 + 42.5 * Math.sin(a), y2 = 50 - 42.5 * Math.cos(a)
          return <line key={'m' + i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5a5a5e" strokeWidth="1" />
        })}
        {/* 时针 */}
        <line x1="50" y1="50" x2="50" y2="32" stroke="#fff" strokeWidth="4.6" strokeLinecap="round"
          transform={`rotate(${hourDeg} 50 50)`} />
        {/* 分针 */}
        <line x1="50" y1="50" x2="50" y2="21" stroke="#fff" strokeWidth="3" strokeLinecap="round"
          transform={`rotate(${minDeg} 50 50)`} />
        {/* 秒针（橙色）*/}
        <line x1="50" y1="58" x2="50" y2="14" stroke="#ff9f0a" strokeWidth="1.6" strokeLinecap="round"
          transform={`rotate(${secDeg} 50 50)`} />
        {/* 中心点 */}
        <circle cx="50" cy="50" r="3.5" fill="#ff9f0a" />
        <circle cx="50" cy="50" r="1.5" fill="#0c0c0e" />
      </svg>
      <div style={{ fontSize: 9, color: '#8e8e93', paddingBottom: 2, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {week} · {month}月{date}日
      </div>
    </div>
  )
}

export function HomeApp(p: AppProps): JSX.Element {
  const { t, data } = p
  const apps = getApps().filter((a) => !a.system && !a.hidden)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '4px 0 10px' }}>
        <div style={{ fontSize: 16, letterSpacing: 1, color: '#fff' }}>{data.ownNumber}</div>
        <img src={`${PHONE_BASE}/store/assets/l${data.badgeLevel}.png`} alt={`L${data.badgeLevel}`} style={{ height: 20 }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, auto)', gap: 12, alignContent: 'start', padding: '6px 2px' }}>
        <ClockWidget theme={t} />
        {apps.map((app) => (
          <button key={app.id} onClick={() => { app.onOpen?.(p); p.nav(app.id) }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}>
            <AppIcon d={app.icon.d} img={app.icon.img} bg={app.bg} />
            <span style={{ fontSize: 10, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.6)' }}>{app.label}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 9, color: t.sub, textAlign: 'center', padding: '4px 0' }}>智能体互联网终端 · CHA2A</div>
    </div>
  )
}
