# 批量萃取模板

把多年业务资料分批萃取成候选知识。复制本模板到**工作区**（不是 Hub 目录），按批次填写。

## 1. 批次清单 `batch.yaml`

```yaml
id: 2021-customer-a
title: 2021 客户 A 实施
source_dir: ./sources/2021-customer-a
# 作用域：默认 project:<当前工作区>；确认有跨项目共性再上推 core。
scope: project:customer-a
domain: crm
chunk_size: 15          # 文件数；或按字数 ~20000
status: draft           # draft | extracted | reviewed | distilled | archived
created_at: 2026-11-08
notes: |
  来源是 Obsidian 导出，文件名含日期；先做时间线，再抽决策与坑。
```

## 2. 单个 chunk 的提示词骨架

```text
你在做「批量萃取」，不是写摘要。

输入：batch.yaml 里的 source_dir 中第 <N> 个 chunk，共 <M> 个文件：
<文件列表>

步骤：
1. 先列出「这批材料能回答哪些以后会再问的问题」（3–8 条）。
2. 只抽可复用的判断，每条对应一个问题：
   - 决策：选了什么、为什么、放弃了什么；
   - 约束：边界、禁止项、触发条件；
   - 踩坑：现象、原因、修法；
   - 流程：可复制的步骤与检查点。
3. 每条用 memory_propose：
   - scope 按 batch.yaml；
   - source_refs 用 file:<相对路径>（可带 #Lx）；
   - tags 带 batch:<id> 和 topic:<主题>；
   - title ≤ 200 字、summary ≤ 240 字；正文写「结论 / 证据 / 适用与限制」。
4. 写之前先 memory_search 或 memory_duplicates 查重；与已有条目重复就跳过或准备 merge 提案。
5. 不要 memory_commit；不要逐段 propose；不要为凑数拆条。
6. 收尾报告：本 chunk 产出 N 条、覆盖哪些问题、哪些材料判断为无萃取价值。

目标：本 chunk 5–15 条。若超过 20 条，说明切得太碎，合并同义项。
```

## 3. 批次进度记录 `batch-progress.md`

| chunk | 文件数 | 候选数 | 状态 | 备注 |
| --- | ---: | ---: | --- | --- |
| 1 | 15 | 9 | done | 含 2 条与历史重复，已跳过 |
| 2 | 15 | — | pending | |

## 4. 收尾检查

- [ ] 所有 chunk 跑完，`status: extracted`
- [ ] 跑一次 `memory_duplicates`，近重复已合并或标记
- [ ] 面板按 `tags:batch:<id>` 过滤，批量批准/拒绝，`status: reviewed`
- [ ] 共性主题已上推父核心（按主题抽样，不逐条），`status: distilled`
- [ ] 来源目录可移走，`status: archived`

## 5. 反模式

- 把整篇文档塞进 `body`（摘要是文档级，知识是判断级）。
- 一个会话读几百份文档（上下文与产出都会崩）。
- 直接 `memory_commit` 或让模型自批。
- 全部写成 `global`（以后无法隔离到客户/项目）。
- 按段落逐条 propose（候选量爆炸，审批无法完成）。
