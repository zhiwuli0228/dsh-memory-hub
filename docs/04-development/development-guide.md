# Development Guide

## 环境

- Node.js >= 20
- npm
- DSH Desktop Runtime `0.2.1-rc.5`（宿主验证用）

## 安装依赖

```sh
npm install
```

## 常用命令

```sh
npm run typecheck   # TypeScript 校验
npm run build       # 构建 dist/index.js
npm run test        # vitest 运行所有测试
npm run check       # typecheck + build + test
```

## 项目结构

```text
src/
  index.ts          # 插件入口
  runtime.ts        # DSH 适配与面板路由
  service.ts        # 业务服务
  store.ts          # Markdown/JSONL 存储
  search.ts         # 倒排索引与 BM25-lite
  frontmatter.ts    # YAML frontmatter
  config.ts         # 配置校验与热加载
  hub.ts            # Hub 目录管理
  scope.ts          # 作用域/可见性
  ledger.ts         # JSONL 账本
  lock.ts           # 单写者锁
  atomic.ts         # 原子写
  tools.ts          # 工具 schema
  types.ts          # 类型
  errors.ts         # 错误码
  ids.ts            # ID 生成
  time.ts           # 时间工具

client.js           # Web 面板客户端（无需构建）
```

## 开发工作流

1. 阅读 `docs/00-project/current-state.md`。
2. 小改动直接修改代码；大改动先写提案。
3. 补充或更新测试。
4. 运行 `npm run check`。
5. 更新 `docs/00-project/current-state.md`。

## 宿主验证

安装本地目录到 DSH Desktop profile，验证：

- 工具注册
- 自动预检
- 上下文注入
- 候选与审批
- 面板热加载

详见 `docs/COMPATIBILITY.md`。
