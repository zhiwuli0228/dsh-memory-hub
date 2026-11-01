# ADR-0001: File Native Source of Truth

## Status

Accepted

## Context

DSH Memory Hub 需要持久化长期记忆。可选方案包括：

1. 外部数据库（SQLite / PostgreSQL / 向量库）。
2. DSH profile 内部存储。
3. 用户目录下的普通文件（Markdown / YAML / JSONL）。

## Decision

采用方案 3：Markdown + YAML + JSONL 作为唯一权威数据格式；索引是派生缓存，可随时重建。

## Consequences

- 用户可读、可编辑、可 git、可备份。
- 卸载插件不丢失记忆。
- 无外部依赖，单写者模型简单。
- 启动时需要扫描目录重建索引。
- 大规模下需要索引落盘或增量策略（V0.2 评估）。

## Alternatives Considered

- SQLite：增加依赖，用户不可直接审查。
- Profile 内部存储：不可备份，卸载即丢失。
- 向量库：默认引入隐私和部署成本。
