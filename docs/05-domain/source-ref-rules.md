# Source Ref Rules

`source_refs` 是知识的证据链。格式规则见 [KNOWLEDGE-FORMAT.md](../KNOWLEDGE-FORMAT.md)。

## 允许的前缀

| 前缀 | 形式 | 说明 |
| --- | --- | --- |
| `session:` | `session:<sessionId>#<from>-<to>` | 当前/历史会话事件区间（半开） |
| `file:` | `file:<path>` | 项目内相对路径或绝对路径；只记路径，不读内容 |
| `url:` | `url:<https-url>` | 外部链接；插件不抓取 |
| `note:` | `note:<一句话>` | 无法归类的口头依据；应尽量少用 |

## 示例

```yaml
source_refs:
  - session:6f0c1a2b#120-138
  - file:src/cache/broadcast.ts
  - url:https://example.com/rfc/xxxx
```

## 证据要求

以下类型提交时至少一条 `source_refs`：

- `decision`
- `constraint`
- `process`
- `api-catalog`
- `runtime-base`
- `playbooks`

## 质量要求

- `session:` 应尽量精确到事件区间，不要整个会话。
- `file:` 应指向具体源码位置，不要只写 `src/`。
- `url:` 应使用 HTTPS。
- `note:` 仅作为最后手段。

## 禁止

- 粘贴密钥、令牌、完整生产日志到正文。
- 使用未定义前缀。
- 提供无法验证的链接。
