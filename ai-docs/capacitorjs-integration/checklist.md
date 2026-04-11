# Capacitor 接入执行清单

工作区：`d:\Projects\synra-monorepo`

## 目标目录

```text
apps/
  frontend/
  mobile/
```

其中：

- `frontend` 负责 Web 构建
- `mobile` 负责 Capacitor 与原生工程

## 最短执行路径

1. 创建 `apps/mobile`

2. 给 `mobile` 安装 Capacitor 依赖

```bash
vp add --filter mobile @capacitor/core @capacitor/android @capacitor/ios
vp add --filter mobile -D @capacitor/cli
```

3. 先初始化 `mobile`

```bash
cd apps/mobile
vp exec cap init
```

建议填写：

- App name：`Synra`
- App ID：`com.synra.app`
- Web Dir：`www`

4. 确认 Capacitor 配置

- `webDir` 应为 `www`

5. 构建前端

```bash
cd d:\Projects\synra-monorepo
vp run frontend#build
```

6. 复制前端产物

目标关系应为：

```text
apps/frontend/dist -> apps/mobile/www
```

7. 添加 Android

```bash
cd apps/mobile
vp exec cap add android
```

8. 同步 Android

```bash
vp exec cap sync android
```

9. 打开 Android Studio

```bash
vp exec cap open android
```

## 验收点

- `apps/mobile` 下出现 Capacitor 配置文件
- `apps/mobile/www/index.html` 存在
- `apps/mobile/android` 目录已生成
- `vp exec cap sync android` 可以成功执行
- Android Studio 能打开该工程
- App 启动后能加载当前前端页面

## 常见问题

### 为什么不直接把 `webDir` 指向 `../frontend/dist`

可以这样做，但当前方案不采用。  
当前更推荐通过复制构建产物到 `apps/mobile/www` 来降低耦合。

### 找不到 web assets directory

优先检查：

- 是否先执行了 `vp run frontend#build`
- 是否已经把 `apps/frontend/dist` 复制到 `apps/mobile/www`
- Capacitor 配置中是否使用了 `webDir: "www"`

### Windows 下无法继续做 iOS

这是正常情况，iOS 原生构建需要 macOS 和 Xcode。
