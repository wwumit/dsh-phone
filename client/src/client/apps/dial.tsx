/**
 * DialApp — 拨号（等大圆键 + 电话本/拨号/退格）
 * 通过 actions.dial 发起呼叫；号码输入用本地 state，电话本按钮跳通讯录
 */
import React from 'react'
import { type AppProps } from '../apps'
import { AppBar, SF } from '../theme'

export function DialApp(p: AppProps): JSX.Element {
  const { t, data, actions, back } = p
  const target = data.dialTarget || '+86'
  const setNum = (v: string) => actions.setLocalNum(v)
  const roundBtn = (bg: string, w = 56): React.CSSProperties => ({
    width: w, height: w, borderRadius: '50%', background: bg, color: '#fff', border: 0, fontSize: 11, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
  })
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <AppBar title="电话" onBack={back} theme={t} />
      <input value={target} onChange={(e) => setNum(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', color: '#fff',
          border: 'none', borderBottom: '1px solid #2c2c2e', padding: '8px 4px', fontSize: 26, textAlign: 'center', letterSpacing: 3, marginBottom: 6 }}
        placeholder="拨给 0002" />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gridAutoRows: '1fr', justifyContent: 'center', alignContent: 'center', gap: '8px 22px', minHeight: 0, paddingBottom: 4 }}>
        {['1','2','3','4','5','6','7','8','9','*','0','#'].map((k) => (
          <button key={k} onClick={() => setNum(target + k)}
            style={{ width: 76, height: 76, justifySelf: 'center', alignSelf: 'center',
              borderRadius: '50%', background: t.key, color: t.text, border: 0, fontSize: 27, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
            {k}
            <span style={{ fontSize: 9, color: t.sub, marginTop: 1, letterSpacing: 1 }}>{({ '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ' } as any)[k] || ''}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 44, paddingTop: 4 }}>
        <button onClick={() => { actions.loadContacts(); p.nav('contacts') }} title="电话本"
          style={roundBtn(t.key, 52)}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><path d={SF.contacts} /></svg>
          <span style={{ fontSize: 9 }}>电话本</span>
        </button>
        <button onClick={() => actions.dial(p.id, target)} disabled={!!data.call} style={roundBtn(t.ok, 62)}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="#fff"><path d={SF.phone} /></svg>
          <span style={{ fontSize: 9 }}>拨号</span>
        </button>
        <button onClick={() => setNum(target.slice(0, -1))} title="退格"
          style={roundBtn(t.key, 52)}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><path d={SF.backspace} /></svg>
          <span style={{ fontSize: 9 }}>退格</span>
        </button>
      </div>
    </div>
  )
}
