# ADR-0002: Scope Isolation

## Status

Accepted

## Context

知识需要分层可见：有些适用于所有项目，有些只适用于特定项目，还有些只适用于特定领域。同时必须防止模型读取不可见作用域的知识。

## Decision

定义三种作用域：

- `global`：跨项目通用。
- `domain:<id>`：领域级，可被多个 workspace 共享。
- `project:<workspace-id>`：单个工作区专属。

工作区通过 `root` 路径最长前缀匹配映射到 `project:<id>`。`memory_get` 和 `memory_search` 只能返回当前会话可见集合内的条目。

## Consequences

- 项目知识不会自动泄漏到 global。
- `memory_consolidate` 是项目知识晋升 global 的唯一路径。
- 路径匹配需要规范化、真实化、大小写归一。
- 模型无法通过参数扩大可见范围。

## Alternatives Considered

- 目录层级隔离：与 git 工作区耦合，不够灵活。
- 自动从项目目录推断：增加扫描和误匹配风险。
