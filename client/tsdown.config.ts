import type { UserConfig } from 'tsdown'

/**
 * dsh-phone client bundle（仿照 @deepseek-ai/dsh-client-* 的 clientBundle 预设，独立于 DSH 仓库）
 *
 * 产出两个半：
 *   lib/index.js  — node 半（Loader 挂载入口）
 *   lib/client.js — client 半（window.__ModuleLoader__.load closure-factory，
 *                   Node half 经 package.json exports["./client"] 解析后以
 *                   /plugins/<id>/client.js 提供给浏览器）
 *
 * 平台模块（react/@deepseek-ai/cordis 等，浏览器 module table 提供）保持 external，
 * 其余依赖全部内联。
 */

// 平台模块（对齐 DSH packages/client/web/src/platform.ts 的 PLATFORM_MODULES）
const PLATFORM_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const client: UserConfig = {
  name: 'dsh-phone/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: false,
  external: PLATFORM_EXTERNALS,
  noExternal: (id: string) => (PLATFORM_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    // 身份/线路号/端点不再构建时注入（配置运行时化）：node 半经 tapIndex 注入
    // window.__DSH_PHONE_CONFIG__，client 半 config.ts 读全局。这里只保留真正的构建期值。
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: "@wwumit/dsh-phone", factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

const node: UserConfig = {
  name: 'dsh-phone',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: false,
}

export default [node, client]
