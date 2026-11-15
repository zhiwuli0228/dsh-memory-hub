# docs/02-harness

Harness 集成层文档。**"把 Memory Hub 接到某个 agent 运行时上"怎么做、缺能力时怎么退化。**

| 文件 | 回答什么 | 何时读 |
| --- | --- | --- |
| [harness-standard.md](harness-standard.md) | 三层边界、宿主分档、降级阶梯、测试要求 | **入口**。任何宿主接入相关改动先读这篇 |
| [interception-modes.md](interception-modes.md) | **四种接入方式**（API 代理 / 生命周期钩子 / MCP / CLI）的能力、代价、选型 | 评估"这个宿主能不能自动召回"时；**先读这篇再读矩阵** |
| [host-capability-matrix.md](host-capability-matrix.md) | 每个宿主有哪些能力、验证到什么程度、新增宿主怎么做 | 评估新宿主 / 写安装文档 / 怀疑"为什么这里没生效"时 |
| [context-policy.md](context-policy.md) | 检索 vs 注入怎么分；注入什么、多少、何时不注入；三条注入通道的差别 | 改预检/注入/预算/skill 时 |
| [tool-surface.md](tool-surface.md) | 17 个工具哪些跨宿主暴露、怎么命名、写操作怎么被拦、错误语义 | 加工具 / 接 MCP / 调审批路径时 |

## 三条最容易搞错的

1. **别把"钩子"当成自动注入的唯一途径。** 大多数 CLI 支持改 `base_url`，那是一条比钩子更"在途"的通道——DSH 的 `systemPrompt.context` 本质上也是在请求里插内容，只是插在自己进程内。**Claude Code 的 `ANTHROPIC_BASE_URL` 已被第三方抓包证实承载 100% 流量。**
2. **能力要显式降级并在 `status` 里可见**，不允许静默——用户看到"面板没出现"却查不到原因是事故。
3. **审批四处落点、一个语义**：宿主原生 / 代理拦截 / 面板 / CLI，都是人做决定；模型在任何路径上都不能自批。无审批能力时 `commit` **失败关闭**，不降级为"先写进去"。

## 与其它目录的关系

- 架构分层与为什么这么分 → [ADR-0010](../01-architecture/decisions/ADR-0010-panel-transport-portability.md)
- 作用域、知识类型、source_ref 规则 → `docs/05-domain/`
- 各宿主的具体安装步骤（配 MCP、写指令文件、装钩子） → `docs/06-operations/`
