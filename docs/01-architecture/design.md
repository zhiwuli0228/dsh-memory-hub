# dsh-memory-hub Design

## 概述

DSH Memory Hub 是一个本地优先、文件即真相、人类批准写入的 DSH 插件。它把项目里值得留下的结论存成 Markdown；在每个用户回合开始时做一次确定性检索，把紧凑索引注入模型上下文；任务结束时要求回写评估，候选知识经 DSH 原生审批后才成为权威知识。

详细设计见 [DESIGN.md](../DESIGN.md)。

## 架构原则

```text
每个 core 一个 Hub，Hub 内多个作用域。
Markdown 是权威数据，JSONL 是审计账本，内存索引是可重建的派生物。
任务 = 一个用户回合；预检幂等。
自动注入只给紧凑索引；细节按需 memory_get。
权威写入必须经过 DSH 审批，模型不能自批。
```

## 总体架构

```text
┌──────────────── Adapter（DSH 专属）────────────────┐
│ lifecycle  agent/created · agent/disposed          │
│ pre-step   agent/pre-step → 任务识别 · 预检 · 上下文 │
│ turn-close agent/turn-stopping → 未评估记 deferred  │
│ tool-policy tools/pre-execute → 门禁 + 审批 ask     │
│ tools      defineTool 注册 10 个 memory_* 工具      │
│ workspace  workingDirectory + workspaceRegistry     │
│ context    agent.ctx.systemPrompt.context('memory:pack')│
├────────────────── 只调用应用服务 ──────────────────┤
│ Application：preflight · search · knowledge ·        │
│              proposal · close · consolidate ·       │
│              maintenance · status                    │
├────────────────────────────────────────────────────┤
│ Domain：knowledge（类型/状态/版本）· scope · task · │
│         citation · proposal · errors                │
├────────────────────────────────────────────────────┤
│ Storage：hub（目录/配置）· markdown-repo · ledger ·   │
│          index · atomic · lock · tokens             │
└────────────────────────────────────────────────────┘
```

依赖方向严格单向：

- `adapter → application → domain`
- `storage → domain`
- 业务层不 import DSH；替换宿主只改 Adapter。

## 关键流程

### 预检与注入

```text
用户输入
  → agent/pre-step
  → 识别新任务 (sessionId, turn)
  → 解析当前目录 → workspace → scope
  → memory_preflight 检索 accepted 知识
  → 命中则注入 compact pack
  → 模型执行
```

### 变更与门禁

```text
模型调用 mutating tool
  → tools/pre-execute
  → 检查本回合是否有有效 preflight
  → 无则按策略拒绝/允许/ask
  → memory_commit 触发 ask 审批
```

### 任务收尾

```text
回合结束 / 工具调用结束
  → memory_close_task
  → 评估：proposed / no_new_knowledge / needs_evidence / deferred
  → 写入 ledger
```

### 提交与审批

```text
memory_commit(proposal_id)
  → tools/pre-execute 拦截
  → 生成提交理由
  → DSH 人工审批
  → 批准后写入 knowledge/，旧版本归档 history/
  → 更新 ledger
```

### 夜间维护

```text
Host 每 60 秒 tick
  → policy.maintenance.enabled? 到点? 今天没跑?
  → packs = 所有 core（配置顺序）+ fallback
  → 串行 for pack: service.maintenance({ apply, max_proposals, ... })
  → 每个 core 写 reports/ 与可选 pending/
  → 写全局 records/maintenance-state.json
```

维护是插件内部定时器，不创建 DSH `schedule`，不绑定会话，不消耗模型上下文；永不 commit、删除或改写正文。多 core 顺序、失败语义和官方自动化任务的区别见 [maintenance.md](maintenance.md)。

## 主要输出

- `dist/index.js`：Host 插件构建产物。
- `client.js`：Web 面板客户端模块。
- 每个 `core_workspaces[].root`：独立记忆 Hub（`knowledge/`、`pending/`、`reports/` 等）。
- `~/.dsh/memory-hub/`：fallback 与全局配置 Hub。
- `records/ledger.jsonl`：审计账本。
