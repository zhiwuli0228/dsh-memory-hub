# Project Brief

## 项目名称

dsh-memory-hub

## 定位

dsh-memory-hub 是 DeepSeek Harness（DSH）的本地优先、文件原生长期记忆插件。它把项目里值得留下的结论（决策、约束、接口、流程、未决问题等）存成用户可读、可编辑、可备份的 Markdown 文件，在每个用户回合开始时做确定性检索，把紧凑索引注入模型上下文；任务结束时要求回写评估，候选知识经 DSH 原生审批后才成为权威知识。

## 核心价值

```text
散落的约定 + 聊天记录 + 人的记忆
        ↓
结构化知识 + 来源可追溯 + 检索注入 + 人工批准写入
```

## 主要用户

- DSH 用户
- AI 辅助开发中的架构师/开发
- 需要跨会话保持项目约束的团队
- 需要可审查记忆资产的运维/测试人员

## 主要工作流

### 工作流 1：自动预检注入

```text
用户输入
  → agent/pre-step 识别任务
  → memory_preflight 检索 accepted 知识
  → 命中则注入紧凑索引
  → 模型执行
```

### 工作流 2：引用与回写

```text
模型执行
  → memory_cite 记录实际使用
  → memory_propose 创建候选
  → memory_close_task 给出评估
  → memory_commit 触发 DSH 审批
  → 批准后写入 knowledge/
```

### 工作流 3：手动汇总

```text
管理员调用 memory_consolidate
  → 扫描项目 accepted 知识
  → 生成 global 候选 (pending/)
  → memory_commit 审批
  → 批准后加入 global 作用域
```

### 工作流 4：通过 Web 面板观察

```text
点击侧边栏「记忆中枢」
  → 总览/配置/知识/待审批/活动与策略/能力 六标签页
  → 只读展示，不替代审批
```

## 核心原则

- 文件是真相；索引可重建。
- 不使用强制性数据库；默认不使用向量库。
- 人类批准写入，模型不可自批。
- 作用域隔离（global / domain / project）。
- 失败不吞消息，降级为只读或 unavailable。
- Windows 原生路径语义。

## 非目标

- 不是 ELK / 日志分析平台。
- 不是云端知识库或多端同步服务。
- 不是向量数据库或图数据库。
- 不是无审批的自动写入系统。
- 不是 DSH 核心或 profile 状态修改工具。
