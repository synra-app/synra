# 09 Host→Plugin Vue ImportMap & Capacitor Android 加载链路

> v3 实测沉淀：插件 bundle 在 Electron 上工作良好，但在 **Capacitor Android** WebView 里 **`import ... from 'vue'`** 会失败——本文记录根因、验证过程与最终采用的修复方案，并把它沉淀为 host 的标准实现。

## 1. 现象

在桌面端把插件装好、点 Open，正常渲染。把同一个 bundle 通过 LAN 同步推到手机、用 Android Studio 启动 APK、点击插件入口，渲染层立刻抛出：

```
[plugin-loader] pluginId=<id> import failed:
TypeError: Cannot read properties of null (reading 'refs')
```

表面上像 Vue 内部 ref 绑定崩溃，但**根因不在 Vue**——崩在 `vi`（`setRef`）里只是因为 Vue 是第一个对 `import 'vue'` 的解析结果敏感的代码。真正的失败位置是动态 `import()` 那一行：在 Android WebView 上，**bare specifier（`'vue'`）没有被解析成 host 的 vendor-vue chunk**，于是模块图是空的，后续 Vue runtime 拿不到任何东西，`ref` 的内部 owner 自然为 `null`。

Electron / Web（dev server + native `import()`）从来没出过这个问题——这是**纯 Capacitor Android** 的现场。

## 2. 验证路径（5 个逐步缩窄范围的探针）

写代码前先验证"链路在哪一环断"。我们没在真机里盲改，而是直接在 `apps/frontend/src/main.ts` 里挂了 5 个 `[synra-fs-probe]` 探针，每次启动都跑，然后看 logcat：

| #   | 探针                                                                                        | 结果                                                                      |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | `fetch()` Capacitor `https://localhost/_capacitor_file_/...`                                | **HTTP 200**，`content-type: application/javascript`，169 bytes —— 链路通 |
| 2   | `import()` 同一个 URL                                                                       | **Failed to fetch dynamically imported module**                           |
| 3   | `@capacitor/filesystem` → `Blob` → `URL.createObjectURL` → `import()`                       | **Failed to fetch dynamically imported module**（同 #2）                  |
| 4   | `import('vue')`（bare specifier）                                                           | **Failed to resolve module specifier "vue"**                              |
| 5   | `fetch()` 源文本 → 用 `<script type="importmap">` 重写 `import 'vue'` → `Blob` → `import()` | **成功** —— 拿到模块，挂载 mount 正常                                     |

关键观察：

- #1 + #2 同样 URL，**`fetch()` 成功、`import()` 失败** → 不是 Capacitor WebViewAssetLoader 的问题。
- #2 + #3 同结果 → 改用 Blob URL 不能绕开。
- #4 直接证明：`<script type="importmap">` 在这个 WebView 里**对动态 `import()` 无效**。
- #5 表明：只要提前把 bare specifier 替换成**绝对 URL**，再走 Blob 就能成功。

## 3. 根因

**Chrome / Chromium 模块加载规范的行为**：

> 文档级 `<script type="importmap">` **只**会被**静态模块脚本**（`<script type="module">` 和静态 `import`）继承；**动态 `import(specifier)` 不会继承文档 importmap**（参考 [HTML Living Standard — Module specifier resolution](https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier)）。

这是 spec 的硬规则。Electron / 桌面 Web 之所以没踩到，是因为 Electron 主进程 + native `import()` 走的是 Vite dev server / bundle 的**同一份**模块解析，且 dev server 把 `vue` 直接解析成了同一模块图里的引用。Capacitor Android WebView 走 `https://localhost/_capacitor_file_/...` 的虚 URL，模块加载器是 Chromium **裸露**的版本——没有 dev server 的"包了一层"的解析，全靠 spec，结果就是 #4 的 `Failed to resolve module specifier`。

换句话说：**Electron 上"importmap 没生效也没事"是因为桌面端动态 import 走的是被宿主工具链预处理过的 specifier；Android 上宿主工具链缺席，于是 specifier 直接打到 spec 的缺省行为上**。

## 4. 修复方案

`apps/frontend/src/plugins/host/plugin-route-binder.ts` 在 Capacitor 路径上把"动态 `import()` 一个 URL"换成 3 步：

1. `fetch()` 拿到 bundle 源文本。
2. 从 `<script type="importmap">` 读出 `{"vue": "/assets/vendor-vue-igKNnIJc.js"}`，把源文本里的 `import 'vue'` / `export ... from 'vue'` 重写成绝对 URL（基于 `window.location.origin`）。
3. 用 `new Blob([rewritten], { type: 'application/javascript' })` + `URL.createObjectURL` → `import(blobUrl)`。

为什么是 blob URL 而不是直接 `import(capUrl)`：

- `import(capUrl)` 走 Chromium 模块图，**对裸 specifier 仍然无法解析**（spec 不变）。
- blob URL 也**不**继承 importmap（同样 spec 行为），但我们已经把源文本里的裸 specifier **预先替换**成了绝对 URL，所以 blob 内部不再有需要解析的裸 specifier。
- 模块加载器对 blob URL 的解析是稳定的，不依赖 host 的资产路径。

Electron / Web 路径**完全不变**——它走 `toPluginAssetUrl` + 直接 `import()`，仍然是 host 的 importmap 自然生效的那条路径。

## 5. Vendor-Vue Chunk 的两个实现细节

为了让 importmap 里写下的 `"vue"` 能精确指向 host 的 vendor-vue chunk，需要在 `apps/frontend/vite.config.ts` 里两件事：

### 5.1 `manualChunks` 把所有 Vue 模块压进一个 named chunk

```ts
manualChunks: (id) => (isVueModuleId(id) ? 'vendor-vue' : undefined)
```

`isVueModuleId` 匹配 `/node_modules/vue/`、`/node_modules/@vue/` 与 pnpm store 里的 `@vue/*` 路径——保证 `vue`、`@vue/runtime-core`、`@vue/runtime-dom` 等等都进同一 chunk。

### 5.2 closeBundle 后置追加 `createElementVNode` 别名

Rollup 在 vendor-vue chunk 的 `export { ... }` 块里只会保留实现名 `Os as createBaseVNode`，**把 `Os as createElementVNode` 这个公名 alias 给折叠掉了**。但 plugin 的 `.vue` 编译产物里 import 的是公名 `createElementVNode`，于是拿到 `undefined`，最终崩在 Vue 内部 `setRef` 的 `refs` 访问。

我们直接在 closeBundle 之后扫文件，找到 `Os as createBaseVNode`，原地补一个 `, Os as createElementVNode`：

```ts
code = code.replace(
  /(Os\s+as\s+createBaseVNode)(\s*,)/,
  (_m, head, sep) => `${head}${sep}Os as createElementVNode${sep}`
)
```

importmap 通过 `<script type="importmap">` 注入到 `dist/index.html`：

```html
<script type="importmap">
  { "vue": "/assets/vendor-vue-igKNnIJc.js" }
</script>
```

## 6. Capacitor 构建链上的"TypeScript 7 + Capacitor CLI"小坑

`cap sync android` 在解析 `apps/mobile/capacitor.config.ts` 时，Capacitor 8.4.2 走的是 TS 6 的 compiler API；仓库目前用 TS 7，那条 API 已经移除。表现是 `TypeError: Cannot read properties of undefined (reading 'CommonJS')`。

解决方案是 **compile-and-stash shim**（已写入 `apps/mobile/cap-sync.mjs` 之类一次性脚本的本地工作流，本仓库未固化该脚本）：

1. `esbuild` 把 `capacitor.config.ts` 编成 `capacitor.config.cjs`。
2. 把 `capacitor.config.ts` 临时 `mv` 成 `capacitor.config.ts.stash`。
3. 跑 `vp exec cap sync android`。
4. 还原 `capacitor.config.ts`。

要固化进仓库时，把它包成 `apps/mobile/scripts/cap-sync.mjs`，CI 与本地共用。

## 7. 验证

- **Electron**：装 starter 插件，点 Open → 渲染正常（这条路径修复前后一直工作）。
- **Capacitor Android（修复前）**：`TypeError: Cannot read properties of null (reading 'refs')`。
- **Capacitor Android（修复后）**：starter 插件 mount 成功，多 tab 渲染正常：`Platform / External / Network / Pairing / Storage` 五个 tab 切换无报错；`bridge.fetch` 拉 GitHub Zen 返回；本地 `localStorage` 写读 OK；bundle 内联的 `data/welcome.json` 在 Storage tab 正确显示。
- **vendor-vue chunk**：`grep -c "Os as createElementVNode" vendor-vue-*.js` → 1；`grep -c SYNRA_DEBUG` → 0（清理探针后）。

## 8. 结论与对其他 plugin 作者的影响

- **plugin 作者无感知**：还是 `import { defineComponent } from 'vue'`、还是打包成 `dist/synra/index.js`、还是 host 那边正常同步过来。
- **host 必须做的三件事**：
  1. `manualChunks` 把 Vue 压进 named chunk `vendor-vue`。
  2. `dist/index.html` 注入 `<script type="importmap">{"vue": "/assets/<vendor-vue-hash>.js"}</script>`。
  3. `closeBundle` 后置追加 `Os as createElementVNode` 别名（如果 plugin 编译产物用到了 `createElementVNode` 公名——`.vue` SFC 一律会用到）。
- **host 在 Capacitor 路径上的 plugin loader**：fetch 源文本 → 用 importmap 重写裸 specifier → Blob → `import()`。
