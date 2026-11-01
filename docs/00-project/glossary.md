# Glossary

## DSH / DeepSeek Harness

DeepSeek Harness，本插件的运行宿主。提供 Cordis 插件系统、工具注册、事件、审批、工作区、会话等能力。

## Hub

记忆的物理存储单元。默认位于 `~/.dsh/memory-hub`（或 `$DSH_HOME/memory-hub`）。包含 `config.yaml`、`knowledge/`、`pending/`、`history/`、`records/` 等。

## Workspace

工作区，把项目根目录映射为 `project:<id>` 作用域。字段包括 `id`、`root`、`domains`、`admin`、`enabled`，V0.1.2 起支持 `core_id` 指向核心工作区。

## Scope

知识条目的可见范围，分三类：

- `global`：跨项目通用知识。
- `domain:<id>`：领域知识。
- `project:<workspace-id>`：单个工作区项目知识。

## Knowledge

一条权威记忆，即 `knowledge/<type>/<ID>.md` 文件。状态为 `accepted`。

## Proposal

候选知识，即 `pending/PRO-*.md` 文件。状态为 `candidate`，需经 `memory_commit` 审批。

## Pending

候选目录 `pending/`。所有未提交的知识都在这里，不是默认检索目标。

## Preflight

每个用户回合第一步的确定性检索。结果写入 `records/ledger.jsonl`。

## Pack

注入模型的紧凑上下文。只包含命中条 ID、标题、摘要、作用域。

## Citation

`memory_cite` 记录模型实际使用了某条知识。与检索命中分离。

## Ledger

`records/ledger.jsonl`，追加式 JSONL 账本，记录任务、预检、引用、提交、汇总等事件。

## ADR

Architecture Decision Record。见 `docs/01-architecture/decisions/`。

## OpenSpec

本项目的规范化变更流程：explore / propose / apply / verify / archive。

## Mutating Tool

可能改变项目状态的 DSH 工具，例如 `write`、`edit`、`bash`、`pwsh` 等。门禁默认要求这些工具在本回合有有效预检。

## Core Workspace

核心工作区（V0.1.2）。多个子工作区可归属于同一个核心工作区，便于一对多管理。配置了 `root` 的 core 同时是一个独立 Hub。

## Core Hub

由 `core_workspaces[].root` 打开的独立 Hub。拥有自己的 `knowledge/`、`pending/`、`history/`、`records/`、`reports/` 和写锁。多个 core 之间互不共享 pending。

## Fallback Hub

全局配置 Hub（默认 `~/.dsh/memory-hub`）。没有匹配到任何 core 的会话使用它；夜间维护在 `all_cores: true` 时也会巡检它。

## Maintenance / 夜间维护

插件内部定时执行的确定性巡检。到点后按配置顺序串行扫描所有 core，写报告，并可选生成 pending 提案；永不自动 commit、删除或改写正文。见 [maintenance](../01-architecture/maintenance.md)。

## Maintenance State

`records/maintenance-state.json`，记录 `lastRunDate`，保证同一个本地日期只跑一次。全局一份，不是每个 core 一份。

## Official Automation Task

DSH `schedule` 服务创建的任务，出现在官方「自动化任务」栏，绑定原会话，每次触发会走一个模型回合。夜间维护**不是**这种任务。

## Client / 面板

`client.js` 注册的 Web 面板，只读展示 Hub 状态、配置、知识、待审批、活动、工具说明等。
