# 插件目录提交

## 先澄清“官方插件库”

DSH 官方仓库没有提供一个中央上传 API 或官方提交仓库；官方文档明确写着 **DSH ships no index source**，插件市场是任意静态托管的 format-1 JSON 索引。[Plugin indexes](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.md)

生态里事实上的公共目录是 [`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)：

- 目录数据在 `data/plugins/<owner>__<repo>.yml`，README 由脚本生成。
- 同一份目录被发布为 `dsh-plugin-catalog` npm 索引，`dsh-market` 也读取它。
- 收录通过 **PR** 完成，而不是网页上传；要求仓库声明 `dsh.bundle`、仓库至少 1 天历史、条目只加一个 YAML 文件。

`dsh.so` 是独立的社区 Web 目录，有自己的提交表单，不是 DSH 官方仓库，也不是本项目这次提交的目标。

## 本项目的提交

| 项目 | 值 |
| --- | --- |
| 上游仓库 | `awesome-dsh-plugin/awesome-dsh-plugin` |
| PR | [#11187](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11187) |
| 分支 | `zhiwuli0228:add-dsh-memory-hub` |
| 条目文件 | `data/plugins/zhiwuli0228__dsh-memory-hub.yml` |
| 分类 | `memory` |
| 包版本 | npm `dsh-memory-hub@0.1.5` |
| GitHub Release | `v0.1.5` |

条目只声明仓库 URL、名称、分类和双语描述；安装源由目录根据 npm 包自动映射，不手写 `npm:` 字段。

## 年龄门槛

上游的 `scripts/check-submission.mjs` 要求仓库至少 **1 天**历史。本仓库创建于 `2026-11-01T01:39:11Z`，因此：

- 在 `2026-11-02T01:39:11Z` 之前，PR 的 submission gate 可能因 `repo is ... hours old` 失败。
- 这是时间门槛，不是代码问题；到点后重新运行即可通过，不需要修改条目。
- 其他检查（YAML、README 生成、awesome-lint、构建）不受影响。

## 合并后

1. 上游在 `main` 上重新生成两个 README，并更新 `dsh-plugin-catalog` 索引。
2. 用户在 DSH 的 **Plugins → Discover → Index sources** 添加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 后即可搜索到；安装 `dshmarket` 的用户会直接看到。
3. 本项目 `site/index.json` 是自托管索引，和上游目录相互独立；发布新版本时仍按 [release.md](release.md) 更新 `0.1.x` 条目。
