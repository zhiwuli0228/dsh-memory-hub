# Current State

本文件是项目连续性快照。**每次完成改动后都要更新**。

## 当前阶段

**远端同步引擎与删除传播已落地（2026-11-14，M1 实现完成）**：`src/remote/sync.ts` 的 `RemoteSync` 引擎接管 pull/push/forget 三条方向，与 provider 无关（只依赖 `RemoteAdapter` 契约）。状态按 provider 分区到 `records/remote/<providerId>/{state.json,outbox.jsonl,orphans.jsonl}`——不再与旧腾讯桥的 `records/tencent-state.json` 混放。关键语义全部有测试锁定（`tests/remote-sync.test.ts` 18 例）：

- **pull**：远端 → 本地 pending 候选，绝不 commit；propose 失败不推进游标（下次重试不丢来源）；`externalId` 去重；`resetRequired` 时全量重拉。
- **push**：投影过滤（`scopes` 空 = 什么都不分发，`domain:*` 尾部通配；legacy desugar 用 `['*']` 保持 V0.7.x 全量推的行为）；失败进 outbox，幂等键 `<providerId>:push:<id>:<version>` 重放；`externalIds` 台账记录 knowledgeId → 远端 id，forget 靠它定位。
- **forget**：默认只传播 `deprecate`（`on_merge` 默认 false）；只对**已镜像过**的条目生效（没 push 过的不产生幽灵请求）；`max_per_run`（0 = 不限）截断、超出部分下次继续；`dry_run` 零副作用预演（不重放、不写状态、不联网）；无 `write.delete` 的 provider（腾讯）→ 追加"已废弃"标记 + 记孤儿（`cause: unsupported`），**绝不假装成功**；`unreachable` 留 outbox 重试，其余失败转孤儿（孤儿台账即"待人审"队列）；定向 `knowledge_id` 忘却绕过开关但从未镜像的条目如实报 `skipped`。
- **工具**：`memory_remote_sync`（pull+push，**forget 不在默认方向里**）、`memory_remote_forget`（传播 / 定向 / dry-run）；`memory_remote_status` 现在带各 provider 的 outbox/孤儿快照（`remoteStatusDetailed`）。20 个工具。
- **面板「远端」卡片（M1.5，2026-11-14）**：配置页新增远端记忆卡片——每 provider 一块：角色勾选（feed/mirror/authority/index，authority 选中时显示作用域限制提示）、两个 forget 开关（on_deprecate 默认开、on_merge 默认关，悬浮提示解释为什么默认关）、`max_per_run` 输入（0 = 不限，橙色警示文案）、只读计数行（待传播 / 孤儿 / 待重放 / 已镜像 / 上次 pull·push 时间 / lastError）。计数来自 `config()` 回显的 `remote.providers[].sync`（`remoteStatus()` 用同步快照读小文件并算 `pendingForget`，overview 轮询同源，**没有新增读端点**）。保存 = 整段替换 `remote` patch（复用 updateConfig，服务端回显完整 provider 段包括连接参数的 env 变量名，保存不会丢配置）；账本记 `config.remote.updated`；保存后 provider 立即重建。面板仍然只写配置，不执行同步、不碰知识正文。
- **面板写路径**：`updateConfig` patch 扩展为 `{core_workspaces, workspaces, remote}`（整段替换，与 workspaces 同语义），写账本 `config.remote.updated`；`config()` 回显 remote 段。面板「远端」卡片（M1.5）可以直接用这两个接口，不新增端点。
- **修掉一个真 bug**：候选列表在重放 outbox 之前计算会导致同一条被删两次（重放成功进 `forgottenIds`，但过期候选仍会再删）；已把候选计算移到重放之后，测试锁定。
- **审计**：`remote.pull` / `remote.push` / `remote.forget` 三个可辨识账本事件（不是单一 `remote.sync`——逐方向可直接 grep）；旧 `tencent.pull` / `tencent.push` 原样保留。

**远端 provider 抽象已落地（2026-11-14，第一阶段实现完成）**：把"腾讯桥"从硬编码单厂商通道抽成**按角色挂载的 provider 层**，这一刀已进主链路并通过 `npm run check`（27 文件 / 238 测试）。新增 `src/remote/types.ts`（`RemoteRole` 四角色 `feed`/`mirror`/`authority`/`index`、11 项 `RemoteCapability`、`RemoteAdapter` 契约、**五种**错误语义）、`src/remote/tencent-adapter.ts`（把既有 `TencentClient` 包成 adapter，**只做翻译**，不判断"该不该同步"）、`src/remote/registry.ts`（配置归一化 + legacy desugar + 构造期角色校验 + `AdapterFactory` 注册表）。要点：

- **能力即可选性**：`RemoteAdapter` 的方法全是可选的——没实现 `delete` 就等于没有 `write.delete`。腾讯 adapter 明确**不声明** `write.delete`（v3 数据面无删除/作废端点），所以对腾讯的 `forget` 会返回 `unsupported` 而**不是静默成功**。`requireCapability()` / `requireMethod()` 把"声明了但没实现"也当 `unsupported`，避免 `undefined is not a function`。
- **错误从四种加到五种**：实现时发现"HTTP 200 但业务码非 0"既不是不可达也不是冲突，硬塞进四态会让 outbox 无限重试一个永不成功的请求，故补 `invalid`；`RemoteError.retryable` 只对 `unreachable` 为真。
- **构造失败降级为诊断而非抛错**：缺密钥、未知 `kind` 只让**该 provider** 不可用（`ready:false` + `error`），其余 provider 照常工作，`memory_status.remote` 与面板可见原因。这是"降级不允许静默"的具体落点。
- **配置热重建**：`updateConfig` 成功后 `resetRemoteRegistry()` 并丢弃 `tencentBridge`，否则改完角色要重启才生效。
- **新工具** `memory_remote_status`（只读；`probe:true` 才联网体检），`memory_status` 新增 `remote` 切片；17 → 18 个工具。
- **修掉一个会打断现存用户的回归**：`configSchema` 给 `remote.providers` 的默认值是 `[]`，最初把"空数组"当成"显式配置"，导致**所有旧 `tencent:` 配置被静默忽略**。现改为"非空才算显式"，并由 `tests/remote.test.ts` + `tests/remote-service.test.ts` 双向守着（旧配置 `enabled:true` 仍走 desugar 出 `roles:[feed,mirror]`、`forget:{on_deprecate:true,on_merge:false,max_per_run:100}`）。
- **补了默认配置模板的测试**：`DEFAULT_CONFIG_YAML` 之前零覆盖，而它会被写进每个新用户 Hub 根。新增 `tests/config-default.test.ts`（YAML 可解析、可过 schema、默认关闭但仍 desugar、模板本身角色校验通过）——起因是引入 remote 段时我在模板里用了反引号把 TS 模板字符串提前终止了。

第一阶段**尚未做**（见 [proposal-remote-providers.md](../03-openspec/proposal-remote-providers.md) §5.4–5.7）：同步引擎（`records/remote/<providerId>/state.json` + `outbox.jsonl`）、`forget` 传播与孤儿台账、`memory_remote_sync` / `memory_remote_forget` 工具、`http-json` 声明式适配器、组合检索、面板「远端」卡片。当前 `forget.on_deprecate` / `on_merge` / `max_per_run` 已能配置并在 `remoteStatus()` 里报告，但**传播动作还没有执行者**——这是下一步。

**代理路线成本实测（2026-11-14，第三版修正）**：按官方一手文档核对"改 `base_url` 起本地代理"这条路，得到三条会改变方案的结论。(1) **配置本身不难**——只设 `ANTHROPIC_BASE_URL` 一个变量、不设网关凭证，订阅登录仍是有效凭证（官方原文），我们只需逐字转发 `Authorization` 与 `anthropic-beta`。(2) **但注入有正确性风险**：API 的 preserved thinking 校验会因 `system`/`tools`/更早 `messages` 被改写而报 400 `bound to a different conversation`，官方明确"网关改写这些内容会自己造成这个拒绝"——**因此上一版"注入到本轮 user 消息前缀块"的建议是错的**，已改为"只落在最后一条 user 消息内容之内，或完全不动请求体"，并把该条列入未验证清单。(3) **企业统一认证场景是结构性阻断，不是复杂**：MDM 下发 `allowedProviders: ["customEndpoint"]` 后，Claude Code 拒绝任何指向其他地址的会话，**包括开发者自己的本地代理**；另有 `forceLoginMethod` 与凭证变量不可共存、mTLS、TLS 检查、Bedrock/Vertex/Foundry 三种非 Anthropic 报文格式。据此把代理从"可选加速器"降级为"个人极客场景的可选实验功能"，企业场景的正确位置是**公司网关里的中间件**而非本机代理。另记录 8 条真实代价（桌面 App 不读该变量、Remote Control 与语音不可用、`/fast` 直连检查失败、`/feedback` 只落本地、HIPAA 不适用、云端会话不适用、多一个常驻故障点）。详见 [interception-modes.md](../02-harness/interception-modes.md) §1。

**harness 文档修正（2026-11-14，第二版）**：新增 [interception-modes.md](../02-harness/interception-modes.md)，纠正第一版的**漏判**——原来只把"钩子"和"MCP"当成接入路径，漏了**传输层**：绝大多数 CLI 支持改 `base_url`，可以在本地起透明代理直接注入请求体，这是比钩子更"DSH 式"的入口（DSH 的 `systemPrompt.context` 本质也是在请求里插内容，只是插在自己进程内）。据此把 `host-capability-matrix.md` **重判档位**：Claude Code 从 T1 升到 **T3***（`UserPromptSubmit` 每轮触发可追加上下文、`PermissionRequest`/`PermissionDenied` 可做审批、`ANTHROPIC_BASE_URL` 已被第三方抓包证实承载 100% 流量），opencode 也升到 **T3***（`chat.message` 注入、`permission.ask` 直接定 allow/deny/ask、`tool.execute.after` 捕获）；Codex/Cline/Cursor/Zed 仍为 T1 但标注 `T1+`（有 `proxy` 可达 T3）。矩阵新增 `proxy` 列与 `T1+` 档。`harness-standard.md` 的审批落点从三种扩到四种，加"代理注入可失效必须透传"测试要求；`context-policy.md` §3 重写为三条注入通道（代理 / 轮前钩子 / 指令文件），并加代理注入三条铁律（失败透传、默认不落盘、不改 system 头部以免每轮 cache miss）。

**harness 文档回写（2026-11-14）**：`docs/02-harness/` 按多宿主方向重写。新增 [README.md](../02-harness/README.md)（入口）、[host-capability-matrix.md](../02-harness/host-capability-matrix.md)（8 个宿主 × 10 项能力，带 `实测/文档/待核` 三级验证状态）、[tool-surface.md](../02-harness/tool-surface.md)（17 个原生工具 → MCP 首版 8 个、命名规则、写操作三道审批落点、四种统一错误语义）；重写 [harness-standard.md](../02-harness/harness-standard.md)（三层边界 + T0–T3 分档 + 六格降级阶梯 + core 纯净性静态测试要求）；重写 [context-policy.md](../02-harness/context-policy.md)（拆成"检索策略跨宿主一致 / 注入时机逐宿主不同"，新增非 DSH 路径与预算表，保留 skill 命名冲突审计）。关键口径：**不在非 DSH 宿主上承诺自动注入**；缺能力必须显式降级并在 `status` 可见；无审批能力时 `commit` 失败关闭。

**文档约束改版（2026-11-14）**：`AGENTS.md` 重写——原版本假设"单宿主 + 面板只读 + 单进程"，三个前提都已不成立。新版本只保留**四条不变量**（文件是权威 / 人批准才进 `knowledge/` / 纯文本可迁移 / 默认零网络）与**当前方向**（多宿主三层单向依赖、多远端按角色、多入口共享一份 API），撤下的操作性约束（面板默认只读、只允许回环、禁用向量库、禁止联网依赖）以表格形式归档并附撤下原因，需要时可逐条恢复。同步改了口径重复的 `docs/README.md`（"硬规则"→"不变量 + 方向性约定"）、`docs/02-harness/harness-standard.md`、`docs/00-project/project-brief.md`、本文件「当前约束」段。

**面板可移植性（2026-11-14，ADR 阶段，未实现）**：[ADR-0010](../01-architecture/decisions/ADR-0010-panel-transport-portability.md) 决定面板不绑死 DSH——`handleHttp` 已是 Node `http` 形态（`writeHead`/`end`/`socket.remoteAddress`/`on('data')`），锁死的只有"登记"（`ctx.inject(['webServer'])` 15 行）和"渲染"（React client module）。方案：core 零宿主依赖 → transport（MCP stdio / HTTP router / CLI）→ host glue 三层单向依赖；HTTP router 抽成唯一实现、双挂载（DSH `webServer.register` 零配置默认 / `memory-hub serve` 绑 127.0.0.1）；**MCP stdio 优先级高于 UI**（没有工具面，CC/opencode 里一条记忆都读不到）；`serve` 默认不启动、固定 7331 可配 0、实际地址写 `records/server.json`；安全补 Host 头白名单（防 DNS rebinding）+ 本地 Origin + 写操作 `x-dmh-token`（`records/server-token` 0600）；`serve` 是普通写者，按 ADR-0009 租约互斥、不享受特权。

**远端接入抽象（2026-11-14，提案阶段，未实现）**：[proposal-remote-providers.md](../03-openspec/proposal-remote-providers.md) 提出把"腾讯桥"从硬编码通道抽成"一条本地权威 + 若干按角色挂载的远端 provider"（`feed` / `mirror` / `authority` / `index`），接口显式带 `scope` 与 `forget`、每个 provider 声明 `capabilities()`、删除/deprecate 跨边界传播并把"删不掉"记为孤儿、`http-json` 声明式适配器让第三方服务不写代码即可接。调研见 [remote-provider-patterns-2026.md](../05-domain/remote-provider-patterns-2026.md)（知乎/CSDN/腾讯云社区 + agent-memory-atlas 宿主契约清点 + backlog-mcp ADR 0092.5）。现有 `tencent:` 配置与 3 个 `memory_tencent_*` 工具保持兼容（desugar 成 `remote.providers[0]`）。**删除传播策略已定（2026-11-14）**：默认只把 `deprecate` 传播到远端；`merge` 的被合并项**默认不传播**，由 `mirror.forget.on_merge`（默认 `false`，按 provider 单独开）控制。**单次上限不写死**：`forget.max_per_run`（默认 100，`0` = 不限）的权威位置是面板「配置」页的「远端」卡片，与「待传播 N 条 / 孤儿 / 上次同步」计数并排；面板只配置、不提供同步或删除按钮（传播仍由 `memory_remote_sync` / `memory_remote_forget` 触发），配置变更入账本 `config.remote.updated`。

**V0.7.2 三阶段工程（2026-11-13，工作进行中，未发版）**：按 [proposal-tencent-bridge.md](../03-openspec/proposal-tencent-bridge.md) 落地"借船但不弃锚"——本地文件始终权威，腾讯 Agent Memory 只做增强通道与候选来源。

- **阶段二（腾讯桥完成）**：新增 `src/tencent-client.ts`（腾讯 v3 API 封装：atomic/query|search、scenario/ls|read、conversation/add|query，全部带超时与结构化降级）与 `src/tencent-sync.ts`（pull：L1/L2 → 本地 pending 候选，**绝不自动 commit**；push：accepted → 腾讯 conversation 通道；outbox 离线队列 + `pushedIds` 幂等去重；`records/tencent-state.json` 游标）。新增 3 个工具 `memory_tencent_status` / `memory_tencent_pull` / `memory_tencent_push`，全部要求 `tencent.enabled`，关闭时零网络请求。
- **阶段三（5 项增强完成）**：① 注入结构优化——`buildPack` 增加"可主动查记忆"提示行（`policy.preflight.hint_tools`，默认开）；② 自动场景归纳——`src/scenario.ts` 按 `topic:`/`domain:`/`batch:` tag（回退 knowledge 类型）聚合 accepted 知识生成 `scenario/<topic>.md` 派生索引（可删可重建、绝不碰 `knowledge/`），工具 `memory_scenario_rebuild`/`memory_scenario_list`；③ 可选分层——`layers.enabled`（默认关）+ `status.layers.suggestion`（≥`suggest_at_entries` 才提示）；④ 多租户——腾讯桥的 team/agent/user/task 隔离字段入 config，workspace 仍为本地团队边界；⑤ 远程实时——`tencent.sync_interval_min` 心跳（只 ping 诊断，pull/push 保持手动触发，符合"腾讯无推送"现实）。
- **验证**：`npm run check` 全绿（24 文件 / 197 测试）；`tests/tencent-client.test.ts`（7）、`tests/tencent-sync.test.ts`（7，含增量游标与逐条诊断）、`tests/scenario.test.ts`（6）、`tests/credentials.test.ts`（5）+ service/plugin 新增断言；真实腾讯栈**双向端到端验证**通过——pull 方向：`scripts/verify-tencent-bridge.ts`（真实 MemoryService + ssh 端口转发）`tencentPull` 返回 `pulled:4/proposed:4`，生成 4 个 `pending/PRO-*.md` 候选（含 L2 场景条目）、写 `tencent-state.json` 游标与账本 `tencent.pull`；push 方向：`conversation/add` 写入 session `dsh-memory-hub-verify` 并可读回，腾讯自动抽成新 L1（total 5→6）。
- **真实环境 `memory_tencent_pull`（2026-11-14）**：宿主 profile（`include:dsh-memory-hub` link 软链）热重载新 dist 后，在**真实 hub**（`E:\009workspace\dsh\dsh-plugin-dev`，45 条 accepted）跑通 `memory_tencent_pull` → `pulled:7 / proposed:7 / skipped:0`，生成 7 个 pending 候选（PRO-000063~069：6 条 L1 atomic + 1 条 L2 场景「运维操作-进程与抓包规范」），账本含 `task.created`（自动开的同步任务）+ `proposal.created`×7 + `tencent.pull`，`records/tencent-state.json` 写入 `lastPullAt` 与 `pulledIds` 增量游标。过程中修掉三个只有实机才暴露的问题：① **apiKeyEnv 解析**——宿主 `process.env` 里没有 `PROXY_USER_KEY`（DSH 的 key 在 `~/.dsh/.credentials.yaml` 的 refs），新增 `src/credentials.ts` 让 apiKeyEnv 先查 process.env、再回退 DSH credential store（与 DSH 内置服务同语义，token 仍不落盘 config）；② **pull 依赖会话任务**——插件热重载清空内存会话后 `propose` 报 `[NO_TASK]`，`tencentPull` 现在无活跃任务时自动开内部同步任务（`ensureSyncTask`，账本记 `task.created`，定时/后台调用不再失败）；③ **同进程写锁自我阻塞**——热重载重建 Hub 实例后，第二个实例 acquire `.writer.lock` 被本进程旧实例的活跃锁挡住（`[READ_ONLY] another writer holds ... pid 297104`），`WriterLock` 增加进程级共享（`sharedFor`：同一进程内同一 root 复用已持有锁，跨进程仍按租约互斥），插件热重载不再"自己锁自己"。同时 pull 改为**真增量**：`pulledIds` 记录已处理来源（atomic id / `scenario:<path>`，有界 2000），重复调用只拉腾讯新增；`lastError` 不再被成功路径覆盖，逐条失败会写进诊断。

V0.7.1 已发布：**写锁租约 + fencing，只读状态可自愈**——修复两个会被用户感知为“插件坏了”的问题：(1) 挂死/冻结的写者（进程还在、线程已死）会让某个 hub 根**永久只读**；(2) 只读状态是 Hub 打开时的**一次性缓存**，pid 已消失、锁文件已删除后 `memory_status` 与面板仍显示只读，只能重启。现在写锁是租约（心跳 15s、租约 `lock_stale_ms`）：pid 确定不存在（`ESRCH`）立即回收、探不到死活（Windows 常见 `EPERM`）约 60 秒回收、心跳超租约自动回收，旧写者按 `token` 降级为只读；`Hub.revalidateLock()` 在 `memory_status`、面板 `/api/overview`/`/api/config` 与 60 秒巡检中重新推导只读状态，面板自身每 30 秒轮询只读切片。**不再需要手动删除 `.writer.lock`。** 详见 [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)。npm 包 `dsh-memory-hub@0.7.1`（`latest`）与 GitHub Release `v0.7.1` 已发布（run `43392559044`，publishTimestamp `1794529659`，SLSA provenance 已签名）。

V0.7.0 已发布：**时效、去重合并、回顾萃取与可读目录**——`valid_from` / `expires_at` / `last_verified` 与确定性降权、`memory_duplicates` + `merge`、`memory_reflect`（`digest` 与原文 `search`）、引用驱动的 aging、写入风险标记、派生 SQLite 索引，以及每个 Hub 根目录自动生成的 `README.md`（逐条说明文件夹职责、`assets` 含义与写入路径）。npm 包 `dsh-memory-hub@0.7.0` 与 GitHub Release `v0.7.0` 已发布（run `42492469612`，publishTimestamp `1794150080`，SLSA provenance 已验证）。

V0.6.0 已发布：**每个工作区的定时蒸馏**——面板「配置」页可为核心/子工作区启用每日蒸馏，指定时间、投递目标（新建会话或指定会话）与候选上限；插件把配置对齐为 Host `schedule` 任务，到点在对应工作区开始蒸馏。投递到已有会话时，面板从 Host `sessionController` 读取本机会话列表做候选（可下拉选择，也可手填），不再要求用户自己去找会话 ID。蒸馏只创建上级（或 global）候选，仍需人工在「待审批」批准。V0.4.0 的面板批量审核、`panel:human` 账本与回环安全校验保持不变。

在真实 Host（0.2.2-rc.1，隔离 profile）上验证时修掉两个只有实机才暴露的问题：Host 的 `daily.time` 必须是 `HH:mm:ss`（v0.5.1 内部把 `HH:mm` 规范化后注册）；`session-controller` 可能晚于 `schedule` 就绪，首次注册会被拒（v0.5.2 对可自愈错误做 5 次退避重试，并在 `config()` 中返回 `distill`，面板保存后不会显示成未配置）。v0.5.3 把蒸馏设置从“每个工作区一张卡 + 换行内联表单”改成整宽对齐表（工作区/启用/时间/目标/会话/上限/状态），带逐行状态与底部汇总、错误列表，窄屏自动堆叠。v0.6.0 新增只读的 `/dsh-memory-hub/api/sessions`：只返回 id、cwd、标题、更新时间与空会话标记，排除委派会话，服务缺失或超时则返回 `unavailable` 让面板退回手填。

当前工作树为 **V0.7.1（已发布）**：在 V0.7.0 之上把写锁改为租约 + fencing，并让只读状态可重新推导。升级免卸载方案见 [docs/06-operations/upgrade-guide.md](../06-operations/upgrade-guide.md)。

**V0.7.1 写锁改动（2026-11-13）**：写锁从“永久所有权标记”改为**租约 + fencing token**（[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)）。挂死/冻结的 DSH 进程不再让该根永久只读：pid 确定不存在（`ESRCH`）立即回收、探不到死活（Windows 常见 `EPERM`）约 60 秒回收、心跳超 `storage.lock_stale_ms` 自动回收，旧写者按 `token` 降级为只读；被降级的根在对方退出后由下一次读取/写入自动恢复，不必重启插件或手删 `.writer.lock`。同时修掉**内存缓存**问题：`readOnly` 之前是打开时的一次性判断，锁文件消失/被回收后进程内仍报只读；现在 `Hub.revalidateLock()` 在 `memory_status`、面板（`/api/overview`、`/api/config`）与 60s 巡检里重新观测锁文件并修正标志，面板自身每 30s 轮询只读切片。锁文件升到 `v: 2`（新增 `token`），v1 锁仍可读；Hub 根 `README.md` 模板升到 `hub-readme 3`（新增 `.writer.lock` 说明）。**从 0.7.0 升级时先停旧进程**（0.7.0 的写入口没有 fencing 复核）。

V0.7 的三项 P0 提案（时效字段 → 去重合并 → 回顾式萃取）**均已完成实现、测试并随 `v0.7.0` 发布**：时效字段（`valid_from` / `expires_at` / `last_verified`、派生 `fresh/aging/stale/scheduled`、确定性降权、预检时效门、面板标签）；去重合并（只读 `memory_duplicates`、`operation: "merge"` + `merged_ids`、`superseded_by` 反向指针、`knowledge.merged` 账本、面板 diff）；回顾式萃取（`memory_reflect` digest、按工作区定时回顾、`records/reflect-state.json` 去重水位）。`format` 仍为 1，老文件零迁移。

## 已实现

- [x] **远端 provider 抽象（2026-11-14，第一阶段）**：`src/remote/types.ts`（四角色 + 11 项能力 + `RemoteAdapter` 契约 + 五种错误语义）、`src/remote/tencent-adapter.ts`（腾讯 adapter，显式不声明 `write.delete`）、`src/remote/registry.ts`（归一化 + legacy desugar + 角色校验 + `AdapterFactory`）；`config.remote` schema；`MemoryService.remoteStatus()` / `remoteProbe()`；工具 `memory_remote_status`；`memory_status.remote` 切片；配置热重建；`tests/remote.test.ts`(31) + `tests/remote-service.test.ts`(10) + `tests/config-default.test.ts`(4)
- [x] **远端同步引擎与删除传播（2026-11-14，M1）**：`src/remote/sync.ts`（`RemoteSync`：pull 游标去重 / push 投影 + outbox 重放 + externalIds 台账 / forget 开关 + max_per_run + 孤儿台账 + dry-run 零副作用）；按 provider 分区状态 `records/remote/<id>/`；工具 `memory_remote_sync` / `memory_remote_forget`；`updateConfig` 扩展 `remote` patch + `config.remote.updated` 账本；`tests/remote-sync.test.ts`(18)
- [x] **面板「远端」卡片（2026-11-14，M1.5）**：`client.js` 配置页远端记忆卡片（角色勾选 / forget 开关 / max_per_run 不限警示 / 待传播·孤儿·待重放·已镜像计数）；数据源 `config().remote`（`remoteStatus()` 增加逐 provider `sync` 快照与完整 provider 段回显）；保存走既有 `POST /api/config` 整段替换，不新增端点；`tests/remote-service.test.ts`(12)
- [x] **http-json 声明式适配器（2026-11-15，M2）**：`src/remote/http-json-adapter.ts`——端点与字段映射全在配置里，第三方服务**不写代码**即可接入；`{{var}}` 插值（整字符串保留类型）+ `$.a.b` 路径映射（无表达式求值，配置不能变成代码执行面）；能力显式声明、声明了没配端点 = 运行时 `unsupported`；密钥只走 `token_env`（env / credential store）；HTTP 状态归入五类错误词汇（仅网络类可重试）；M2 范围 = list / search / append（upsert/delete/changesSince 见提案 §11.3.4）；本地 node:http 假想服务端到端验证（push 镜像 + pull 候选 + 幂等）；`tests/remote-http-json.test.ts`(22)
- [x] **serve 默认端口 Host 白名单死锁修复（2026-11-15，post-0.8.0 hotfix 候选）**：用户演示 serve 默认端口 7331 时全请求 421——`hostMode.port` 硬编码 0，重建分支只在 `boundPort !== port`（临时端口）生效，显式/默认端口路径白名单对准 port 0 → 一切请求被 421 拒绝。**根因**：测试全走 `--port 0`（boundPort≠port 必重建），默认端口路径零覆盖。修复：listen 后**无条件**用 `boundPort` 重建 router；补默认端口路径回归测试（真实空闲端口起 serve → GET /api/overview 200），338 全绿。0.8.1 候选内容：本修复 + engines.dsh 双区间（KNO-000009）。演示面板跑在 `http://127.0.0.1:7331`（dsh-plugin-dev hub，只读模式）
- [x] **v0.8.0 已发布（2026-11-15）**：`release: v0.8.0` commit cf713ff（71 文件，M0–M5 + V0.8 S1–S6 全量）→ tag `v0.8.0` → GitHub Actions 全绿（Verify tag / check / Pack / Publish / Create Release）；registry 传播 <1 分钟；**provenance SLSA v1**（Trusted Publisher）+ Release asset `dsh-memory-hub-0.8.0.tgz`；site/index.json 已插 0.8.0（publishTimestamp 1794709785）+ jsDelivr commit-pinned（cfbed73）验证。**发布前纠错**：恢复上轮误删的 `scripts/bench-*.ts`（git restore），仓库根本地 `config.yaml` 加 .gitignore。**遗留待办**：engines.dsh 仍是单区间 `>=0.2.1-rc.5`——按 KNO-000009 官方约定应为双区间 `>=0.2.1-rc.5 <0.3.0-0 || >=0.2.2-0 <0.3.0-0`（0.2.2-rc 预发布宿主会被 semver 排除），发 0.8.1 时修正；本机插件仍为本地链接态，升级到 npm 0.8.0 待指令
- [x] **V0.8 S6：命名去 DSH 化（叙事分层 A 路线）+ 跨宿主工作区对齐文档（2026-11-15）**：产品对外名定稿 **Memory Hub**；MCP `serverInfo.name` → `memory-hub`（cli.ts/mcp.ts 两处）；**serve 路由中性化**：router 新增 `basePath` dep（缺省 `/dsh-memory-hub` 保持 DSH 内嵌契约，client.js 零改动；serve 显式传 `/` → API 走 `/api/*`、面板页在 `/` 与 `/panel`）；panel.ts `renderPanelHtml(token, apiBase)` 注入 `__DMH_API_BASE__` 占位符（serve='/api'，内嵌='/dsh-memory-hub/api'）；生成文件署名改 Memory Hub（hub-readme 正文/scenario/frontmatter 升级提示/config 注释头；**marker `<!-- dsh-memory-hub:hub-readme -->` 刻意保留**——老 hub 文件的格式契约，改了会重复生成覆盖用户编辑）。npm 包名保持 `dsh-memory-hub`（裸名 memory-hub 已被占：registry 实测；发行渠道名 ≠ 产品名，README 首行已定位）。**npm 包名不要改成裸名**。真机冒烟：/panel 200 + API_BASE 注入、/api/overview 200、旧前缀 404、--stop 干净。**跨宿主工作区同一性**（用户拍板：本轮只写文档）：README 新增「多个宿主指向同一个项目」小节——cwd 目录名对齐（零配置）与 `workspaces + core_id` 显式声明两种对齐方式；代码不加路径归一化（Backlog）。测试：serve 路径全改 `/api/*` + 旧前缀 404 断言 + panel API_BASE 注入断言 + MCP serverInfo.name 断言，337 全绿。决策提案 PRO-000093（等面板批准）
- [x] **V0.8 S5：CLI 只读三件套 + 分发就绪（2026-11-15）**：`memory-hub search <query>` / `get <id>` / `inbox [--batch]`（`src/cli.ts` 重构为可导入的 `runCli(argv, io)`，CLI 与 MCP 共用同一份 service 调用，tool-surface §6 兑现）；`--json` 语义收紧为严格布尔（eval-golden 输出路径仅认 `.json` 后缀值，防吞 positional）；`tests/cli-commands.test.ts` 4 例（表格/JSON 双输出、未命中退出码 1、usage 退出码 2、--type 过滤、--batch 过滤）。真机冒烟（dsh-plugin-dev hub）：search 命中 project:dsh-memory-hub 条目（工作区合成修复生效）、get 输出标题+正文+路径、inbox 列 PRO-000092。**分发就绪**：README 新增「跨宿主接入」段（MCP stdio 配置示例 / CLI 三件套 / serve 面板与三层防护）；`files` 加 `docs/02-harness/*.md`（T0–T3 分档、tool-surface、能力矩阵随包发布）；keywords 加 mcp/mcp-server/claude-code；`npm pack --dry-run` 20 文件 479 kB 核对通过。**注意**：CLI 故意无写路径（help 明示 humans approve in the panel）；harness-standard §5 的 `cli:human`（inbox --approve）仍标待实现，T0/T1 审批当前走 serve 面板
- [x] **V0.8 S4 + golden set 评测基线（2026-11-15）**：standalone 面板 = `src/http/panel.ts` 单文件内嵌（总览/待审批/配置，纯 DOM 零框架），GET `/` 与 `/dsh-memory-hub/panel` 由 serve 渲染并注入 `window.__DMH_TOKEN__`（占位符 `__DMH_WRITE_TOKEN__`）；**不新增任何 API 端点**（数据全来自既有 /api/*，硬规则满足）；只读时审批按钮禁用并显示锁原因（ADR-0010 §7）；S4 验收测试：浏览器路径批准一条候选 → knowledge/ 落文件 + 账本 `approvalRef=panel:human`。**golden set 基线**：`memory-hub eval-golden --root <hub> [--top 20] [--k 5] [--json/--markdown]`（`src/eval/golden.ts`）——从账本 `citation.added` 反推被引最多 20 条为 golden 集，标题构造查询（乐观上界），按条目自身作用域身份检索。**真机基线：hit@1 = 19/20（95%）**（dsh-plugin-dev 身份 9/9、dsh-memory-hub 身份 10/11；唯一 miss DEC-000010）。**顺带修掉 headless 真 bug**：`openMemoryHubForTransport` 原先不合成工作区 → cwd 不匹配任何工作区 → `project:*` 全部不可见（只剩 global）——MCP/serve/eval 在 Claude Code 里会"读不到项目知识"；现按 DSH runtime 同款语义合成（cwd 目录名 = 工作区 id，对齐 runtime.ts `coreWorkspaces`）。真机教训：蓝图"先有尺子"一次兑现——没跑基线就发现不了这个 bug
- [x] **V0.8 S1+S3：HTTP router 唯一实现 + `memory-hub serve`（2026-11-15）**：`src/http/router.ts` `createMemoryRouter(deps)`——端点逻辑整体从 runtime.ts 抽出（overview/knowledge/sessions/hubs/config/pending + 403/405/400/404），DSH 内嵌以 `hostMode:'embedded' + writeToken:null` 委托，client.js 零改动；ADR-0010 §6 三层防护在同一份实现里：回环 403 / **Host 白名单 421**（仅 fixed-port，`127.0.0.1|localhost|[::1]:port`）/ **写令牌 401**（仅 fixed-port，POST 需 `x-dmh-token` 匹配 `records/server-token`，timing-safe 比较）。`memory-hub serve`（`src/http/server.ts`）：默认 7331、`--port 0` 临时端口、EADDRINUSE 报错不改口、硬编码回环（无 allow_remote 逃生口）、token 缺则生成（0600）、`records/server.json` {url,pid,startedAt,tokenFile}、`serve --stop` 读 pid 停止并清理（Windows SIGTERM 是强杀 → 停止方轮询确认退出后删 server.json）。真机验证（对运行中的 dsh-plugin-dev 核心 hub）：serve 起 51123 端口，overview 200 且 readOnly=true（DSH 持有写锁，诚实降级）、无 token POST 401、伪造 Host 421、--stop 干净收尾。`tests/http-router.test.ts` 16 例（含静态分层断言 + stub 等价性 + 真服务器）。**剩 S4** standalone 静态面板 + golden set 评测基线
- [x] **V0.8 S2：MCP stdio 通用工具面（2026-11-15）**：`memory-hub mcp`（`dist/cli.js`，npm bin）+ `src/transport/mcp.ts`——零 SDK 的换行分隔 JSON-RPC 2.0（initialize 版本协商 / tools/list / tools/call / ping），按 tool-surface §7 暴露**恰好 8 个工具**（search/get/status/preflight/cite/propose/commit/close_task）；CLI `memory-hub status [--root] [--json]` 同批落地。治理不变量在 transport 层的实现：**memory_commit 恒定失败关闭**（APPROVAL_UNAVAILABLE，即使 approval.mode=auto 也不放行——MCP 宿主无原生审批，审批走面板/`inbox --approve`）；MemoryError code 原样透传不自创；headless 无轮前钩子 → 写路径前 `service.ensureTask`（原私有 ensureSyncTask 公开）补任务语义；`lock: true` = 普通写者按 ADR-0009 租约互斥。分层硬规则有静态测试（transport/cli 零 DSH 宿主依赖）。真机验证：对运行中的 `dsh-plugin-dev` 核心 hub——status 诚实报告写锁租约互斥只读；MCP 握手 8 工具 + 真实知识检索 3 hits。`tests/mcp-stdio.test.ts` 10 例。**下一步（S1/S3/S4）**：handleHttp 抽 router 双挂载、`memory-hub serve`（Host 白名单 + 写令牌 + server.json）、standalone 面板、golden set 评测基线
- [x] **萃取驱动的上报 + 引用即议程（2026-11-15，M5）**：`mirror.require_citations: N`（默认 0 = 收了就推；团队池设 1+）——被 `memory_cite` 引用 ≥N 次的条目才推，cite 是"这条真的有用"的签名，没人用的条目留在本地 aging；`trigger: 'cited'`（第四档）——条目**恰好达到**门槛时触发一次 push（未到不推、超过不重推）；引用即议程——cite 新引用追加 `records/agenda.jsonl`（可删，账本可重建），maintenance 检查单条目 ≥3 / 同主题（共享 tag）≥3 → `distill-hint` 进维护报告（**不生成 pending**，"建议蒸馏"不是知识）；面板「引用门槛」数字框 + ZH/EN。守卫：remote.enabled=false 时 cited 路径零网络零副作用。`tests/remote-agenda.test.ts` 5 例 + `tests/remote-sync.test.ts` 门槛 2 例
- [x] **路线重排：M5 提前、M4b 收窄、随后启动 V0.8 跨宿主主线（2026-11-15）**：依据外部对比文档《dsh-memory-hub 与业界优秀记忆插件对比及演进蓝图_2026.11.15》——确认"人批准写入 + 远端 provider 角色治理 + 引用驱动生命周期"为核心独占优势，最大差距是宿主锁定与写入漏斗流量低。决策：M5（require_citations + 引用即议程）提前为下一批（同时放大两大独占优势 + 漏斗的宿主无关解药）；M4b 降级为随批卫生项（reconcile 挂起）；M5 收口后启动 V0.8 MCP stdio 8 工具主线（`src/` 已零 `@deepseek-ai/*` 依赖，host.ts 为本地结构类型，transport 层可直接叠加）。重排全文见 proposal-remote-providers §5.9.4
- [x] **远端坐标编码与作用域还原（2026-11-15，M4a）**：金字塔结构在扁平远端池上的可重建来历——push 自动附加 `mh:` 命名空间坐标 tags（scope/ws/core/type/from，用户伪造的 `mh:*` 剥除），pull 按 `mh:scope`+`mh:ws`/`mh:domain` 还原到**拉取者自己的**工作区结构（解析不出退 feed.scope，`feed.scope_from_tags` 默认关）；hybrid 远端行带 `[ws:…]` 来源标注；面板两个开关（镜像坐标标签 / 按坐标还原作用域）+ ZH/EN。设计全文见 proposal-remote-providers §5.8（团队协作 = 多 provider 实例组合 + 非对称映射）与 §5.9（备份语义 / 萃取驱动上报，M4b/M5 待实现：trigger 三档实装、`max_body_chars: 0`、`mirror.backup` forget 豁免、reconcile、`require_citations`、引用即议程）。`tests/remote-sync.test.ts` 坐标 5 例 + hybrid 标注断言
- [x] **真实环境验证一轮（2026-11-15）**：M0–M3a 构建部署进运行中宿主（`plugin_manager` disable→enable 重载，profile 软链工作树，无需重启宿主进程）。对本会话真实 hub（core dsh-plugin-dev，腾讯桥 enabled）跑完整闭环：legacy desugar 正确、`remote.migrated` 一次性接管旧桥游标（pulled:7）、三次 pull 幂等收敛（8 提议 → 0/16 跳过）、probe 11ms ok、forget dry-run 零副作用、面板远端卡片与 sync 计数上线。**真机修三个 bug**（详见提案 §11.5）：§7 状态迁移漏实现、pull 候选未截断 title/summary（超 240 永久重试失败）、重试成功后 lastError 不清空。8 条真实远端候选已进 pending 待人审。
- [x] **hybrid 组合检索（2026-11-15，M3a）**：`remote.mode: hybrid` 时预检并发 fan-out 到所有声明 `read.search` 的 provider；结果按 provider 分组、每条带 `[providerId]` 标注、**连分数都不展示**（不可比的数字比不展示更糟）；每 provider `inject_max_tokens`（默认 300，0 = 不参与）截断并注明取回路径；`remote.hybrid.deadline_ms`（默认 2000ms）死线保护回合延迟；远端命中**永不**进 `state.hits`、不可 `memory_cite`——要入库只有 `memory_remote_sync` → pending → 人审一条路；`preflight.recorded` 账本带 `remote` 摘要；`tests/remote-hybrid.test.ts`(6)。**尚未实现**：`team-server` adapter（M3b，局域网实时场景，见 proposal-team-memory）
- [x] **腾讯桥（V0.7.2，阶段二）**：`src/tencent-client.ts` + `src/tencent-sync.ts`；`memory_tencent_status/pull/push` 三工具；pull 把腾讯 L1/L2 转成 pending 候选（人审才入库）、push 把 accepted 分发到腾讯 conversation；outbox 离线队列 + `pushedIds` 幂等重放；`records/tencent-state.json` 游标；`tencent.enabled:false` 时零网络请求（回归测试锁定）
- [x] **注入结构优化（V0.7.2，阶段三）**：`buildPack` 增加 "You can also query this memory on demand" 提示行，`policy.preflight.hint_tools` 默认开、可关
- [x] **自动场景归纳（V0.7.2，阶段三）**：`src/scenario.ts` 派生场景索引（按 topic:/domain:/batch: tag 或 knowledge 类型聚合 accepted 落 `scenario/<topic>.md`），工具 `memory_scenario_rebuild/list`；绝不修改 `knowledge/`，目录可删可重建；`layers.scenario_dir: ""` 关闭
- [x] **可选分层记忆（V0.7.2，阶段三）**：`layers.enabled`（默认 false，flat 行为不变）+ `status.layers.suggestion`；`layers.suggest_at_entries`（默认 20000）达到才提示
- [x] **多租户隔离（V0.7.2，阶段三）**：腾讯桥 config 携带 `team_id/agent_id/user_id/task_id`，body 优先于 header（实测确认）
- [x] **远程实时通道（V0.7.2，阶段三）**：`tencent.sync_interval_min`（默认 30，0=关）心跳定时器只 ping 诊断；pull/push 保持手动触发（腾讯无推送，每轮现拉是固有限制）
- [x] Cordis 插件入口 `src/index.ts`（`apply` / `inject`）
- [x] 10 个模型工具注册与 schema（`memory_search`, `memory_get`, `memory_status`, `memory_preflight`, `memory_cite`, `memory_propose`, `memory_commit`, `memory_close_task`, `memory_consolidate`, `memory_maintenance`）
- [x] 12 个模型工具注册与 schema（在 10 个基础工具上新增 `memory_duplicates`、`memory_reflect`）
- [x] 本地优先存储：Markdown + YAML + JSONL，无强制数据库
- [x] CJK unigram/bigram 分词 + 内存倒排索引 + BM25-lite 检索
- [x] 每个用户回合第一步自动预检；幂等键 `(sessionId, turn)`
- [x] 预检相关性门控：`policy.preflight.min_score` 过滤弱命中，全部低于阈值时记 `no_match`
- [x] 本地优先排序：`policy.preflight.local_boost` 提升当前工作区 `project:<id>` 知识
- [x] 紧凑上下文注入（`memory:pack`），只含 ID、标题、摘要、作用域
- [x] 按需读取：`memory_get` 默认摘要（结论 + 小节目录，700 字符封顶），`section` 读单节（2000 字符封顶），`full: true` 读全文；`memory_search` 支持 `detail: "ids"` 紧凑扫描
- [x] 指令式包尾：先 `memory_get`、使用后 `memory_cite`、结束前 `memory_close_task`，并提示加载 `memory-hub` skill
- [x] 系统级 `memory-hub` skill：由插件注册到 Host 全局 skills 层，模型/用户可按需加载；覆盖检索、作用域、写入审批、回写评估、核心回填与反模式
- [x] 批量萃取工作流（skill 内）：批次清单 `batch.yaml`、10–20 文件/2 万字一个 chunk、一条知识一个判断、`tags: batch:<id>`、状态机 `draft → extracted → reviewed → distilled → archived`；模板见 `docs/07-templates/batch-extraction.md`
- [x] 官方 skill 命名审计：当前 catalog 无 `memory-hub` / 旧名 `memory-management`；采用产品自有名避免 runtime 静默遮蔽 bundled；测试锁定官方名称快照
- [x] Skill 注册降级：宿主没有 `skills` 服务时只记录 warning，不影响 10 个记忆工具
- [x] 引用记录（`memory_cite`）区分检索命中与实际使用
- [x] 面板任务行显示预检命中数与引用数，暴露“命中但未引用”的断点
- [x] 候选创建（`memory_propose`）与提交审批（`memory_commit`）
- [x] 面板人工审核（V0.3.0）：「待审批」可直接批准/拒绝；批准走 `service.approveProposal`（账本 `approvalRef: panel:human`），拒绝归档为 rejected 并记 `proposal.rejected`；`policy.panel.review: false` 可关闭并恢复只读
- [x] 面板批量审核（V0.4.0）：勾选/全选后批量批准或拒绝；端点 `POST /api/pending` 接受 `ids[]`（最多 50 条），返回逐条 `results` 与 `approved/failed`，部分失败不阻塞其他条目
- [x] 面板批量萃取视图（V0.7.0）：待审批按 `tags:batch:<id>` 聚合筛选（只读，不新增写端点）；列表只返回最近 200 条（`PANEL_PENDING_LIMIT`），`pendingTotal` / `pendingBatches` 仍为全量计数，顶部提示“只显示最近 N 条，共 M 条”
- [x] 候选积压启动保护（V0.7.0）：`pending/` 只预解析最新 `PENDING_EAGER_LIMIT=200` 条，其余按 id 惰性解析；3k 候选启动 3.56s → 0.33s、10k 0.35s（`scripts/bench-pending.ts`）；`counts().pending` 与序号仍完整
- [x] 审核端点防护：只接受回环地址、`x-dmh-review: 1` 头、同源 Origin；只作用于已有 `pending/` 候选，不提供改正文/删除知识端点
- [x] 工作区定时蒸馏（V0.5.0）：`core_workspaces[]` / `workspaces[]` 可选 `distill { enabled, time, target, session_id, agent_preset, max_proposals }`；面板「配置」页逐工作区配置
- [x] 定时蒸馏由 Host `schedule` 服务执行：`target: new` 每次新建会话（`cwd` = 工作区 root），`target: session` 投递到指定会话；任务标题 `memory-hub:distill:<hub-id>:<kind>:<id>`
- [x] 幂等对齐：插件启动、配置热更新、`schedule` 延迟挂载时创建/更新/删除任务；单条失败回填诊断，不影响其他工作区
- [x] 真实 Host 兼容修复（V0.5.1/V0.5.2）：Host `daily.time` 要求 `HH:mm:ss`（内部把配置的 `HH:mm` 规范化）；`session-controller` 晚于 `schedule` 就绪时首次注册失败，改为 5 次退避重试；`/api/config` 返回 `distill`，面板保存后不回退成“未配置”
- [x] 实机验证：隔离 profile 安装 0.5.2 冷启动，首次注册被拒后自动重试成功（`action: created`），重启后 `kept` 且 `taskId` 不变，失败条目不误删旧任务；移除配置后任务被删除
- [x] 蒸馏提示词只读 L1、`memory_propose` 到 `project:<父核心>`（顶端用 `memory_consolidate` 到 global）、`memory_close_task`；禁止 `memory_commit`
- [x] 定时蒸馏配置校验：启用必须有 root；`target: session` 必须有 `session_id`；`max_proposals` 1..20
- [x] 定时蒸馏面板（V0.5.3）：整宽对齐表（工作区/启用/时间/投递目标/会话/上限/状态），逐行状态标签（已注册/待注册/失败/未启用），底部汇总“已启用数 + 未保存 + 失败数”与主按钮，注册错误单独成块；≤760px 自动堆叠为带标签的两列
- [x] 会话候选（V0.6.0）：`/api/sessions` 只读回环端点 + 会话列 datalist；Host 缺失 `sessionController` 或 4s 超时则显示不可用并允许手填
- [x] 设计决策：[ADR-0007](../01-architecture/decisions/ADR-0007-scheduled-distillation.md)；操作与排障：[distillation-schedule](../06-operations/distillation-schedule.md)
- [x] 宿主兼容冒烟（V0.4.0）：Web 模式 DSH `0.2.2-rc.1` 安装 0.4.0 后启动通过，`/api/overview` 200、`clientModules` 广告 true、批量审核端点返回 403/409 预期；`engines.dsh` 门禁因宿主用 `includePrerelease` 校验而放行（见 [COMPATIBILITY](../COMPATIBILITY.md)）
- [x] 任务关闭评估（`memory_close_task`）：`proposed` / `no_new_knowledge` / `needs_evidence` / `deferred`
- [x] 手动汇总（`memory_consolidate`）：项目知识晋升为 global 候选
- [x] 夜间维护（`memory_maintenance`）：确定性巡检，报告写 `<hub>/reports/<timestamp>.md` + `latest.md`
- [x] 维护候选：精确重复（标题 + 摘要 + 正文哈希）生成 deprecate pending；带 `core` / `shared` / `reusable` / `promote` 标签的子工作区知识生成核心晋升 pending
- [x] 维护只读保护：不 commit、不删除、不改写正文；同一指纹已有 pending 时跳过；每个 core 单次最多 10 条候选（可配 1..20）
- [x] 维护扫描所有 core，单个 core 失败不阻塞其他 core；报告包含近似重复、过期 pending、长期未引用、加载诊断、超长正文、作用域异常
- [x] 多 core 维护为**串行**：一个全局定时器，按 `core_workspaces[]` 顺序执行，fallback 最后；每个 core 独立报告与 pending
- [x] Host 夜间定时器：`policy.maintenance.enabled` + `time`（默认 03:00）；每 60 秒检查，当天只跑一次；错过时间在下一次 Host 启动后补跑
- [x] 维护状态记录：`<configHub-root>/records/maintenance-state.json`，避免同一天重复执行；工具输出包含逐个 core 的统计与错误
- [x] 维护不使用 DSH `schedule`，不出现在官方「自动化任务」栏；控制入口为 `config.yaml`
- [x] 已记录本轮决策与取舍：[decision-log](decision-log.md)；架构细节：[maintenance](../01-architecture/maintenance.md)；操作手册：[06-operations/maintenance.md](../06-operations/maintenance.md)
- [x] ADR：`ADR-0004` 系统级 memory skill、`ADR-0005` 夜间维护只生成 pending
- [x] 作用域系统：`global` / `domain:<id>` / `project:<workspace-id>`
- [x] 核心/子工作区模型：`core_workspaces` 与 `workspaces[].core_id`
- [x] 多核心仓（multi-hub）：每个 `core_workspace.root` 作为独立数据仓库，按工作目录最长前缀路由
- [x] 子工作区可感知主工作区：同一核心仓下的子工作区可见 `project:<core-id>` 作用域知识
- [x] 子工作区根目录参与路由：子工作区即使不在核心仓根目录下，也能路由到所属核心仓
- [x] 双角色工作区（V0.1.7）：同一个 `id` 可同时出现在 `core_workspaces` 与 `workspaces`；会话路由到自己的核心 Hub，父核心 Hub 挂为二级检索来源；等长前缀平局时自己的核心优先，不再依赖配置顺序
- [x] 金字塔记忆（多层上级链）：沿 `workspaces[].core_id` 逐层推导父、祖父、…（近→远，最多 8 层，带环检测，成环截断告警）；`memory_status` 报告 `parentCoreIds` / `ancestors` 完整链
- [x] 分级蒸馏（L1/L2/L3+）：L1 `scope:"core"` / `project:<self>` 写自己的 Hub；L2 `scope:"parent"` 写父核心 Hub 的 `pending/`；L3+ 显式 `project:<任意祖先核心>` 逐层上推；commit 落到对应层 Hub 的账本
- [x] 跨 Hub 检索（金字塔回退）：`memory_search` / 预检以当前工作区为主，本层有 ≥1 个合格命中即返回、不再上溯；本层无命中才按 近→远 回退到上一层 `project:<祖先>`，命中带 `core` 标注；`memory_get` / `memory_cite` 默认同样按 近→远 回退读取，`memory_get` / `memory_cite` / `memory_commit` 支持可选 `core` 参数
- [x] 双角色安全约束：`core_id` 不得指向自身（配置保存时拒绝）；同 ID 跨 Hub 冲突默认取自己的 Hub
- [x] L2 别名：`memory_propose` 支持 `scope: "parent"`（等价于 `project:<父核心>`），结果回报 `core` 与 `scope` 便于 commit 显式指定
- [x] 配置热更新重接线：watcher 触发 `reloadConfig` 后执行 `reconfigureCores()`，按最新配置增删 core、刷新工作区清单、重新接线金字塔祖先链并同步最新 config 对象；新增核心 / 开启双角色无需重启
- [x] 配置页增删：面板「配置」页可添加核心/子工作区，并可删除子工作区（整表替换保存）与核心工作区（引用它的子工作区先解绑为未分配）；后端校验拒绝“引用未知核心 / 自引用”，删除有确认提示
- [x] 面板知识列表对上级核心条目显示「父核心蒸馏」标签；详情打开携带 `core` 查询参数
- [x] 测试模式 `policy.approval.mode: auto`：跳过 DSH 审批，账本 `approvalRef` 记为 `test:auto`（默认仍为 `manual`）
- [x] 核心共享：`memory_propose` 支持 `scope: "core"` 别名，子工作区可把可复用知识回填到 `project:<core-id>`
- [x] `dsh-plugin-dev` 核心工作区已写入 9 条插件开发基线（入口、工具、客户端、开发循环、常见坑、回填检查清单、npm 发布踩坑、发布 checklist、预检采用率诊断）
- [x] 发布经验已回填核心：`KNO-000002`（npm 发布/Trusted Publisher/市场索引踩坑）、`PRC-000003`（发布 checklist）
- [x] 预检采用率经验已回填核心：`KNO-000003`（预检运行≠被使用，先修相关性/指令/可见性，再考虑行为门禁）
- [x] 本仓本地决策：`DEC-000002`（min_score=1.0、local_boost=1.2）
- [x] 系统级 skill 经验已回填核心：`API-000004`（`ctx.skills.register` 与按需加载）；本仓决定：`DEC-000003`（采用 `memory-hub` skill）
- [x] 面板知识列表对 `project:<core-id>` 显示「核心共享」标签
- [x] Web 面板六个标签页：总览 / 配置 / 知识 / 待审批 / 活动与策略 / 能力
- [x] 面板除「待审批」人工审核外只读；配置与审核走回环 HTTP 路由（`/dsh-memory-hub/api/*`）
- [x] 时效字段（V0.7.0，按 [proposal-temporal-fields](../03-openspec/proposal-temporal-fields.md)）：`valid_from` / `expires_at` / `last_verified` 可选、带时区校验、`valid_from ≤ expires_at` 与「`last_verified` 不得在 5 分钟后」两道校验；派生状态 `fresh/aging/stale/scheduled` 只读不落盘
- [x] 时效降权：`policy.temporal.aging_days`（默认 90）、`aging_decay` 0.85、`stale_decay` 0.6、`scheduled_decay` 0.3；老文件用 `updated_at` 回退，`aging_decay: 1.0` 可完全关闭
- [x] 预检时效门：`scheduled` 不注入上下文（`memory_search` 仍可查到并带 `temporal`），`stale` / `aging` 注入并标「已过期，需复核」/「长期未确认」；`memory_get` 元数据带 `temporal` 与 `temporalNote`
- [x] 时效维护视图：报告 Summary 增加 `temporal` 计数，Issues 增加 `expired`（warn）与 `aging`（info，只报告不写候选）；面板知识行/详情/待审批卡显示时效标签与三个时间
- [x] 去重与合并（V0.7.0，按 [proposal-dedupe-merge](../03-openspec/proposal-dedupe-merge.md)）：`src/duplicates.ts` 组合相似度（0.6 × 标题/摘要词元 Jaccard + 0.4 × 正文 3-gram，正文只取 4KB），只在同类型同作用域内比较；keeper 顺序 `version` → `updatedAt` → `sourceRefs` → `id`
- [x] 只读工具 `memory_duplicates`（`scope?` / `threshold?` / `limit?`，阈值默认 `policy.dedupe.threshold` 0.72，返回 keeper/similarity/高置信标记）；维护报告的 `duplicate-near` 复用同一实现并展示 keeper
- [x] `operation: "merge"` 提案：`merged_ids`（1..10，同类型同作用域、不含 target、不重复、未合并过）；提交 target +1 并合并正文与 `related`/`source_refs`，被合并项 `superseded` + `superseded_by`，各自写 `history/`，账本 `knowledge.merged`
- [x] 面板 merge 卡片：显示被合并条目与 target 旧正文 → 合并稿的行级 diff（上限 200 行，超出提示截断），仍只读、批准走既有审核端点
- [x] 设计决策：[ADR-0008](../01-architecture/decisions/ADR-0008-merge-operation.md)（独立 merge 操作）、[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)（写锁租约 + fencing token）、[ADR-0010](../01-architecture/decisions/ADR-0010-panel-transport-portability.md)（面板可移植性：路由双挂载 + MCP/CLI 通用面，Proposed）
- [x] 回顾式萃取（V0.7.0，按 [proposal-retrospective-extraction](../03-openspec/proposal-retrospective-extraction.md)）：`src/reflect.ts` 的 `SessionDigestSource` / `HostSessionDigestSource` / `NullSessionDigestSource`、最长前缀会话归属 `ownerWorkspaceOf`、digest 只保留用户消息 + 每轮助手最终文本 + 失败工具（`policy.reflect.max_chars` 默认 8000，头 60% + 尾 40% 截断）
- [x] `memory_reflect`（`session_id?` / `limit?` / `dry_run?`）：只读本工作区名下已结束的主会话（排除委派会话与 root 外会话），返回 digest 与 `seqRange`；`min_messages` 不足 `too-short`，digest 未变 `already-reflected`；`dry_run` 不写水位与账本
- [x] 回顾水位：`records/reflect-state.json`（`sessionId` / `workspaceId` / `reflectedAt` / `digestHash`，上限 200 条），账本追加 `reflect.read`；无宿主 `sessionQuery` 时返回 `available: false` 并跳过定时任务
- [x] 按工作区定时回顾：`reflect:`（`enabled` 默认 false / `time` 04:30 / `target` / `max_candidates` / `lookback_days`）与 `policy.reflect.*`（`max_chars` / `max_sessions` / `min_messages`）；标题 `memory-hub:reflect:<hub>:core|workspace:<id>`，与蒸馏共用 `reconcileScheduleEntries`，启动/热更新/保存后对齐并沿用瞬时错误重试
- [x] 面板「能力」页补充 `memory_duplicates` 与 `memory_reflect` 说明（中英双语）；操作文档 [reflection.md](../06-operations/reflection.md)
- [x] 派生 SQLite 索引（V0.7.0，按 [proposal-derived-index](../03-openspec/proposal-derived-index.md)）：`storage.index: auto|memory|sqlite`（默认 `auto`，阈值 `sqlite_min_entries` 30k）、`index_candidate_limit`（默认 2000）、`records/index.sqlite`（contentless FTS5 倒排 + `terms` df + 文档元数据）、`entry_count + 知识目录 mtime` 指纹校验、损坏或缺少 `node:sqlite` 时回退内存并记诊断
- [x] 检索打分抽成 `SearchIndex` 与 `rankScored` / `bm25Term` / `passesFilters` / `searchSetup`：内存索引与 SQLite 索引共用同一份公式；命中数 ≤ 候选上限时两者逐位一致
- [x] `/api/overview` 与 `memory_status` 暴露 `index.backend` / `index.rebuilt`；`store.closeIndex()` 释放句柄（Windows 文件锁）
- [x] P0 原文取证（V0.7.0，按 [proposal-evidence-lifecycle-risk](../03-openspec/proposal-evidence-lifecycle-risk.md)）：`memory_reflect` 增加 `mode: "search"`，经宿主 `sessionQuery.searchEvents` 返回 `seq/type/time/snippet`；只读、不写水位与账本；缺省扫最近 3 个本工作区会话，`limit` 1..50
- [x] P0 引用生命周期：维护报告与 aging 参考最近一次 `memory_cite`（`knowledgeId → lastCitedAt`），`uncited` 区分「从未引用 / 最近引用 N 天前」，totals 增加 `cited`；`/api/overview` 知识行带 `lastCitedAt`；归档仍需人批准的 deprecate 候选
- [x] P0 写入风险标记：`src/risk.ts` 扫描注入短语、凭据形态、零宽/方向控制符、角色伪造；`memory_propose` 返回 `risk`、账本记 `riskLevel/riskSignals`、面板候选卡片显示「需确认」；**只标记，不阻断、不改写**
- [x] Hub 目录说明书（V0.7.0）：`Hub.open` 在可写 Hub 根目录自动生成 `README.md`（`src/hub-readme.ts`，标记 `hub-readme <version>`）；内含目录地图（每个文件夹/文件谁写、能否手改、删了会怎样）、九类知识表与 **`assets` = 外部资源索引（不是代码资产/构建产物）** 的澄清、作用域金字塔、唯一写入路径、工具速查、派生数据与常见误用；同版本不覆盖用户编辑，无标记的手写 README 不会被改写，只读 Hub 不写
- [x] 初始化不再新建遗留 `index/` 空目录（老 Hub 里已有的仍可手动删除）
- [x] 根 `README.md` 增加「5 分钟初始化工作区」：配置 Hub / 数据 Hub 的区别、最小 `core_workspaces[].root` + `workspaces[]` 配置、验证三件事、初始化后目录速览；修正示例里核心工作区缺 `root` 的问题
- [x] `memory-hub` skill 增加「Hub 目录与初始化（先读目录说明书）」：目录表、`assets` 含义、最小配置、初始化后用 `memory_status` 验证；回顾式萃取补充 `mode: "search"` 原文取证
- [x] 165 个 vitest 测试（20 个文件）
- [x] 升级/收编文档对齐 0.6.0：[upgrade-guide.md](../06-operations/upgrade-guide.md) 覆盖 link/CLI/市场迁移三条免卸载路径，并新增「老版本收编兼容矩阵」（format 闸门、账本容错、时效默认、序列回填、索引自动）与收编清单
- [x] npm 发布：`dsh-memory-hub@0.1.5`（2026-11-01，`latest`）
- [x] GitHub release `v0.1.5`，仓库 homepage 指向 npm 包页
- [x] npm `0.1.5` 发布后已校验 `gitHead` 与 provenance
- [x] GitHub Actions 自动发布：`.github/workflows/release.yml`（tag 触发，Windows 构建/测试，Trusted Publisher/OIDC 发布 npm，自动创建 Release 并上传 tarball）
- [x] Trusted Publisher 端到端验证：`v0.1.3` / `v0.1.5` 由 GitHub Actions 无 token 发布，npm 记录 SLSA provenance
- [x] Release workflow 已实测通过（tag push + `v0.1.5`）；无需 `NPM_TOKEN`
- [x] 发布说明：`docs/06-operations/release.md`
- [x] 插件市场索引：`site/index.json`，可通过 jsDelivr 作为 DSH 自定义市场源
- [x] `PLUGIN_VERSION` 直接读取 `package.json`，构建 banner 同步版本，避免发布时版本漂移
- [x] TypeScript + esbuild 构建，产出 `dist/index.js`
- [x] 宿主兼容性验证记录（`docs/COMPATIBILITY.md`）
- [x] 写锁按 hub 根独立：只有配置根/该 core 根自己的锁占用才让它只读，不跨根级联；显式 `readOnly: true` 仍是全局只读（[ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md)）
- [x] 写锁改为**租约 + fencing token**（[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)）：心跳 15s、租约 `lock_stale_ms`；pid 确定不存在（`ESRCH`）立即回收，探不到死活（Windows 常见 `EPERM`）约 60s 回收，心跳超租约（挂死/假死/PID 复用）回收，跨机锁立即回收；回收走 `rename` 复核的 CAS
- [x] 写锁自愈：`Hub.ensureWritable()` 在每次写入口复核 token 并在对方退出后自动重抢；被抢的旧写者降级为只读（`lost the lease`），不再永久卡死、不必手动删 `.writer.lock`；正常退出主动释放锁
- [x] 写锁缓存可失效：`Hub.revalidateLock()` 同步重读锁文件，在 `memory_status` / 面板（`/api/overview`、`/api/config`）与每 60s 运行时巡检里修正内存中的 `readOnly`——锁文件被释放/删除、pid 消失、心跳过期后不再继续报只读；锁文件“消失”只丢句柄（根空闲），只有 `token` 变成别人的才降级；面板每 30s 轮询只读切片
- [x] `memory_status` / `/api/overview` 增加 `lock: { held, owner, expiresAt, reclaimed, onDisk }` 诊断
- [x] 配置可写性与写锁解耦：`configWritable` 只受显式 `readOnly: true` 影响；锁被占用或 `config.yaml` 损坏时，面板「配置」页仍可保存并触发 `reloadConfig` 恢复写权限
- [x] 新增项目文档体系（`docs/` 目录层级 + `AGENTS.md`）

## 当前约束

**不变量（产品身份，见 [AGENTS.md](../../AGENTS.md)）**：

- Markdown / YAML / JSONL 是权威数据格式；派生索引可删可重建，不能成为唯一路径。
- 人批准才能进 `knowledge/`：`memory_commit` 走宿主原生审批；面板「待审批」由人点击（账本 `panel:human`）；CLI/standalone 面板同理；模型永不自批。
- 纯文本可读可迁移。
- 默认零网络：远端未启用时零请求、不初始化 client、不注册定时器；无网络时核心功能全部可用。

**方向性约定（非不变量）**：

- 三层单向依赖：`core` → `transport`（MCP / HTTP router / CLI）→ `host-glue`（DSH 插件）；`core` 不得 import `@deepseek-ai/*`。
- 服务端只允许绑定 loopback；Host 头白名单 + 本地 Origin + 写操作令牌；监听 `0.0.0.0` 拒绝启动。
- 面板可写字段 = `core_workspaces` / `workspaces` / `remote`（均为**配置**，不是知识正文）。**2026-11-14 起撤下"面板默认只读"的旧表述**——它与 V0.5.0 起的实现不符，且阻塞多入口演进；禁止的仍是通过任何端点改写 `knowledge/` 正文或删除知识。
- 每根一把写锁（租约 + fencing token，ADR-0009）：第二个写者只让该根降级为只读，不跨根级联；`memory-hub serve` 是普通写者，不享受特权。
- Windows 原生路径语义。

## 已知限制

- DSH 原生审批提示的**真实点击通过**路径未验证；本机审批提示关闭。测试模式 `auto` 已验证自动提交与 `test:auto` 账本记录。
- 面板审核已在假 Host 的 HTTP 路由上验证（头/Origin/批准/拒绝/账本）；桌面端真实点击路径尚未人工确认。
- 近重复检测**不再跨作用域提示**（以前只按类型过滤，core 与 project 各一份同名条目也会出现在维护报告里）；现在只在同类型同作用域内比较，跨作用域应走蒸馏/晋升。这是有意的行为变化，不是检测退化。
- merge 首版不做 supersede 链传递：A 合并 B、C 后，B 以前 `supersedes` 的 D 仍需人工判断是否有效。
- 回顾式萃取的 digest 依赖宿主 `sessionQuery` 的事件形状（`user/message`、`assistant/message`、`tool/result`）：单元测试用假 source 覆盖，尚未在真实 Desktop Host 上核对真实 JSONL 的 `data` 结构；形状不符时会退化为空 digest（`skipped: empty`）而不是报错。
- 定时回顾按工作区各一条任务，工作区多时任务数量线性增长；默认 `enabled: false`，需要显式开启。
- 回环 HTTP 无法从技术上区分“人点击”和“本机脚本调用”；面板审核适合单人本机使用，不要在本机运行不可信脚本时把它当作唯一防线。
- 候选惰性加载的边界：超过 200 条积压时，`pendingForTask` 的每任务上限、维护提案的 `maint-` 去重、面板批次计数只覆盖已加载的候选；`counts().pending` 与 id 序号仍完整。审批/打开某条旧候选时会自动补加载。
- jsDelivr 的 `@main` 分支缓存可能长时间滞后：本次 `site/index.json` 更新后，`@main` 仍返回 0.2.0（多次 purge 未刷新），而 commit-pinned URL（`@8a2dabe`）已返回 0.3.0；市场索引最长约 12h 后才会自动刷新。
- 门禁的宿主级拒绝未在真实会话中强制触发，由单元测试覆盖。
- PTC `run_code` 嵌套调用未验证。
- 外部 CLI / 多进程共享 Hub：Web 0.2.2-rc.1 实测第二个进程按写锁降级为只读（`readOnlyReason: lock`），符合设计；租约回收、fencing、多进程写路径仍由单元测试覆盖，未做真实多进程端到端压测。
- 升级写锁时不要混跑两个版本：v0.7.0（v1 锁）会刷新心跳、健康时不会被抢，但它的写入口没有 fencing 复核；卡死超过租约被新版本接管后，它恢复会在不复核的情况下继续写。升级时先停旧进程。
- Windows 上“已退出但探不到”的 pid：`process.kill(pid, 0)` 对某些已不存在的 pid 返回 `EPERM`（本机实测 pid 36156），无法证明它已退出，只能用心跳仲裁（`min(lock_stale_ms, 60s)` 宽限）。这类写者约 1 分钟恢复而不是立即恢复；要更快需要平台特定探针（`tasklist` 子进程 / `NtQueryInformationProcess`），代价大于收益。同一台机器上**另一个用户**运行的 DSH 也是这种“探不到”形态：只要它健康刷新心跳就不会被抢。
- 租约式写锁的残余窗口：旧写者被冻结在“已复核 token、但还没写完”之间时，租约被抢后它恢复运行可能再写一次。触发需要“冻结超过 `lock_stale_ms` 且恰好停在写操作中间”，当前靠写入口复核 token + 心跳不复活别人的锁 + `release` 只删自己的锁来收敛；若要彻底消除需引入每写一条的 fencing 序号校验（账本可扩展）。
- `records/ledger.jsonl` 的追加（`task.created` / `preflight.recorded` / `citation.added` / `task.closed`）**没有**经过写锁或 `ensureWritable()` 闸门，这是既有行为：降级为只读的根仍会记任务与引用事件。知识写入（`knowledge/`、`pending/`、`sequences.json`）才受写锁保护。若未来要求账本也单写者，需要在 `Ledger.append` 前加同样的 fencing 复核。
- 长会话上下文累积效果未做规模测量。
- 检索规模：合成语料已验证 1k–100k。内存索引 20k p50 ≈ 39ms / 堆 ≈ 210MB，100k ≈ 352ms / 堆 ≈ 1.1GB；派生 SQLite 索引 100k p50 ≈ 399ms、磁盘 ≈ 246MB，用磁盘换内存。真实语料上的分数分布、启动全量解析耗时仍未测；分档方案见 [scale-plan.md](../01-architecture/scale-plan.md)。
- 批量萃取未实现：候选仍只能逐条 `memory_propose`，`pending/` 上千条时的启动解析与面板列表未做规模保护。
- Web 面板完整视觉效果尚未人工确认。
- 核心仓若位于 `~/.dsh/memory-hub` 之外，需要 DSH 跨目录操作授权。
- 预检已覆盖所有子工作区，但模型实际调用 `memory_get` / `memory_cite` / `memory_close_task` 的比例仍低；账本中大量任务以 `deferred`（`turn ended without an assessment`）关闭。`memory-hub` skill 只是可加载的操作规范，不强制模型加载或执行。
- `memory-hub` skill 已出现在 skill catalog 并可加载，但是否被主动加载尚未量化；skill 加载不写记忆账本，短期只能通过会话行为观察。
- 子工作区本地 `project` 知识仍很少；没有本地条目时，预检只能返回核心共享知识。
- 夜间维护依赖 Host 运行；Host 关闭时不会执行，下一次启动且当天未跑过会补跑一次。当前本机已在 `23:29` 因“当天未跑且已过 03:00”触发过一次，说明补跑逻辑生效。
- 夜间维护只做确定性判断：精确重复才生成 deprecate，近似重复/语义合并只报告；晋升只认显式复用标签，避免误判。
- `reports/` 目前不自动清理；报告会随天数增长。
- 维护提案不会自动提交；第二天仍需人工 `memory_commit`（或保留 pending 继续观察）。
- 多 core 维护串行执行，总耗时是各 core 之和；一个慢 core 会拖慢后续 core。
- 一个 core 失败只记 warning、不阻塞其他 core，但当天不会单独重试；状态在整轮结束后统一写入。
- 维护只有全局 `maintenance-state.json`，没有 per-core 状态；没有全局合并报告。
- `all_cores: false` 的定时器当前只跑 fallback；手动工具则是“只跑当前 pack”，语义不一致，暂未修改。
- 官方「自动化任务」栏不可见；如需暂停/编辑/立即运行，需要改用 DSH `schedule`，代价是会话和模型回合。
- 当前 Hub：13 条 accepted、1 条 pending（`PRO-000016`，本次设计决策候选）。
- `approval.mode` 仍为测试遗留的 `auto`；维护本身不 commit，但若要求严格人工审批应改回 `manual`。
- 金字塔上级链最多 **8 层**（含父/祖父/…）；超过上限的更深层配置不会参与检索与蒸馏，配置环（A→B→A）在运行时截断并告警，不中断会话。
- 两个 Hub 的 ID 序列相互独立；同 ID 冲突时默认取自己的 Hub，上级副本需用 `core` 参数显式访问（面板详情同样带 `core` 查询参数）。
- 上级核心 Hub 的夜间维护不会把子会话的 L2/L3+ 候选自动晋升；逐层蒸馏仍靠 `memory_propose(scope)` + 人工 `memory_commit`。

## 当前目录

```text
dsh-memory-hub/
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── esbuild.config.mjs
├── cordis.patch.yml
├── client.js
├── src/
│   ├── index.ts
│   ├── runtime.ts
│   ├── service.ts
│   ├── store.ts
│   ├── search.ts
│   ├── frontmatter.ts
│   ├── host.ts
│   ├── hub.ts
│   ├── config.ts
│   ├── scope.ts
│   ├── skill.ts
│   ├── maintenance.ts
│   ├── maintenance-schedule.ts
│   ├── ledger.ts
│   ├── lock.ts
│   ├── atomic.ts
│   ├── ids.ts
│   ├── time.ts
│   ├── errors.ts
│   ├── types.ts
│   └── tools.ts
├── tests/
├── docs/
│   ├── DESIGN.md
│   ├── KNOWLEDGE-FORMAT.md
│   ├── COMPATIBILITY.md
│   ├── 00-project/decision-log.md
│   ├── 01-architecture/maintenance.md
│   ├── 01-architecture/decisions/ADR-0004-system-level-memory-skill.md
│   ├── 01-architecture/decisions/ADR-0005-nightly-maintenance.md
│   ├── 06-operations/maintenance.md
│   └── ...（本目录体系）
├── site/
│   ├── index.json
│   └── icons/
└── dist/
```

## 决策与追踪入口

- [decision-log.md](decision-log.md) — 2026-11-01 的全部决策、改动、验证与已知限制。
- [ADR-0004](../01-architecture/decisions/ADR-0004-system-level-memory-skill.md) — 系统级 `memory-hub` skill 的注册与命名。
- [ADR-0005](../01-architecture/decisions/ADR-0005-nightly-maintenance.md) — 夜间维护采用内部定时器、只生成 pending、多 core 串行。
- [maintenance.md](../01-architecture/maintenance.md) — 夜间维护的组件、顺序、状态、失败与配置语义。
- [maintenance.md](../06-operations/maintenance.md) — 开启/关闭、每日检查、排障与回滚。
- [proposal-maintenance.md](../03-openspec/proposal-maintenance.md) — 已实现的 OpenSpec 提案。
- [COMPATIBILITY.md](../COMPATIBILITY.md) — 宿主冒烟与未验证项。
- [memory-landscape-2026.md](../05-domain/memory-landscape-2026.md) — 2026-11 调研：ChatGPT/Claude/Qwen/OpenClaw 的记忆与萃取机制、开源记忆层、评测基准，以及由此重排的瓶颈与 P0/P1 路线。
- [hermes-memory-2026.md](../05-domain/hermes-memory-2026.md) — 2026-11 调研：Nous Research Hermes Agent 的三层记忆（有界常驻 / FTS5 档案 / 单活 provider）、写入上限与整理、后台复盘、借鉴优先级与「不该照抄」清单。
- [search-performance.md](../04-development/search-performance.md) — 2026-11 实测：1k/5k/20k/50k/100k 规模的检索延迟与内存、热路径优化（时间戳预解析、标题缓存、前 K 选择）、`min_score` 漂移与「要不要换 SQLite」的判定条件。
- [scale-plan.md](../01-architecture/scale-plan.md) — 多年业务积累的规模化预案：检索 / 入库 / 蒸馏三条成本线，按业务域分库、批量萃取流水线、分级审批与派生索引的分档路径。
- [compatibility.md](../01-architecture/compatibility.md) — 兼容性契约：未知字段保留、`format` 版本闸门、作用域由小到大、索引可替换、批量靠 tag，以及合并撞 ID / 新类型 / 早期 global 三个迁移坑。
- [batch-extraction.md](../07-templates/batch-extraction.md) — 批量萃取模板：`batch.yaml`、chunk 提示词骨架、进度表与收尾检查。
- [proposal-derived-index.md](../03-openspec/proposal-derived-index.md) — 派生 SQLite 索引（**已实现**，v0.7.0）：contentless FTS5 取候选 + 现有 JS 精排、启动指纹校验、无 `node:sqlite` 时回退内存。
- [proposal-temporal-fields.md](../03-openspec/proposal-temporal-fields.md) — P0 提案：时效字段与过期降权（Accepted，aging 90 天；**已实现，v0.7.0**）。
- [proposal-dedupe-merge.md](../03-openspec/proposal-dedupe-merge.md) — P0 提案：近重复检测与 `merge` 提交（Accepted，独立 merge 操作；**已实现，v0.7.0**）。
- [proposal-retrospective-extraction.md](../03-openspec/proposal-retrospective-extraction.md) — P0 提案：回顾式萃取（Accepted，定时任务 + 核心/子工作区各一条；**已实现，v0.7.0**）。
- [proposal-evidence-lifecycle-risk.md](../03-openspec/proposal-evidence-lifecycle-risk.md) — P0 三件套（**已实现**）：`memory_reflect` 原文取证、引用驱动生命周期、写入风险标记。
- [proposal-remote-providers.md](../03-openspec/proposal-remote-providers.md) — 远端接入抽象提案（**草案**）：本地权威 + 按角色挂载的 provider（`feed`/`mirror`/`authority`/`index`）、`scope`+`forget` 进接口、`capabilities()` 声明与拒答、删除传播与孤儿、`http-json` 声明式适配器；`tencent:` 配置与 3 个工具保持兼容。
- [remote-provider-patterns-2026.md](../05-domain/remote-provider-patterns-2026.md) — 2026-11 调研：可插拔记忆后端模式的治理缺口（`forget`/`scope`）、腾讯代理型记忆的接入形态、中文社区（知乎/CSDN/腾讯云）的云上只带"人格"与事件日志实践、2026 记忆领域共识。
- [dsh-memory-hub-v0.7.md](../08-publish/dsh-memory-hub-v0.7.md) — 对外发表长文（v0.7.0）：能力全景、完整设计、11 条设计亮点、工程实测、同类系统对照、潜力与 v0.8–v1.0 路线。

## 下一步推荐工作

0. **远端接入抽象（远端协同的下一步）**：[proposal-remote-providers.md](../03-openspec/proposal-remote-providers.md) 待评审。评审通过后先做 M0（`remote/types.ts` + registry + `tencent` desugar + adapter 迁移，行为逐字不变），再决定 M1（删除传播/孤儿）与 M2（`http-json`）的优先级；`forward` 方向仍保持手动触发，避免未经同意写远端。
1. **V0.7.2 腾讯桥收尾**：面板增加腾讯桥状态卡片（status 已带 tencent/layers 字段）；在真实会话里跑一次 `memory_tencent_pull` 观察候选质量与 `max_pending_per_task` 限流（**已在真实 hub 跑通：7 条全量落 pending，游标/账本正确**，下一步观察这些候选在人审时的质量）；决定是否把 `push` 也纳入定时（当前保持手动，避免未经同意写腾讯）。发版前把测试数锁进 plugin.test（当前 17 工具）。
2. 发布 V0.7.1：升版本、跑 `npm run check`、桌面端冒烟（只读自愈、`lock.onDisk` 展示）——**代码与测试已完成，待发版**。
3. 在真实会话中验证审批**通过**路径。
4. 增加面板交互与视觉验收测试。
5. 在真实 Hub 上复核检索健康度：榜首分数分布、`min_score` 是否漂移、近重复对数；若真实条目过万，评估持久化索引快照（换 SQLite 的条件见 [search-performance.md §5](../04-development/search-performance.md)）。
6. 在真实 Hub 上复核派生索引：命中集大小与 recall、`index_candidate_limit` 的实际影响、重启复用是否稳定（实现见 [proposal-derived-index.md](../03-openspec/proposal-derived-index.md)）。
7. 观察 `min_score` / `local_boost` 上线后的预检命中与引用比例；若模型仍不读，再评估“高分命中未 `memory_get` 时拦截首次变更工具”的行为门禁。
8. 观察 `memory-hub` skill 是否被模型主动加载；若 catalog 可见但加载率低，再考虑在预检包尾加入一行 skill 提示，而不是自动注入全文。
9. 给每个子工作区补一条本地 `project:<id>` 基线知识，验证 local-first 排序。
10. 观察夜间维护：第二天检查每个 core 的 `reports/latest.md` 与 `pending/`，确认候选质量；若长期没有候选，再评估是否放宽“精确重复”或增加显式复用标签。
11. 跟踪公共目录 PR [#11187](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11187)：等待构建检查与 1 天仓库年龄门槛通过；合并后确认 `dsh-plugin-catalog` 索引收录。机制见 [catalog-submission.md](../06-operations/catalog-submission.md)。
12. 若需要官方「自动化任务」栏可见/可暂停，另行评估 DSH `schedule` 方案，并记录与内部定时器的取舍。
13. 评估 `all_cores: false` 的定时器语义，必要时改为 `core_ids` 选择，而不是 fallback-only。
14. 评估 per-core 失败重试与全局合并报告；当前保持串行和单一状态。
15. 验证 PTC `run_code` 嵌套调用与门禁边界。
16. 补充外部 CLI / 多进程共享 Hub 测试。
17. 评估索引落盘与增量重建（V0.2 方向）。
18. 评审 [server-memory-2026.md](../05-domain/server-memory-2026.md)（服务端部署 + 三级管理调研）与 [proposal-team-memory.md](../03-openspec/proposal-team-memory.md)（组内服务器草案）；方向已定为"沿用 `global/domain/project` 三级 + 服务端承载上两级 + 本地保留"，待定的是 M1 的接口细节与 token 发放方式（挂载方式见 [proposal-remote-providers.md](../03-openspec/proposal-remote-providers.md)：它就是一个 `kind: team-server` 的 `authority` provider）。


