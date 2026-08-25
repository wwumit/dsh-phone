/**
 * GroupApp — RCS 群列表（我的群）
 * GroupChatApp — RCS 群会话（消息流 + @agent）
 * 数据来自 data.group（共享），动作走 actions.group*
 */
import React, { useState } from 'react'
import { type AppProps } from '../apps'
import { AppBar } from '../theme'
import { PHONE_BASE, AGENT_DID } from '../config'

// 群已读游标（localStorage：groupId → 已读 seq；未读数 = lastMsgSeq - readSeq）
const READ_KEY = 'dsh-phone-group-read'
function loadRead(): Record<string, number> { try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}') } catch { return {} } }
function saveRead(segs: Record<string, number>): void { localStorage.setItem(READ_KEY, JSON.stringify(segs)) }

export function GroupApp(p: AppProps): JSX.Element {
  const { t, data, actions, nav, back } = p
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupMembers, setNewGroupMembers] = useState('')
  const [picked, setPicked] = useState<string[]>([])   // 从通讯录点选的成员号码
  const [createErr, setCreateErr] = useState('')
  const [creating, setCreating] = useState(false)

  // 展开创建表单时：若通讯录未加载则拉取（registry 号码簿 = 可选的成员池）
  function toggleCreate(): void {
    const next = !showCreateGroup
    setShowCreateGroup(next)
    if (next && !data.contacts) actions.loadContacts()
    if (next && !data.agents) actions.loadAgents()
  }
  // 点选/取消联系人
  function togglePick(number: string): void {
    setPicked((prev) => (prev.includes(number) ? prev.filter((x) => x !== number) : [...prev, number]))
  }
  // 组合成员：点选的 + 手动输入的（号码/agent DID）
  const manualMembers = newGroupMembers.split(',').map((x) => x.trim()).filter(Boolean)
  const allMembers = [...new Set([...picked, ...manualMembers])]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="群聊" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 6, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
        {data.group.list.length === 0
          ? <div style={{ fontSize: 12, color: t.muted }}>暂无群（点刷新加载）</div>
          : data.group.list.map((g) => {
            const unread = Math.max(0, (g.lastMsgSeq || 0) - (loadRead()[g.groupId] || 0))
            return (
            <button key={g.groupId} onClick={async () => { await actions.openGroup(g.groupId); nav('group-chat') }} style={{ display: 'block', width: '100%', textAlign: 'left', background: t.key, border: '1px solid #2c2c2e', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#fff', fontSize: 13, flex: 1 }}>{g.name}</span>
                {unread > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#ff3b30', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{unread > 99 ? '99+' : unread}</span>}
              </div>
              <div style={{ color: t.sub, fontSize: 10 }}>{g.memberCount} 成员</div>
              {g.announcement && <div style={{ color: t.warn, fontSize: 10, marginTop: 2 }}>📢 {g.announcement}</div>}
            </button>
            )
          })}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={actions.loadGroupList} style={{ flex: 1, height: 30, borderRadius: 999, background: t.accent, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>刷新群列表</button>
        <button onClick={toggleCreate} style={{ flex: 1, height: 30, borderRadius: 999, background: t.key, color: t.accent, border: '1px solid #2c2c2e', fontSize: 12, cursor: 'pointer' }}>{showCreateGroup ? '取消' : '＋ 新建群'}</button>
      </div>
      {showCreateGroup && (
        <div style={{ marginTop: 8, background: '#0c0c0e', borderRadius: 12, padding: 10 }}>
          <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="群名称"
            style={{ width: '100%', boxSizing: 'border-box', background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 8, padding: '7px 10px', fontSize: 13, marginBottom: 6 }} />
          {/* 成员选择：号码成员（通讯录）+ agent 成员（已注册，含无号码的）+ 手动补充 */}
          <div style={{ fontSize: 10, color: t.sub, marginBottom: 4 }}>成员（📞 号码成员 / 🤖 agent 成员（无号码），均点选；也可手输）</div>
          <div style={{ maxHeight: 132, overflowY: 'auto', background: t.key, borderRadius: 8, padding: 6, marginBottom: 6 }}>
            {!data.contacts && !data.agents && <div style={{ fontSize: 11, color: t.muted, padding: 4 }}>成员加载中…</div>}
            {/* 号码成员（有号码的：人 或 agent 的号码——通讯录） */}
            {data.contacts?.map((c) => {
              const on = picked.includes(c.number)
              return (
                <button key={c.number} onClick={() => togglePick(c.number)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: on ? 'rgba(10,132,255,.18)' : 'transparent',
                    border: on ? '1px solid #0a84ff' : '1px solid transparent', borderRadius: 8, padding: '5px 8px', marginBottom: 3, cursor: 'pointer' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? '2px solid #0a84ff' : '1px solid #48484a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', flexShrink: 0 }}>
                    {on ? '✓' : ''}
                  </span>
                  <img src={`${PHONE_BASE}/store/assets/l${c.level}.png`} alt={`L${c.level}`} style={{ height: 14, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#fff' }}>{c.displayName || c.agentDid.split(':').pop()}</span>
                  <span style={{ fontSize: 11, color: t.sub }}>{c.number}</span>
                </button>
              )
            })}
            {/* agent 成员组：仅无号码的 agent（有号码的已在号码成员组，避免重复） */}
            {data.agents?.filter((a) => a.agentDid !== AGENT_DID && (!a.numbers || a.numbers.length === 0)).map((a) => {
              const on = picked.includes(a.agentDid)
              return (
                <button key={a.agentDid} onClick={() => togglePick(a.agentDid)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: on ? 'rgba(10,132,255,.18)' : 'transparent',
                    border: on ? '1px solid #0a84ff' : '1px solid transparent', borderRadius: 8, padding: '5px 8px', marginBottom: 3, cursor: 'pointer' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? '2px solid #0a84ff' : '1px solid #48484a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', flexShrink: 0 }}>
                    {on ? '✓' : ''}
                  </span>
                  <img src={`${PHONE_BASE}/store/assets/l${a.level}.png`} alt={`L${a.level}`} style={{ height: 14, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#fff' }}>🤖 {a.name}</span>
                  <span style={{ fontSize: 10, color: a.numbers.length ? t.sub : t.warn }}>{a.numbers.length ? a.numbers.join('、') : '无号码'}</span>
                </button>
              )
            })}
          </div>
          <input value={newGroupMembers} onChange={(e) => setNewGroupMembers(e.target.value)} placeholder="补充：agent DID，逗号分隔（如 did:cha2a:agent:term-a）"
            style={{ width: '100%', boxSizing: 'border-box', background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 8, padding: '7px 10px', fontSize: 12, marginBottom: 6 }} />
          <div style={{ fontSize: 10, color: t.sub, marginBottom: 6 }}>已选 {allMembers.length} 名成员{allMembers.length ? '：' + allMembers.join(', ') : ''}</div>
          <button onClick={async () => {
            const name = newGroupName.trim()
            if (!name || !allMembers.length) { setCreateErr('请填写群名称，并至少选 1 名成员'); return }
            setCreating(true); setCreateErr('')
            const res = await actions.createGroup(name, allMembers)
            setCreating(false)
            if (res.gid) {
              setShowCreateGroup(false); setNewGroupName(''); setNewGroupMembers(''); setPicked([]); setCreateErr('')
              await actions.openGroup(res.gid)   // 等群详情加载完成（currentGroup 就绪）再进会话
              nav('group-chat')
            }
            else setCreateErr(res.error)
          }} disabled={creating} style={{ width: '100%', height: 32, borderRadius: 999, background: t.ok, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>{creating ? '创建中…' : `创建群（${allMembers.length} 人）`}</button>
          {createErr && <div style={{ marginTop: 6, fontSize: 11, color: t.bad }}>⚠ {createErr}</div>}
        </div>
      )}
    </div>
  )
}

export function GroupChatApp(p: AppProps): JSX.Element {
  const { t, data, actions, back } = p
  const [groupInput, setGroupInput] = useState('')
  const [atQuery, setAtQuery] = useState<string | null>(null)   // 输入 @ 后的查询串（null=未激活）
  const [atIndex, setAtIndex] = useState(0)                      // 键盘高亮索引
  const [sendErr, setSendErr] = useState('')
  const [sendNote, setSendNote] = useState('')
  const sendNoteTimer = React.useRef<any>(null)
  // 提示闪现：6 秒兜底自动消失
  function flashNote(msg: string): void {
    setSendNote(msg)
    if (sendNoteTimer.current) clearTimeout(sendNoteTimer.current)
    sendNoteTimer.current = setTimeout(() => setSendNote(''), 6000)
  }
  // 收到 agent 回复 → "等待回复"提示立即消失
  React.useEffect(() => {
    const last = data.group.msgs[data.group.msgs.length - 1]
    if (last && (last.text || '').startsWith('[agent回复]')) setSendNote('')
  }, [data.group.msgs.length])
  const [nickMap, setNickMap] = useState<Record<string, { nickname: string; type: 'phone' | 'agent'; level: number; capabilities?: string[] }>>({})
  const cur = data.group.current
  if (!cur) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.muted, fontSize: 12 }}>群不存在</div>
  // 消息列表自动滚动到底部（新消息进来 / 打开群时）
  const msgBoxRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (msgBoxRef.current) msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight
  }, [data.group.msgs.length, cur.groupId])

  // 拉取成员详情（昵称/类型/等级）→ 建映射（member 原文 → 呈现信息）
  React.useEffect(() => {
    fetch(`${PHONE_BASE}/api/v1/phone/group/${cur.groupId}/members-detail`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.members) {
          const m: Record<string, { nickname: string; type: 'phone' | 'agent'; level: number; capabilities?: string[] }> = {}
          d.members.forEach((x: any) => { m[x.member] = { nickname: x.nickname, type: x.type, level: x.level, ...(x.capabilities ? { capabilities: x.capabilities } : {}) } })
          setNickMap(m)
        }
      })
      .catch(() => {})
    // 打开群会话即标记已读（读游标 = 群 lastMsgSeq）
    const g = data.group.list.find((x) => x.groupId === cur.groupId)
    const seq = g?.lastMsgSeq || 0
    if (seq > 0) {
      const r = loadRead()
      if ((r[cur.groupId] || 0) < seq) { r[cur.groupId] = seq; saveRead(r) }
    }
  }, [cur.groupId])

  // 消息发送者昵称：优先成员详情映射（成员 key 或归一化号码）；owner DID → owner 名；回退短号
  function senderName(fromNumber: string): { name: string; type: 'phone' | 'agent'; level: number } {
    const norm = (s: string) => s.replace(/[^0-9+]/g, '')
    // owner（B 面板操作人员）发言：fromNumber=OWNER_DID → 显示 owner 注册名
    if (data.ownerDid && (fromNumber === data.ownerDid || norm(fromNumber) === norm(data.ownerDid))) {
      return { name: data.account.ownerName || 'Owner', type: 'agent' as const, level: 2 }
    }
    const hit = Object.entries(nickMap).find(([k]) => norm(k) === norm(fromNumber) || k === fromNumber)
    if (hit) return { name: hit[1].nickname, type: hit[1].type, level: hit[1].level }
    return { name: fromNumber.replace(/^\+86 95123 0+/, '').replace(/^\+86/, ''), type: 'phone' as const, level: 0 }
  }
  // @ 高亮：消息文本里 @xxx 着色
  function renderText(text: string): JSX.Element {
    const parts = text.split(/(@[\w.-]+)/g)
    return <>{parts.map((part, i) => part.startsWith('@')
      ? <span key={i} style={{ color: '#ffd60a', fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>)}</>
  }

  // @ 候选：群成员（昵称优先：成员详情映射；回退号码/DID 短名）。自己排除。
  const atCandidates = (cur.members || [])
    .map((m) => {
      if (m.startsWith('did:cha2a:agent:')) {
        const nick = nickMap[m]?.nickname || m.split(':').pop()!
        const caps = nickMap[m]?.capabilities || []
        return { key: m, label: nick, match: nick + ' ' + caps.join(' '), isAgent: true, caps }
      }
      const nick = nickMap[m]?.nickname || m
      return { key: m, label: nick, match: m.replace(/[^0-9+]/g, ''), isAgent: false }
    })
    .filter((c) => c.match !== data.ownNumber.replace(/[^0-9+]/g, ''))
  function onInputChange(v: string): void {
    setGroupInput(v)
    // 输入流末尾出现 @ → 激活选择器；@ 后有字符 → 过滤候选
    const at = v.lastIndexOf('@')
    if (at !== -1 && !v.slice(at + 1).includes(' ')) {
      if (atQuery === null) setAtIndex(0)   // 刚激活：高亮第一项
      else setAtIndex(0)                    // 过滤变化：重置高亮
      setAtQuery(v.slice(at + 1))
    } else {
      setAtQuery(null)
    }
  }
  function pickAt(c: { key: string; label: string; isAgent: boolean }): void {
    // 用 @名字 替换掉输入流末尾的 @查询；agent 插入 DID 短名（@volcano-demo），号码成员插入短号（@0001）
    const at = groupInput.lastIndexOf('@')
    const head = at === -1 ? groupInput : groupInput.slice(0, at)
    const mention = c.isAgent ? c.key.split(':').pop()! : c.key.replace(/^\+86\s*/, '').replace(/^\+86/, '')
    setGroupInput(head + '@' + mention + ' ')
    setAtQuery(null)
  }
  const filtered = atQuery !== null
    ? atCandidates.filter((c) => c.match.toLowerCase().includes(atQuery.toLowerCase()))
    : atCandidates

  async function sendGroup(): Promise<void> {
    const text = groupInput.trim()
    if (!text) return
    // @agent 校验：@ 的 agent 必须是群成员（群成员是号码/DID 列表）
    // 匹配：agent DID 短名 / 昵称（nickMap）/ 号码成员按 +86 归一
    const m = text.match(/^@([\w.-]+)\s/)
    if (m) {
      const mentioned = m[1]
      const normNum = (s: string) => s.replace(/^\+86/, '').replace(/[^0-9]/g, '')
      const isMember = (cur.members || []).some((mm) =>
        mm === `did:cha2a:agent:${mentioned}` ||
        nickMap[mm]?.nickname === mentioned ||
        (!mm.startsWith('did:') && normNum(mm) === normNum(mentioned)))
      if (!isMember) { setSendErr(`⚠ ${mentioned} 不在本群，无法 @`); return }
    }
    setSendErr('')
    setGroupInput('')
    setAtQuery(null)
    actions.reportUsage('group_msgs', 1)
    const res = await actions.sendGroup(p.id === 'A' ? 'A' : 'B', text)
    // 信任门禁/广播错误（如 @agent 等级低于门禁）优先显示
    if (res && res.error) setSendErr(`⛔ ${res.error}`)
    // 投递反馈：@了 agent 时提示送达/失败（回复异步回来，这里只确认投递）
    else if (res && res.delivered.length) flashNote(`已投递给 ${res.delivered.join('、')}，等待回复…`)
    else if (res && res.failed.length) setSendErr(`⚠ ${res.failed.join('、')} 投递失败（agent 会话未就绪）`)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid #2c2c2e' }}>
        <button onClick={() => { actions.groupBack(); back() }} style={{ background: 'none', border: 'none', color: t.accent, fontSize: 20, cursor: 'pointer', padding: '0 6px', lineHeight: 1 }}>&lt;</button>
        <span style={{ flex: 1, fontSize: 12, color: '#fff', textAlign: 'center' }}>{cur.name + '（' + cur.members.length + ' 成员）'}</span>
        <button onClick={() => p.nav('group-info')} title="群资料" style={{ background: 'none', border: 'none', color: t.accent, fontSize: 14, cursor: 'pointer', padding: '0 6px' }}>⋯</button>
      </div>
      {cur.announcement && <div style={{ fontSize: 11, color: t.warn, background: 'rgba(255,159,10,.08)', border: '1px solid rgba(255,159,10,.25)', borderRadius: 8, padding: '5px 10px', margin: '4px 0' }}>📢 {cur.announcement}</div>}
      <div ref={msgBoxRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 6, background: '#0c0c0e', borderRadius: 12, padding: 8 }}>
        {data.group.msgs.length === 0
          ? <div style={{ fontSize: 12, color: t.muted }}>群消息为空（发 @agent 可与智能体协作）</div>
          : data.group.msgs.map((m, i) => {
            // "自己" = 本面板号码发的（右侧）；agent 回复（fromNumber=DID 或带 agent 字段）是对方，左侧带 🤖
            // （群聊里 @dshlib 的是别人，dshlib 的回复是"对方 agent"，不是用户自己发的）
            // owner（B 面板）发言：from=OWNER_DID 也算"我"（操作人员身份）
            const norm = (s: string) => String(s || '').replace(/[^0-9+]/g, '')
            const mine = (!!m.fromNumber && !m.agent && norm(m.fromNumber) === norm(data.ownNumber)) || (m.from === data.ownerDid && !m.agent)
            const sn = senderName(m.fromNumber || '')
            // v2 多 agent：优先用消息自带 agent 字段（node 半回复归属），回退成员映射
            const agentInfo = m.agent || (sn.type === 'agent' ? { did: '', name: sn.name, level: sn.level } : null)
            const recalled = m.status === 'recalled'
            const isCard = m.kind === 'card'
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: agentInfo ? '#ffd60a' : '#8e8e93', marginBottom: 2, padding: '0 2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {mine ? '我' : (agentInfo ? (agentInfo.name || sn.name) : sn.name)}
                  {agentInfo && <img src={`${PHONE_BASE}/store/assets/l${agentInfo.level || sn.level}.png`} alt={`L${agentInfo.level || sn.level}`} style={{ height: 11 }} />}
                  {agentInfo ? ' 🤖' : ''}
                </div>
                <div style={{ maxWidth: '82%', padding: '6px 11px', borderRadius: 12,
                  background: mine ? t.msgMine : t.msgOther, color: recalled ? t.muted : t.text, fontSize: 12,
                  borderTopRightRadius: mine ? 3 : 12, borderTopLeftRadius: mine ? 12 : 3,
                  ...(recalled ? { fontStyle: 'italic' } : {}) }}>
                  {recalled ? '（已撤回）' : isCard && m.payload
                    ? (
                      <div>
                        {m.payload.title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{m.payload.title}</div>}
                        {(m.payload.fields || []).map((f: any, j: number) => (
                          <div key={j} style={{ fontSize: 11, marginBottom: 2, display: 'flex', gap: 6 }}>
                            {f.k && <span style={{ color: t.sub }}>{f.k}:</span>}
                            <span>{f.v}</span>
                          </div>
                        ))}
                        {(m.payload.actions || []).map((a: any, j: number) => (
                          <button key={j} onClick={() => a.url && window.open(a.url, '_blank')}
                            style={{ marginTop: 6, marginRight: 6, background: t.accent, color: '#fff', border: 0, borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>{a.label}</button>
                        ))}
                      </div>
                    )
                    : renderText(m.text || '')}
                </div>
                <div style={{ fontSize: 8, color: t.muted, marginTop: 2, padding: '0 2px' }}>
                  {m.ts ? new Date(m.ts).toTimeString().slice(0, 5) : ''}{m.status === 'recalled' ? ' · 已撤回' : ''}
                </div>
              </div>
            )
          })}
      </div>
      {sendNote && <div style={{ marginBottom: 6, fontSize: 11, color: '#0a84ff' }}>📨 {sendNote}</div>}
      {sendErr && <div style={{ marginBottom: 6, fontSize: 11, color: t.bad }}>{sendErr}</div>}
      {atQuery !== null && (
        <div style={{ marginBottom: 6, background: '#0c0c0e', border: '1px solid #2c2c2e', borderRadius: 10, overflow: 'hidden', maxHeight: 140, overflowY: 'auto' }}>
          {filtered.length === 0
            ? <div style={{ fontSize: 11, color: t.muted, padding: '8px 10px' }}>无匹配成员</div>
            : filtered.map((c, i) => (
              <button key={c.key} onClick={() => pickAt(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: i === atIndex ? 'rgba(10,132,255,.22)' : 'none', border: 'none', padding: '7px 10px', cursor: 'pointer' }}>
                {c.isAgent
                  ? <span style={{ fontSize: 11, color: '#ffd60a', border: '1px solid #ffd60a', borderRadius: 5, padding: '1px 5px', flexShrink: 0, background: 'rgba(255,214,10,.08)' }}>🤖 agent</span>
                  : <span style={{ fontSize: 11, color: '#5ac8fa', border: '1px solid #5ac8fa', borderRadius: 5, padding: '1px 5px', flexShrink: 0, background: 'rgba(90,200,250,.08)' }}>📞 电话</span>}
                <span style={{ fontSize: 12, color: '#fff', flex: 1 }}>{c.isAgent ? c.label : c.label.replace(/^\+86 95123 0+/, '')}</span>
                {(c as any).caps && (c as any).caps.length > 0 && (
                  <span style={{ fontSize: 9, color: t.sub, display: 'flex', gap: 3 }}>
                    {(c as any).caps.slice(0, 3).map((cap: string, j: number) => (
                      <span key={j} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 4, padding: '1px 5px' }}>{cap}</span>
                    ))}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={groupInput} onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (atQuery !== null) {
              // 选择器打开：方向键移动高亮、Enter 选中、Esc 关闭
              if (e.key === 'ArrowDown') { e.preventDefault(); setAtIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0))) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setAtIndex((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); if (filtered[atIndex]) pickAt(filtered[atIndex]) }
              else if (e.key === 'Escape') { setAtQuery(null) }
            } else if (e.key === 'Enter') {
              sendGroup()
            }
          }} placeholder="发到群 · @ 选择成员 · @agent 可与智能体协作"
          style={{ flex: 1, background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        <button onClick={sendGroup} style={{ height: 32, padding: '0 14px', borderRadius: 999, background: t.accent, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>发送</button>
      </div>
    </div>
  )
}

// ── 群资料页（成员列表昵称化 + 群主标记 + 加人/踢人）──
export function GroupInfoApp(p: AppProps): JSX.Element {
  const { t, data, actions, nav, back } = p
  const cur = data.group.current
  const [nickMap, setNickMap] = useState<Record<string, { nickname: string; type: 'phone' | 'agent'; level: number; capabilities?: string[] }>>({})
  const [addMode, setAddMode] = useState(false)
  const [addPick, setAddPick] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  if (!cur) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.muted, fontSize: 12 }}>群不存在</div>

  // 拉成员详情（昵称/类型/等级）
  React.useEffect(() => {
    fetch(`${PHONE_BASE}/api/v1/phone/group/${cur.groupId}/members-detail`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.members) {
          const m: Record<string, { nickname: string; type: 'phone' | 'agent'; level: number }> = {}
          d.members.forEach((x: any) => { m[x.member] = { nickname: x.nickname, type: x.type, level: x.level } })
          setNickMap(m)
        }
      })
      .catch(() => {})
    if (!data.contacts) actions.loadContacts()
  }, [cur.groupId])

  // 加成员（管理操作走后端 member 端点；此处用简单提示——完整权限控制是管理端职责）
  function addMembers(): void {
    if (!addPick.length) return
    addPick.forEach((m) => {
      fetch(`${PHONE_BASE}/api/v1/phone/group/member`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: cur.groupId, member: m }),
      }).then((r) => r.json()).then((d) => {
        if (d && d.ok) { setMsg(`已添加 ${m}`); actions.loadGroupList() }
        else setMsg(d?.error || '添加失败')
      }).catch(() => setMsg('网络错误'))
    })
    setAddMode(false); setAddPick([])
  }
  // 移除成员
  function removeMember(member: string): void {
    fetch(`${PHONE_BASE}/api/v1/phone/group/member?groupId=${cur.groupId}&member=${encodeURIComponent(member)}`, {
      method: 'DELETE',
    }).then((r) => r.json()).then((d) => {
      if (d && d.ok) { setMsg(`已移除 ${member}`); actions.loadGroupList() }
      else setMsg(d?.error || '移除失败')
    }).catch(() => setMsg('网络错误'))
  }
  // 群公告（编辑/显示）
  const [annInput, setAnnInput] = useState<string | null>(null)
  function saveAnn(): void {
    const text = (annInput ?? '').trim()
    if (!text) { setMsg('公告不能为空'); return }
    actions.setAnnouncement(cur.groupId, text).then((r) => {
      if (r.ok) { setMsg('公告已更新'); setAnnInput(null); actions.openGroup(cur.groupId) }
      else setMsg(r.error || '公告设置失败')
    })
  }
  // 退出群 / 解散群
  const [confirming, setConfirming] = useState<'leave' | 'disband' | null>(null)
  function doLeave(): void {
    actions.leaveGroup(cur.groupId, data.ownNumber).then((r) => {
      if (r.ok) { actions.groupBack(); nav('group') }
      else { setMsg(r.error || '退出失败'); setConfirming(null) }
    })
  }
  function doDisband(): void {
    actions.disbandGroup(cur.groupId).then((r) => {
      if (r.ok) { actions.groupBack(); nav('group') }
      else { setMsg(r.error || '解散失败'); setConfirming(null) }
    })
  }
  const display = (member: string): { nickname: string; type: string; level: number } =>
    nickMap[member] || { nickname: member.startsWith('did:cha2a:agent:') ? member.split(':').pop()! : member.replace(/^\+86 95123 0+/, ''), type: member.startsWith('did:cha2a:agent:') ? 'agent' : 'phone', level: 0 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AppBar title="群资料" onBack={back} theme={t} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: 8 }}>
        <div style={{ background: t.card, border: '1px solid #2c2c2e', borderRadius: 12, padding: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>{cur.name}</div>
          <div style={{ fontSize: 10, color: t.sub, marginTop: 2 }}>{cur.members.length} 名成员 · 群主 {display(cur.createdBy || '').nickname || '—'}</div>
          {cur.conversationId && <div style={{ fontSize: 9, color: t.muted, marginTop: 2 }}>会话 {cur.conversationId}</div>}
          {/* 群公告 */}
          <div style={{ fontSize: 11, color: t.sub, marginTop: 8, marginBottom: 3 }}>📢 群公告</div>
          {annInput === null
            ? (cur.announcement
              ? <div style={{ fontSize: 12, color: '#fff', background: '#0c0c0e', borderRadius: 8, padding: '6px 9px' }}>{cur.announcement}</div>
              : <div style={{ fontSize: 11, color: t.muted }}>暂无公告</div>)
            : <input value={annInput} onChange={(e) => setAnnInput(e.target.value)} placeholder="输入公告内容"
              style={{ width: '100%', boxSizing: 'border-box', background: t.key, color: '#fff', border: '1px solid #2c2c2e', borderRadius: 8, padding: '6px 9px', fontSize: 12 }} />}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {annInput === null
              ? <button onClick={() => setAnnInput(cur.announcement || '')} style={{ flex: 1, height: 26, borderRadius: 999, background: t.key, color: t.accent, border: '1px solid #2c2c2e', fontSize: 11, cursor: 'pointer' }}>✎ 编辑公告</button>
              : <><button onClick={saveAnn} style={{ flex: 1, height: 26, borderRadius: 999, background: t.ok, color: '#fff', border: 0, fontSize: 11, cursor: 'pointer' }}>保存</button>
                 <button onClick={() => setAnnInput(null)} style={{ flex: 1, height: 26, borderRadius: 999, background: t.key, color: t.sub, border: '1px solid #2c2c2e', fontSize: 11, cursor: 'pointer' }}>取消</button></>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.sub, marginBottom: 4 }}>成员</div>
        {cur.members.map((m) => {
          const d = display(m)
          const isOwner = m === cur.createdBy || m.replace(/[^0-9+]/g, '') === (cur.createdBy || '').replace(/[^0-9+]/g, '')
          return (
            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.card, border: '1px solid #2c2c2e', borderRadius: 10, padding: '7px 10px', marginBottom: 4 }}>
              <img src={`${PHONE_BASE}/store/assets/l${d.level}.png`} alt={`L${d.level}`} style={{ height: 16 }} />
              <span style={{ flex: 1, fontSize: 13, color: '#fff' }}>{d.nickname}</span>
              {d.type === 'agent' ? <span style={{ fontSize: 9, color: '#ffd60a', border: '1px solid #ffd60a', borderRadius: 4, padding: '0 4px' }}>🤖 agent</span> : <span style={{ fontSize: 9, color: '#5ac8fa', border: '1px solid #5ac8fa', borderRadius: 4, padding: '0 4px' }}>📞 电话</span>}
              {isOwner && <span style={{ fontSize: 9, color: t.warn }}>群主</span>}
              <button onClick={() => removeMember(m)} title="移除" style={{ background: 'none', border: 'none', color: t.bad, fontSize: 13, cursor: 'pointer' }}>✕</button>
            </div>
          )
        })}
        {addMode && (
          <div style={{ marginTop: 8, background: '#0c0c0e', borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 10, color: t.sub, marginBottom: 4 }}>从通讯录选择要添加的成员</div>
            <div style={{ maxHeight: 150, overflowY: 'auto', background: t.key, borderRadius: 8, padding: 6, marginBottom: 6 }}>
              {(data.contacts || []).filter((c) => !cur.members.some((m) => m.replace(/[^0-9+]/g, '') === c.number.replace(/[^0-9+]/g, ''))).map((c) => {
                const on = addPick.includes(c.number)
                return (
                  <button key={c.number} onClick={() => setAddPick((prev) => on ? prev.filter((x) => x !== c.number) : [...prev, c.number])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '5px 8px', cursor: 'pointer' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: on ? '2px solid #0a84ff' : '1px solid #48484a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{on ? '✓' : ''}</span>
                    <span style={{ flex: 1, fontSize: 12, color: '#fff' }}>{c.displayName || c.agentDid.split(':').pop()}</span>
                    <span style={{ fontSize: 10, color: t.sub }}>{c.number}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={addMembers} style={{ width: '100%', height: 30, borderRadius: 999, background: t.ok, color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}>添加（{addPick.length} 人）</button>
          </div>
        )}
        {msg && <div style={{ marginTop: 6, fontSize: 11, color: t.sub }}>{msg}</div>}
        <button onClick={() => setAddMode(!addMode)} style={{ width: '100%', height: 30, borderRadius: 999, background: t.key, color: t.accent, border: '1px solid #2c2c2e', fontSize: 12, cursor: 'pointer', marginTop: 8 }}>{addMode ? '取消' : '＋ 添加成员'}</button>
        {/* 退出群 / 解散群 */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => setConfirming(confirming === 'leave' ? null : 'leave')}
            style={{ flex: 1, height: 30, borderRadius: 999, background: t.key, color: t.warn, border: '1px solid rgba(255,159,10,.4)', fontSize: 12, cursor: 'pointer' }}>退出群</button>
          <button onClick={() => setConfirming(confirming === 'disband' ? null : 'disband')}
            style={{ flex: 1, height: 30, borderRadius: 999, background: t.key, color: t.bad, border: '1px solid rgba(255,59,48,.4)', fontSize: 12, cursor: 'pointer' }}>解散群</button>
        </div>
        {confirming === 'leave' && (
          <div style={{ marginTop: 6, fontSize: 11, color: t.sub, textAlign: 'center' }}>
            确定退出该群？<button onClick={doLeave} style={{ marginLeft: 8, background: t.warn, color: '#fff', border: 0, borderRadius: 999, padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>确认退出</button>
            <button onClick={() => setConfirming(null)} style={{ marginLeft: 6, background: t.key, color: t.sub, border: '1px solid #2c2c2e', borderRadius: 999, padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>取消</button>
          </div>
        )}
        {confirming === 'disband' && (
          <div style={{ marginTop: 6, fontSize: 11, color: t.bad, textAlign: 'center' }}>
            解散后群与消息将被清理（审计保留）。确定？
            <button onClick={doDisband} style={{ marginLeft: 8, background: t.bad, color: '#fff', border: 0, borderRadius: 999, padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>确认解散</button>
            <button onClick={() => setConfirming(null)} style={{ marginLeft: 6, background: t.key, color: t.sub, border: '1px solid #2c2c2e', borderRadius: 999, padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>取消</button>
          </div>
        )}
      </div>
    </div>
  )
}
