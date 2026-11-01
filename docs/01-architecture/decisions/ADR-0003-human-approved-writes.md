# ADR-0003: Human Approved Writes

## Status

Accepted

## Context

让模型自动写入长期记忆风险很高：可能编造来源、覆盖有效决策、或把未经验证的假设变成事实。必须有一个不可伪造的审批边界。

## Decision

- `memory_propose` 只能创建 `pending/` 候选。
- `memory_commit` 在 `tools/pre-execute` 中被拦截，触发 DSH 原生 `ask` 审批。
- 审批理由从候选文件内容同步生成，不由模型自由构造。
- 模型参数中没有可伪造的批准令牌。
- 无审批应答者时失败关闭，候选保持 pending。

## Consequences

- 权威写入必须经过人类确认。
- 审批通过后再次校验候选状态（防 TOCTOU）。
- 流程稍重，但保证了可审查性。
- 面板只读，不提供批准按钮。

## Alternatives Considered

- 模型参数中带 approval_token：可伪造，不可接受。
- 后台自动批准：违背“人类掌控”原则。
- 在面板中批准：绕过 DSH 审批服务，不可接受。
