# Proposal Rule

提案必须说明为什么需要这个改动，以及改动什么。

## 必要章节

### 1. Problem

描述用户可见的问题或工程问题。

### 2. Goal

描述预期结果。

### 3. Scope

列出包含的内容。

### 4. Out of Scope

明确排除的内容。

### 5. Affected Modules

从以下模块中选择：

- runtime
- service
- store
- search
- frontmatter
- ledger
- config
- hub
- scope
- lock
- tools
- client.js
- docs

### 6. Storage Impact

说明是否影响：

- `config.yaml`
- `knowledge/<type>/<id>.md`
- `pending/PRO-*.md`
- `records/ledger.jsonl`
- `records/sequences.json`
- `history/<type>/<ID>@v<N>.md`

### 7. Constraints

确认：

- 不引入强制性数据库。
- 默认不使用向量库。
- `memory_commit` 仍需 DSH 审批。
- 文件是真相。

### 8. Risks

列出实施风险。

### 9. Verification

描述如何验证（测试、宿主冒烟、面板验证等）。

## 提案质量门槛

- 小到可以一次聚焦完成。
- 有明确的验收标准。
- 包含测试计划。
