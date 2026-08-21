/**
 * 内置 App 注册表：把各个 App 组件注册进 dsh-phone App 系统
 * - 系统页（system: true）不进 Launcher（如群会话、设置子页），内部导航可达
 * - 第三方可仿照此文件 registerApp 扩展
 */
import { registerApp } from '../apps'
import { SF } from '../theme'
import { DSHLIB_ICON } from '../dshlibIcon'
import { HomeApp } from './home'
import { DialApp } from './dial'
import { SmsApp } from './sms'
import { GroupApp, GroupChatApp, GroupInfoApp } from './group'
import { ContactsApp, UsageApp, AccountApp, ThemeApp, SettingsApp, AboutApp, NoteApp, StoreApp } from './tools'

export function registerBuiltinApps(): void {
  registerApp({ id: 'home', label: '主屏', icon: { d: SF.phone }, bg: '#000', component: HomeApp, hidden: true })
  registerApp({ id: 'dial', label: '电话', icon: { d: SF.phone }, bg: 'linear-gradient(160deg,#34c759,#1e9e4a)', component: DialApp })
  registerApp({ id: 'sms', label: '信息', icon: { d: SF.chat }, bg: 'linear-gradient(160deg,#5ac8fa,#0a84ff)', component: SmsApp })
  registerApp({ id: 'group', label: 'RCS', icon: { d: SF.people }, bg: 'linear-gradient(160deg,#0a84ff,#1c3faa)', component: GroupApp, onOpen: (p) => p.actions.loadGroupList() })
  registerApp({ id: 'group-chat', label: '群会话', icon: { d: SF.people }, bg: 'linear-gradient(160deg,#0a84ff,#1c3faa)', component: GroupChatApp, system: true })
  registerApp({ id: 'group-info', label: '群资料', icon: { d: SF.people }, bg: 'linear-gradient(160deg,#0a84ff,#1c3faa)', component: GroupInfoApp, system: true })
  registerApp({ id: 'note', label: '备忘录', icon: { d: SF.note }, bg: 'linear-gradient(160deg,#ffd60a,#f5a623)', component: NoteApp })
  registerApp({ id: 'contacts', label: '通讯录', icon: { d: SF.contacts }, bg: 'linear-gradient(160deg,#007aff,#1c3faa)', component: ContactsApp, onOpen: (p) => p.actions.loadContacts() })
  registerApp({ id: 'account', label: '开户', icon: { d: SF.sim }, bg: 'linear-gradient(160deg,#5e5ce6,#3a38c8)', component: AccountApp, onOpen: (p) => p.actions.loadAccount() })
  registerApp({ id: 'settings', label: '设置', icon: { d: SF.gear }, bg: 'linear-gradient(160deg,#8e8e93,#5a5a5e)', component: SettingsApp })
  registerApp({ id: 'theme', label: '主题', icon: { d: SF.palette }, bg: 'linear-gradient(160deg,#ff9f0a,#f5a623)', component: ThemeApp, system: true })
  registerApp({ id: 'usage', label: '用量', icon: { d: SF.chart }, bg: 'linear-gradient(160deg,#30d158,#1e9e4a)', component: UsageApp, system: true })
  registerApp({ id: 'about', label: '关于本机', icon: { d: SF.sim }, bg: 'linear-gradient(160deg,#0a84ff,#1c3faa)', component: AboutApp, system: true })
  registerApp({ id: 'store', label: 'dshlib', icon: { img: DSHLIB_ICON }, bg: 'linear-gradient(160deg,#0a84ff,#1c3faa)', component: StoreApp })
}
