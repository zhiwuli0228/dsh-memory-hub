# OpenSpec Usage Guide

## 何时使用 OpenSpec

- 新功能
- 架构变更
- 存储契约变更
- 检索/注入行为变更
- 工具 schema 变更
- 面板/路由变更
- 部署/安全策略变更
- 影响多个模块的改动

## 何时不需要完整 OpenSpec

- 纯 bugfix：使用轻量 bugfix 记录。
- 文档错别字：直接修改。
- 测试补充：直接提交，但更新 current-state。

## 推荐流程

### Explore

不确定时使用：

```text
/opsx:explore
```

### Propose

计划性改动使用：

```text
/opsx:propose
```

### Apply

提案通过后实施：

```text
/opsx:apply
```

### Verify

实施后验证：

```text
/opsx:verify
```

### Archive

完成后归档：

```text
/opsx:archive
```

## 标准提示前缀

```text
Follow AGENTS.md and docs/README.md.
Use the dsh-memory-hub harness standard.
Do not introduce mandatory databases.
Preserve file-system-as-source-of-truth.
Human approval is required for memory commits.
Keep the change small and testable.
Update docs/00-project/current-state.md.
```
