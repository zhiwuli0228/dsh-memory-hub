# Dependency Policy

## 运行时依赖

当前 `package.json` 无常规 `dependencies`。

构建产物 `dist/index.js` 仅依赖：

- Node.js 内置模块
- 打包时 inline 的少量第三方代码

## 开发依赖

- `typescript`
- `esbuild`
- `vitest`
- `zod`
- `yaml`
- `@types/node`
- React 类型（面板开发用）

## 添加新依赖的原则

- 优先使用 Node.js 内置模块。
- 避免引入网络依赖。
- 避免引入原生 C++ 模块。
- 避免引入大型框架。
- 评估 bundle 体积和运行时开销。

## 禁止

- 强制性数据库客户端（SQLite、PostgreSQL 等）。
- 默认启用向量库。
- 需要联网的 SDK。

## 版本约束

- `engines.node` 保持 `>=20`。
- 更新依赖后运行 `npm run check`。

## 安全

- 不引入未审计的依赖。
- 关注依赖许可证（MIT/BSD/Apache 优先）。
