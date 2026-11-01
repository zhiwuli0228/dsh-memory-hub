# Proposal: {change_name}

## 1. Problem

描述问题。

## 2. Goal

描述预期结果。

## 3. Scope

包含：

- ...

## 4. Out of Scope

不包含：

- ...

## 5. Affected Modules

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

## 6. Storage Impact

- `config.yaml`：
- `knowledge/<type>/<id>.md`：
- `pending/PRO-*.md`：
- `records/ledger.jsonl`：
- `records/sequences.json`：
- `history/<type>/<ID>@v<N>.md`：

## 7. Constraints

- [ ] 不引入强制性数据库。
- [ ] 默认不使用向量库。
- [ ] `memory_commit` 仍需 DSH 审批。
- [ ] 文件是真相。

## 8. Risks

- ...

## 9. Verification

- ...
