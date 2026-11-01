# Testing Guide

## 测试框架

- vitest 3.x
- Node 内置 assert / vitest 断言

## 运行

```sh
npm run test        # 全部测试
npm run test:watch  # 监听模式
```

## 测试分类

### 单元测试

- 目标：`src/search.ts`、`src/frontmatter.ts`、`src/scope.ts`、`src/ids.ts`、`src/maintenance-schedule.ts` 等纯逻辑。
- 不依赖 DSH 运行时。
- 使用临时目录。

### 集成测试

- 目标：`src/service.ts` 流程。
- 构建 mock store / ledger。
- 验证预检、引用、提案、关闭、汇总、维护。

### Host 冒烟测试

- 在真实或 mock DSH 环境中验证工具注册、预检、上下文注入。
- 需要 DSH runtime 或等效 mock。

### 面板注册测试

- 验证 `client.js` 可被 `__ModuleLoader__` 加载。
- 验证 slot 注册和 API 路由。

## 测试数据

- 使用 `fs.mkdtempSync` 创建临时目录。
- 测试结束后清理。
- 不要写真实 `~/.dsh/memory-hub`。

## 覆盖要求

- 新增核心逻辑必须覆盖。
- 失败分支必须覆盖。
- 边界条件必须覆盖。

## 当前测试

53 个测试，10 个文件。详见 `tests/`。

维护相关：

- `tests/maintenance.test.ts`：精确重复 deprecate、重复运行去重、显式标签晋升、report-only、非 admin 拒绝；
- `tests/maintenance-schedule.test.ts`：本地日期/时间、到点判断、默认配置；
- `tests/plugin.test.ts`：10 个工具注册。
