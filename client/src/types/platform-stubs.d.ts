/**
 * 平台模块类型 stub（dsh-phone 类型检查用）
 *
 * @deepseek-ai/* 平台模块由 DSH 宿主（deepseek-harness）在运行时提供；本插件发布后
 * 在任意宿主/CI 上都没有这些模块的源码/类型（tsconfig paths 曾指本地 harness，CI 无）。
 * 此处以宽松声明补齐，仅服务 tsc 类型检查：
 *   - 构建（tsdown）将其列为 external，运行时不解析本 stub
 *   - 真实类型语义以宿主为准；本 stub 只保证本仓库可独立通过 tsc
 *   - 用法确凿的成员给具体签名；不确定的走宽松类型（不夸大类型承诺）
 */

declare module '@deepseek-ai/cordis' {
  export interface Context {
    /** 注册副作用（node 半：config 注入 / 签名服务生命周期） */
    effect(fn: () => void | (() => void), label?: string): void
    on(event: string, fn: (...args: unknown[]) => void): void
    provide(name: string, api: unknown): void
    inject(deps: string[], cb: (scope: Context) => void): void
    /** 由 session/webServer 等注入提供；使用时按 inject 契约断言 */
    webServer?: {
      tapIndex(fn: (html: string) => string): void
      port?: number
    }
    // 允许插件经 declare module 增强（dshPhone/commandUi 等）
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface ClientContext {
    on(event: string, fn: (...args: unknown[]) => void): void
    provide(name: string, api: unknown): void
    inject(deps: string[], cb: (scope: ClientContext) => void): void
    effect(fn: () => void | (() => void), label?: string): void
    /** inject(['slots'], ...) 契约性存在（宿主 slots 插件） */
    slots: {
      inject(slot: string, fn: () => unknown): void
      register(c: unknown, component?: unknown): unknown
    }
    /** inject(['commandUi'], ...) 后存在（宿主 ui-commands 插件） */
    commandUi?: {
      register(c: {
        name: string
        description: string
        available(): boolean
        ui: {
          kind: 'popupSelect'
          options(): Promise<Array<{ id: string; label: string; detail?: string }>>
          onSelect(o: { id: string; label: string }): void
        }
      }): () => void
    }
    [key: string]: unknown
  }

  export interface SnapshotStore<T> {
    getSnapshot(): T
    subscribe(fn: () => void): () => void
    set(p: Partial<T> | ((s: T) => T)): void
  }
  export function createSnapshotStore<T>(init: T): SnapshotStore<T>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  // 仅类型增强用途（index.tsx: import type {}）——无运行时使用
}
