# ADR-0004: System-Level Memory Skill

## Status

Accepted（2026-11-01）

## Context

记忆中枢需要一套跨会话稳定的操作规范：先读预检、按需 `memory_get`、实际使用后 `memory_cite`、结束前 `memory_close_task`。把这些规则塞进每轮预检包会占用上下文，也不适合承载完整流程。

DSH 提供 Host 全局 `skills` 服务，skill 正文按需加载；但同一 layer 内按 rank 取第一个，runtime（250）会盖住 bundled（600），通用名一旦与官方 skill 重名会静默遮蔽。

## Decision

- 通过 `ctx.inject(['skills'], cb)` 获取服务，再调用 `ctx.skills.register(...)` 注册。
- skill 名使用产品自有名 `memory-hub`，不使用通用名 `memory-management`。
- `source: "runtime"`，模型和用户都可调用；`whenToUse` 覆盖历史决策、约束、API、流程、回写和“记住/记录/以后按这个来”。
- 正文覆盖：固定流程、检索技巧、作用域选择、写入审批、收尾评估、核心回填、夜间维护、反模式。
- 宿主没有 `skills` 服务时只记录 warning，不阻塞 10 个记忆工具。
- `tests/skill.test.ts` 锁定当前官方/内置 skill 名称快照，并校验名称语法与无重名。

## Consequences

- skill 出现在 catalog，但不占每轮上下文；模型可按需加载。
- 插件不依赖 Hub 是否已有知识即可提供操作规范。
- 未来官方新增同名 skill 时，测试会失败而不是静默遮蔽；需要重新命名或调整。
- 运行时 rank 仍可能盖住同名 bundled skill，因此产品自有名是长期约束。

## Alternatives Considered

- 通用名 `memory-management`：与官方 skill 重名风险高，runtime 会静默遮蔽 bundled，不可接受。
- 每轮把完整流程注入预检包：占用上下文，且预检包应只放候选索引。
- 内置 bundled skill：需要修改 DSH 核心或 Profile，不作为插件职责。
