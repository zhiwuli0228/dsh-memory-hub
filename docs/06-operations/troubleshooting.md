# Troubleshooting

## 插件未激活

- 检查 DSH 插件管理器是否显示已应用。
- 查看 `memory_status` 是否 `initialized: true`。
- 检查 `engines.dsh` 版本兼容性。

## 工具未出现

- 确认插件已激活。
- 重启 DSH。
- 检查是否有 `dsh.bundle.patch` 冲突。

## 面板未显示

- 插件启动时会尝试清除 `clientModules` 缓存；若未生效，重启 DSH。
- 检查浏览器控制台是否有 `__ModuleLoader__` 错误。

## 预检不命中

- 确认 `knowledge/` 目录下有 `accepted` 状态文件。
- 确认当前目录匹配某个 workspace 的 `root`。
- 检查 `policy.preflight.mode` 是否为 `per-turn`。

## `memory_commit` 失败

- 确认 DSH 审批服务可用（本机若关闭审批提示会失败）。
- 确认候选存在且未被拒绝/过期。
- 检查 `memory_status` 是否只读。

## 索引错误

- 运行 `memory_status` 查看 `index.errors`。
- 检查对应文件 YAML frontmatter 是否合法。
- 检查 `id` 是否与文件名一致。

## 只读模式

可能原因：

- 配置非法
- 根目录不可写
- 文件锁被占用
- 多进程并发

处理：

1. 查看 `memory_status` 的 `readOnly` 和 `reason`。
2. 关闭其他 DSH 实例。
3. 检查目录权限。
4. 修正 `config.yaml` 后等待热加载。

## 性能问题

- 大规模知识库启动扫描慢：未来 V0.2 考虑索引落盘。
- 检索慢：检查是否命中大量大文件；可拆分知识。
