/**
 * dsh-phone node half — Loader 挂载入口。
 * client 插件的运行时职责（浮窗 UI）在 client 半（src/client/index.tsx）；
 * node 半提供挂载标识，无运行时职责。
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-phone'

export function apply(ctx: Context): void {
  // client 插件：node 半空实现；浏览器半（src/client）注册浮窗到 conversation.input.overlay
  void ctx
}
