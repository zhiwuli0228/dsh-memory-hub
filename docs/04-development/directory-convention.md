# Directory Convention

## 仓库根目录

```text
dsh-memory-hub/
├── AGENTS.md           # agent 操作手册
├── README.md           # 项目简介
├── package.json        # 包元数据
├── tsconfig.json       # TypeScript 配置
├── vitest.config.ts    # 测试配置
├── esbuild.config.mjs  # 构建脚本
├── cordis.patch.yml    # Cordis bundle patch
├── client.js           # Web 面板客户端模块
├── src/                # 插件源码
├── tests/              # 测试
├── docs/               # 文档
├── locale/             # 多语言
├── icon.svg            # 图标
├── dist/               # 构建产物
└── node_modules/
```

## `src/`

- `index.ts`：入口。
- `runtime.ts`：DSH 适配层。
- `service.ts`：应用服务层。
- `store.ts` / `search.ts` / `ledger.ts` 等：存储与检索。
- `client.js` 同级，但不属于 `src/`。

## `tests/`

- 单元测试：`*.unit.test.ts`
- 集成测试：`*.integration.test.ts`
- Host 冒烟测试：`*.host.test.ts`
- 面板注册测试：`*.client.test.ts`

## `docs/`

```text
docs/
├── README.md
├── DESIGN.md
├── KNOWLEDGE-FORMAT.md
├── COMPATIBILITY.md
├── 00-project/
├── 01-architecture/
├── 02-harness/
├── 03-openspec/
├── 04-development/
├── 05-domain/
├── 06-operations/
├── 07-templates/
└── 99-archive/
```

## 新增文件位置

- 新工具：修改 `src/tools.ts`，业务逻辑放 `src/service.ts`。
- 新面板路由：修改 `src/runtime.ts`。
- 新配置项：修改 `src/config.ts` 和 `src/types.ts`。
- 新知识类型：修改 `src/types.ts` 和 `src/frontmatter.ts`。
