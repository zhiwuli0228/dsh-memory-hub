/*
 * dsh-memory-hub Web panel.
 *
 * Loaded by the Harness Client module table as the package's `./client` export.
 * Registers a sidebar entry (`sidebar.panellist`) and its central panel
 * (`main` keyed by the same id). Data comes from the Host route
 * `/dsh-memory-hub/api/overview`; memory bodies are fetched on demand.
 */
(() => {
  const loader = globalThis.window && globalThis.window.__ModuleLoader__;
  if (loader === undefined || typeof loader.load !== 'function') return;

  const PANEL_ID = 'memory-hub';
  const API_OVERVIEW = '/dsh-memory-hub/api/overview';
  const API_KNOWLEDGE = '/dsh-memory-hub/api/knowledge';
  const API_CONFIG = '/dsh-memory-hub/api/config';
  const API_HUBS = '/dsh-memory-hub/api/hubs';

  const ZH = {
    title: '记忆中枢',
    subtitle: '本地优先的长期记忆：每个回合自动预检，候选需要人工批准后才生效。',
    'tab.overview': '总览',
    'tab.knowledge': '知识',
    'tab.pending': '待审批',
    'tab.activity': '活动与策略',
    'status.live': '运行中',
    'status.readonly': '只读',
    'status.degraded': '降级',
    'status.error': '初始化失败',
    refresh: '刷新',
    retry: '重试',
    loading: '加载中…',
    error: '无法读取记忆中枢',
    'error.hint': '确认插件已启用，然后刷新页面或点击重试。',
    root: '根目录',
    version: '版本',
    generated: '数据时间',
    'stat.knowledge': '已接受知识',
    'stat.pending': '待审批候选',
    'stat.workspaces': '工作区',
    'stat.tasks': '最近任务',
    'section.capabilities': '能力',
    'section.capabilities.hint': '模型可调用的 9 个 memory_* 工具',
    'section.flow': '记忆闭环',
    'section.workspaces': '工作区',
    'section.workspaces.hint': '会话工作目录落在这些根目录内时，才使用对应的 project 作用域。',
    'workspaces.empty': '还没有工作区',
    'section.recent': '最近知识',
    'section.recent.hint': '按更新时间排序，点击“知识”查看全文。',
    'section.tasks': '最近任务',
    'section.pending.hint': '候选只在 pending/ 中；提交必须经过 DSH 审批。',
    'section.policy': '策略',
    'flow.1': '用户回合',
    'flow.2': '自动预检',
    'flow.3': '紧凑注入',
    'flow.4': '读取 / 引用',
    'flow.5': '提出候选',
    'flow.6': '审批后生效',
    'cap.search': '检索 accepted 知识：关键词、类型、作用域、状态；返回来源路径。',
    'cap.get': '读取一条知识的全文、版本、适用范围与来源证据。',
    'cap.status': '查看根目录、工作区映射、计数、索引诊断与当前策略。',
    'cap.preflight': '手动预检；没有自动任务时创建一个可恢复的当前任务。',
    'cap.cite': '记录实际使用了哪条知识（检索命中不等于引用）。',
    'cap.propose': '创建候选写入 pending/；不会直接成为正式知识。',
    'cap.commit': '请求 DSH 审批并提交候选；审批不可用时失败关闭。',
    'cap.close': '关闭任务并给出回写评估：proposed / no_new_knowledge / needs_evidence / deferred。',
    'cap.consolidate': '管理员手动把项目知识晋升为 global 候选；幂等、不覆盖下游。',
    'knowledge.search': '搜索标题、摘要、ID…',
    'knowledge.allTypes': '全部类型',
    'knowledge.allStatuses': '全部状态',
    'knowledge.count': '条',
    'knowledge.empty': '还没有知识',
    'knowledge.emptyHint': '在对话中调用 memory_propose 创建候选，批准后就会出现在这里。',
    'knowledge.detail': '条目详情',
    'knowledge.close': '收起',
    'knowledge.body': '正文',
    'knowledge.sources': '来源',
    'knowledge.updated': '更新于',
    'knowledge.core': '核心共享',
    'pending.empty': '没有待审批候选',
    'pending.emptyHint': '新的候选会出现在这里，等待你在对话中调用 memory_commit 并批准。',
    'pending.hint': '本面板只读，不能代替 DSH 审批。请在会话中提交，或在文件系统里直接编辑 pending/。',
    'activity.empty': '还没有任务记录',
    'activity.task': '任务',
    'activity.session': '会话',
    'activity.turn': '回合',
    'activity.preflight': '预检',
    'activity.assessment': '评估',
    'activity.workspace': '工作区',
    'policy.preflight': '预检',
    'policy.gate': '门禁',
    'policy.evidence': '证据要求',
    'policy.mode': '模式',
    'policy.packTokens': '上下文预算',
    'policy.maxHits': '最多命中',
    'policy.onError': '预检故障',
    'policy.unknown': '未知工具',
    'policy.mutating': '变更工具',
    'workspace.admin': '管理员',
    'workspace.disabled': '已禁用',
    'workspace.domains': '领域',
    'badge.readonly': '只读模式',
    'approval.auto': '测试模式：memory_commit 自动提交，不弹审批；账本 approvalRef 记为 test:auto。',
    'badge.config': '配置错误',
    'badge.unregistered': '当前会话未匹配工作区',
    'tab.config': '配置',
    'tab.capabilities': '能力',
    'hub.select': '记忆仓库',
    'hub.fallback': '默认仓库',
    'config.title': '配置',
    'config.coreTitle': '核心工作区',
    'config.coreHint': '核心工作区是子工作区的逻辑分组；选择后右侧只显示该核心下的子工作区。',
    'config.noCore': '还没有核心工作区',
    'config.noCoreHint': '点击下方的表单添加第一个核心工作区。',
    'config.add': '添加',
    'config.collapse': '收起',
    'config.addCore': '添加核心工作区',
    'config.selectCore': '选择核心工作区',
    'config.subTitle': '子工作区',
    'config.subHint': '属于当前核心工作区的工作区，可以重复添加多个。',
    'config.noSub': '当前核心下还没有子工作区',
    'config.unassigned': '未分配工作区',
    'config.unassignedHint': '未归属到任何核心工作区的工作区。',
    'config.addSub': '添加子工作区',
    'config.id': '标识',
    'config.name': '名称',
    'config.root': '根目录',
    'config.domains': '领域',
    'config.admin': '管理员',
    'config.enabled': '启用',
    'config.save': '保存',
    'config.readonly': '当前为只读模式，无法保存配置。',
    'config.saved': '已保存',
    'config.error': '保存失败',
    'config.emptyId': '标识不能为空',
    'config.emptyRoot': '子工作区需要根目录',
  };

  const EN = {
    title: 'Memory Hub',
    subtitle: 'Local-first long-term memory: automatic preflight every turn; candidates need human approval.',
    'tab.overview': 'Overview',
    'tab.knowledge': 'Knowledge',
    'tab.pending': 'Pending',
    'tab.activity': 'Activity & policy',
    'tab.config': 'Config',
    'tab.capabilities': 'Capabilities',
    'hub.select': 'Memory hub',
    'hub.fallback': 'Default hub',
    'status.live': 'Live',
    'status.readonly': 'Read-only',
    'status.degraded': 'Degraded',
    'status.error': 'Not initialized',
    refresh: 'Refresh',
    retry: 'Retry',
    loading: 'Loading…',
    error: 'Cannot read the memory hub',
    'error.hint': 'Confirm the plugin is enabled, then refresh the page or retry.',
    root: 'Root',
    version: 'Version',
    generated: 'Data time',
    'stat.knowledge': 'Accepted knowledge',
    'stat.pending': 'Pending proposals',
    'stat.workspaces': 'Workspaces',
    'stat.tasks': 'Recent tasks',
    'section.capabilities': 'Capabilities',
    'section.capabilities.hint': '9 memory_* tools the model can call',
    'section.flow': 'Memory loop',
    'section.workspaces': 'Workspaces',
    'section.workspaces.hint': 'A session maps to a project scope only when its directory is inside one of these roots.',
    'workspaces.empty': 'No workspaces yet',
    'section.recent': 'Recent knowledge',
    'section.recent.hint': 'Sorted by update time; open Knowledge for the full body.',
    'section.tasks': 'Recent tasks',
    'section.pending.hint': 'Candidates live in pending/; committing always requires DSH approval.',
    'section.policy': 'Policy',
    'flow.1': 'User turn',
    'flow.2': 'Preflight',
    'flow.3': 'Compact inject',
    'flow.4': 'Read / cite',
    'flow.5': 'Propose',
    'flow.6': 'Approved',
    'cap.search': 'Search accepted knowledge by keyword, type, scope, and status; returns provenance paths.',
    'cap.get': 'Read one entry in full: body, version, applicability, and evidence.',
    'cap.status': 'Inspect root, workspace mapping, counts, index diagnostics, and policy.',
    'cap.preflight': 'Run a manual preflight; creates a recoverable task when none exists.',
    'cap.cite': 'Record which entry actually influenced the task (a search hit is not a citation).',
    'cap.propose': 'Write a candidate into pending/; it never becomes authoritative directly.',
    'cap.commit': 'Ask DSH for approval and commit the candidate; fails closed without an approver.',
    'cap.close': 'Close the task with an assessment: proposed / no_new_knowledge / needs_evidence / deferred.',
    'cap.consolidate': 'Admin-only promotion of project knowledge into global candidates; idempotent and non-destructive.',
    'knowledge.search': 'Search title, summary, id…',
    'knowledge.allTypes': 'All types',
    'knowledge.allStatuses': 'All statuses',
    'knowledge.count': 'entries',
    'knowledge.empty': 'No knowledge yet',
    'knowledge.emptyHint': 'Call memory_propose in a conversation; approved entries appear here.',
    'knowledge.detail': 'Entry detail',
    'knowledge.close': 'Close',
    'knowledge.body': 'Body',
    'knowledge.sources': 'Sources',
    'knowledge.updated': 'Updated',
    'knowledge.core': 'Core shared',
    'pending.empty': 'No pending proposals',
    'pending.emptyHint': 'New candidates appear here and wait for memory_commit plus approval.',
    'pending.hint': 'This panel is read-only and cannot replace DSH approval. Commit in a session, or edit pending/ directly.',
    'activity.empty': 'No task records yet',
    'activity.task': 'Task',
    'activity.session': 'Session',
    'activity.turn': 'Turn',
    'activity.preflight': 'Preflight',
    'activity.assessment': 'Assessment',
    'activity.workspace': 'Workspace',
    'policy.preflight': 'Preflight',
    'policy.gate': 'Gate',
    'policy.evidence': 'Evidence',
    'policy.mode': 'Mode',
    'policy.packTokens': 'Pack budget',
    'policy.maxHits': 'Max hits',
    'policy.onError': 'On preflight error',
    'policy.unknown': 'Unknown tools',
    'policy.mutating': 'Mutating tools',
    'workspace.admin': 'admin',
    'workspace.disabled': 'disabled',
    'workspace.domains': 'domains',
    'badge.readonly': 'Read-only mode',
    'approval.auto': 'Test mode: memory_commit commits without approval; the ledger records approvalRef test:auto.',
    'badge.config': 'Config error',
    'badge.unregistered': 'Current session has no workspace match',
    'config.title': 'Configuration',
    'config.coreTitle': 'Core workspaces',
    'config.coreHint': 'Core workspaces are logical groups; selecting one filters the sub-workspaces on the right.',
    'config.noCore': 'No core workspaces yet',
    'config.noCoreHint': 'Add your first core workspace using the form below.',
    'config.add': 'Add',
    'config.collapse': 'Collapse',
    'config.addCore': 'Add core workspace',
    'config.selectCore': 'Select core workspace',
    'config.subTitle': 'Sub-workspaces',
    'config.subHint': 'Workspaces belonging to the selected core workspace; add as many as you need.',
    'config.noSub': 'No sub-workspaces under this core',
    'config.unassigned': 'Unassigned workspaces',
    'config.unassignedHint': 'Workspaces not attached to any core workspace.',
    'config.addSub': 'Add sub-workspace',
    'config.id': 'Id',
    'config.name': 'Name',
    'config.root': 'Root',
    'config.domains': 'Domains',
    'config.admin': 'Admin',
    'config.enabled': 'Enabled',
    'config.save': 'Save',
    'config.readonly': 'Read-only mode; configuration cannot be saved.',
    'config.saved': 'Saved',
    'config.error': 'Save failed',
    'config.emptyId': 'Id is required',
    'config.emptyRoot': 'Sub-workspace requires a root path',
  };

  const CAPABILITIES = [
    { name: 'memory_search', key: 'cap.search' },
    { name: 'memory_get', key: 'cap.get' },
    { name: 'memory_status', key: 'cap.status' },
    { name: 'memory_preflight', key: 'cap.preflight' },
    { name: 'memory_cite', key: 'cap.cite' },
    { name: 'memory_propose', key: 'cap.propose' },
    { name: 'memory_commit', key: 'cap.commit' },
    { name: 'memory_close_task', key: 'cap.close' },
    { name: 'memory_consolidate', key: 'cap.consolidate' },
  ];

  const CSS = `
.dmh-root{height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:26px 28px 40px;box-sizing:border-box;font:13px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.dmh-shell{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
.dmh-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.dmh-title{font-size:22px;font-weight:650;letter-spacing:-.01em;margin:0}
.dmh-sub{color:var(--dsw-alias-label-secondary);font-size:13px;margin:5px 0 0;max-width:720px}
.dmh-pills{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dmh-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
.dmh-pill.ok{color:var(--dsw-alias-state-success-primary)}
.dmh-pill.warn{color:var(--dsw-alias-state-warn-primary)}
.dmh-pill.err{color:var(--dsw-alias-state-error-primary)}
.dmh-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer}
.dmh-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.dmh-btn:disabled{opacity:.5;cursor:default}
.dmh-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow:auto}
.dmh-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:9px 12px;font:inherit;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.dmh-tab:hover{color:var(--dsw-alias-label-primary)}
.dmh-tab[data-active="true"]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.dmh-banner{border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:11px 13px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dmh-banner.err{border-left-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dmh-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.dmh-stat{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:13px 14px;display:flex;flex-direction:column;gap:2px}
.dmh-stat-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.dmh-stat-value{font-size:24px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums}
.dmh-section{display:flex;flex-direction:column;gap:10px}
.dmh-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dmh-section-title{font-size:14px;font-weight:650;margin:0}
.dmh-section-hint{color:var(--dsw-alias-label-secondary);font-size:12px}
.dmh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:10px}
.dmh-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:12px 13px}
.dmh-cap{display:flex;flex-direction:column;gap:6px;min-height:92px}
.dmh-cap-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;color:var(--dsw-alias-brand-primary)}
.dmh-cap-desc{color:var(--dsw-alias-label-secondary);font-size:12px}
.dmh-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dmh-flow-step{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:999px;padding:5px 10px;font-size:12px;white-space:nowrap}
.dmh-flow-arrow{color:var(--dsw-alias-label-secondary);font-size:12px}
.dmh-two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.dmh-list{display:flex;flex-direction:column;gap:8px}
.dmh-row{display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;cursor:pointer;text-align:left;font:inherit;color:inherit}
.dmh-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dmh-row[data-selected="true"]{border-color:var(--dsw-alias-brand-primary)}
.dmh-row-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dmh-row-title{font-weight:600;font-size:13px;min-width:0}
.dmh-row-id{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dmh-row-summary{color:var(--dsw-alias-label-secondary);font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dmh-tag{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:1px 6px;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap}
.dmh-tag.ok{color:var(--dsw-alias-state-success-primary)}
.dmh-tag.warn{color:var(--dsw-alias-state-warn-primary)}
.dmh-tag.err{color:var(--dsw-alias-state-error-primary)}
.dmh-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dmh-input,.dmh-select{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 9px;font:inherit;font-size:12px;min-width:0}
.dmh-input{flex:1;min-width:180px}
.dmh-select{cursor:pointer}
.dmh-split{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.dmh-split.has-detail{grid-template-columns:minmax(0,1fr) minmax(280px,380px)}
.dmh-detail{position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:14px;display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow:auto}
.dmh-detail-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.dmh-detail-title{font-size:14px;font-weight:650;margin:0}
.dmh-meta{display:flex;flex-wrap:wrap;gap:6px}
.dmh-body{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:10px}
.dmh-empty{border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;padding:22px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dmh-empty strong{display:block;color:var(--dsw-alias-label-primary);font-size:13px;margin-bottom:4px}
.dmh-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 12px;font-size:12px}
.dmh-kv dt{color:var(--dsw-alias-label-secondary)}
.dmh-kv dd{margin:0;overflow-wrap:anywhere}
.dmh-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:11px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px}
.dmh-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.dmh-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l1);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dmh-spin .8s linear infinite}
@keyframes dmh-spin{to{transform:rotate(360deg)}}
.dmh-config{display:flex;flex-direction:column;gap:14px}
.dmh-config-body{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
.dmh-config-forms{display:flex;flex-direction:column;gap:14px}
.dmh-form{display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:12px 14px}
.dmh-form-row{display:flex;gap:8px;flex-wrap:wrap}
.dmh-form-actions{display:flex;justify-content:flex-end;gap:8px}
.dmh-form-checks{display:flex;gap:12px;flex-wrap:wrap}
.dmh-check{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
.dmh-check input{cursor:pointer}
.dmh-hub-select{max-width:260px}
@media (max-width:760px){.dmh-root{padding:18px 14px 30px}.dmh-two{grid-template-columns:1fr}.dmh-config-body{grid-template-columns:1fr}.dmh-split.has-detail{grid-template-columns:1fr}.dmh-detail{position:static;max-height:none}.dmh-hub-select{max-width:none}}
`;

  function formatTime(value) {
    if (typeof value !== 'string' || value === '') return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try {
      return date.toLocaleString();
    } catch {
      return value;
    }
  }

  function shortId(value) {
    if (typeof value !== 'string') return '—';
    return value.length > 12 ? `${value.slice(0, 8)}…` : value;
  }

  function statusTone(status) {
    if (status === 'accepted') return 'ok';
    if (status === 'deprecated' || status === 'superseded') return 'warn';
    if (status === 'rejected') return 'err';
    return '';
  }

  function assessmentLabel(assessment) {
    if (assessment === null || assessment === undefined) return '—';
    if (typeof assessment.kind !== 'string') return '—';
    return assessment.kind;
  }

  function createPanel(React, t) {
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState } = React;

    function useOverview(core, initialData) {
      const [state, setState] = useState(initialData
        ? { phase: 'ready', data: initialData, error: null }
        : { phase: 'loading', data: null, error: null });
      const load = useCallback(async () => {
        setState((current) => ({ ...current, phase: current.data === null ? 'loading' : 'refreshing' }));
        try {
          const url = core ? `${API_OVERVIEW}?core=${encodeURIComponent(core)}` : API_OVERVIEW;
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          setState({ phase: 'ready', data, error: null });
        } catch (error) {
          setState({ phase: 'error', data: null, error: error instanceof Error ? error.message : String(error) });
        }
      }, [core]);
      useEffect(() => {
        void load();
      }, [load]);
      return { state, load };
    }

    function useHubs() {
      const [state, setState] = useState({ phase: 'loading', cores: [], error: null });
      const load = useCallback(async () => {
        setState((current) => ({ ...current, phase: current.cores.length === 0 ? 'loading' : 'refreshing' }));
        try {
          const response = await fetch(API_HUBS, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          setState({ phase: 'ready', cores: Array.isArray(data.cores) ? data.cores : [], error: null });
        } catch (error) {
          setState({ phase: 'error', cores: [], error: error instanceof Error ? error.message : String(error) });
        }
      }, []);
      useEffect(() => { void load(); }, [load]);
      return { state, load };
    }

    function Pill(props) {
      return h('span', { className: `dmh-pill ${props.tone || ''}`.trim() }, props.children);
    }

    function Tag(props) {
      return h('span', { className: `dmh-tag ${props.tone || ''}`.trim() }, props.children);
    }

    function Stat(props) {
      return h('div', { className: 'dmh-stat' },
        h('div', { className: 'dmh-stat-label' }, props.label),
        h('div', { className: 'dmh-stat-value' }, String(props.value)));
    }

    function SectionHead(props) {
      return h('div', { className: 'dmh-section-head' },
        h('h2', { className: 'dmh-section-title' }, props.title),
        props.hint === undefined ? null : h('span', { className: 'dmh-section-hint' }, props.hint));
    }

    function Empty(props) {
      return h('div', { className: 'dmh-empty' },
        h('strong', null, props.title),
        h('span', null, props.hint));
    }

    function KnowledgeRow(props) {
      const item = props.item;
      const isCore = props.core && item.scope === `project:${props.core}`;
      const tags = [
        h(Tag, { key: 'type' }, item.type),
        h(Tag, { key: 'status', tone: statusTone(item.status) }, item.status),
        h(Tag, { key: 'scope' }, item.scope),
        isCore ? h(Tag, { key: 'core', tone: 'ok' }, t('knowledge.core')) : null,
      ];
      return h('button', {
        type: 'button',
        className: 'dmh-row',
        'data-selected': props.selected === true ? 'true' : 'false',
        onClick: () => props.onOpen(item.id),
      },
        h('div', { className: 'dmh-row-top' },
          h('span', { className: 'dmh-row-id' }, `${item.id}@v${item.version}`),
          tags),
        h('div', { className: 'dmh-row-title' }, item.title),
        h('div', { className: 'dmh-row-summary' }, item.summary),
        h('div', { className: 'dmh-row-id' }, formatTime(item.updatedAt)));
    }

    function KnowledgeDetail(props) {
      if (props.state.phase === 'loading') {
        return h('aside', { className: 'dmh-detail' }, h('span', { className: 'dmh-spin' }));
      }
      if (props.state.phase === 'error') {
        return h('aside', { className: 'dmh-detail' },
          h('div', { className: 'dmh-banner err' }, props.state.error || t('error')));
      }
      const detail = props.state.data;
      if (detail === null) return null;
      const metadata = detail.metadata || {};
      const sources = Array.isArray(metadata.sourceRefs) ? metadata.sourceRefs : [];
      return h('aside', { className: 'dmh-detail' },
        h('div', { className: 'dmh-detail-head' },
          h('h3', { className: 'dmh-detail-title' }, metadata.title || detail.path),
          h('button', { type: 'button', className: 'dmh-btn', onClick: props.onClose }, t('knowledge.close'))),
        h('div', { className: 'dmh-meta' },
          h(Tag, null, `${metadata.id || ''}@v${metadata.version ?? '?'}`),
          h(Tag, { tone: statusTone(metadata.status) }, String(metadata.status || '')),
          h(Tag, null, String(metadata.scope || '')),
          props.core && metadata.scope === `project:${props.core}`
            ? h(Tag, { tone: 'ok' }, t('knowledge.core'))
            : null),
        h('div', { className: 'dmh-row-summary' }, metadata.summary || ''),
        h('div', { className: 'dmh-section-title' }, t('knowledge.body')),
        h('pre', { className: 'dmh-body' }, detail.body || ''),
        sources.length === 0 ? null : h('div', { className: 'dmh-section' },
          h('div', { className: 'dmh-section-title' }, t('knowledge.sources')),
          h('div', { className: 'dmh-list' }, sources.map((source, index) =>
            h('div', { key: String(index), className: 'dmh-mono dmh-row-id' }, source)))),
        h('div', { className: 'dmh-row-id' }, `${t('knowledge.updated')} ${formatTime(metadata.updatedAt)}`),
        h('div', { className: 'dmh-row-id dmh-mono' }, detail.path || ''));
    }

    function OverviewTab(props) {
      const data = props.data;
      const counts = data.counts || {};
      const knowledge = Array.isArray(data.knowledge) ? data.knowledge : [];
      const pending = Array.isArray(data.pending) ? data.pending : [];
      const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];

      const capabilityTags = CAPABILITIES.map((capability) =>
        h(Tag, { key: capability.name }, capability.name));

      const flowSteps = [];
      ['1', '2', '3', '4', '5', '6'].forEach((step, index) => {
        flowSteps.push(h('span', { key: `step-${step}`, className: 'dmh-flow-step' }, t(`flow.${step}`)));
        if (index < 5) flowSteps.push(h('span', { key: `arrow-${step}`, className: 'dmh-flow-arrow' }, '→'));
      });

      const workspaceList = workspaces.length === 0
        ? h(Empty, { title: t('workspaces.empty'), hint: t('section.workspaces.hint') })
        : h('div', { className: 'dmh-list' }, workspaces.map((workspace) =>
          h('div', { key: workspace.id, className: 'dmh-card' },
            h('div', { className: 'dmh-row-top' },
              h('span', { className: 'dmh-row-title' }, workspace.id),
              workspace.admin === true ? h(Tag, { tone: 'ok' }, t('workspace.admin')) : null,
              workspace.enabled === false ? h(Tag, { tone: 'warn' }, t('workspace.disabled')) : null),
            h('div', { className: 'dmh-row-id dmh-mono' }, workspace.root),
            (workspace.domains || []).length === 0
              ? null
              : h('div', { className: 'dmh-row-id' }, `${t('workspace.domains')}: ${(workspace.domains || []).join(', ')}`))));

      const recentList = knowledge.length === 0
        ? h(Empty, { title: t('knowledge.empty'), hint: t('knowledge.emptyHint') })
        : h('div', { className: 'dmh-list' }, knowledge.slice(0, 5).map((item) =>
          h('button', {
            key: item.id,
            type: 'button',
            className: 'dmh-row',
            onClick: () => props.onOpen(item.id),
          },
            h('div', { className: 'dmh-row-top' },
              h('span', { className: 'dmh-row-id' }, `${item.id}@v${item.version}`),
              h(Tag, { tone: statusTone(item.status) }, item.status),
              h(Tag, null, item.type)),
            h('div', { className: 'dmh-row-title' }, item.title),
            h('div', { className: 'dmh-row-summary' }, item.summary))));

      return h(React.Fragment, null,
        h('div', { className: 'dmh-stats' },
          h(Stat, { label: t('stat.knowledge'), value: counts.knowledge ?? 0 }),
          h(Stat, { label: t('stat.pending'), value: counts.pending ?? 0 }),
          h(Stat, { label: t('stat.workspaces'), value: workspaces.length }),
          h(Stat, { label: t('stat.tasks'), value: tasks.length })),
        h('section', { className: 'dmh-section' },
          h(SectionHead, { title: t('section.capabilities'), hint: t('section.capabilities.hint') }),
          h('div', { className: 'dmh-meta' }, capabilityTags)),
        h('section', { className: 'dmh-section' },
          h(SectionHead, { title: t('section.flow') }),
          h('div', { className: 'dmh-flow' }, flowSteps)),
        h('div', { className: 'dmh-two' },
          h('section', { className: 'dmh-section' },
            h(SectionHead, { title: t('section.workspaces'), hint: t('section.workspaces.hint') }),
            workspaceList),
          h('section', { className: 'dmh-section' },
            h(SectionHead, { title: t('section.recent'), hint: t('section.recent.hint') }),
            recentList)),
        pending.length === 0 ? null : h('div', { className: 'dmh-banner' },
          `${pending.length} ${t('stat.pending')} · ${t('section.pending.hint')}`));
    }

    function KnowledgeTab(props) {
      const [query, setQuery] = useState('');
      const [type, setType] = useState('');
      const [status, setStatus] = useState('');
      const [selected, setSelected] = useState(null);
      const [detail, setDetail] = useState({ phase: 'idle', data: null, error: null });
      const knowledge = Array.isArray(props.data.knowledge) ? props.data.knowledge : [];
      const types = useMemo(() => [...new Set(knowledge.map((item) => item.type))].sort(), [knowledge]);
      const statuses = useMemo(() => [...new Set(knowledge.map((item) => item.status))].sort(), [knowledge]);
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return knowledge.filter((item) => {
          if (type !== '' && item.type !== type) return false;
          if (status !== '' && item.status !== status) return false;
          if (needle === '') return true;
          return `${item.id} ${item.title} ${item.summary} ${item.scope}`.toLowerCase().includes(needle);
        });
      }, [knowledge, query, type, status]);

      const open = useCallback(async (id) => {
        setSelected(id);
        setDetail({ phase: 'loading', data: null, error: null });
        try {
          const coreParam = props.core ? `&core=${encodeURIComponent(props.core)}` : '';
          const response = await fetch(`${API_KNOWLEDGE}?id=${encodeURIComponent(id)}${coreParam}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setDetail({ phase: 'ready', data: await response.json(), error: null });
        } catch (error) {
          setDetail({ phase: 'error', data: null, error: error instanceof Error ? error.message : String(error) });
        }
      }, [props.core]);

      useEffect(() => {
        if (props.openRequest !== null && typeof props.openRequest.id === 'string') {
          void open(props.openRequest.id);
        }
      }, [props.openRequest, open]);

      return h(React.Fragment, null,
        h('div', { className: 'dmh-controls' },
          h('input', {
            className: 'dmh-input',
            placeholder: t('knowledge.search'),
            value: query,
            onChange: (event) => setQuery(event.target.value),
            'aria-label': t('knowledge.search'),
          }),
          h('select', { className: 'dmh-select', value: type, onChange: (event) => setType(event.target.value), 'aria-label': t('knowledge.allTypes') },
            h('option', { value: '' }, t('knowledge.allTypes')),
            types.map((value) => h('option', { key: value, value }, value))),
          h('select', { className: 'dmh-select', value: status, onChange: (event) => setStatus(event.target.value), 'aria-label': t('knowledge.allStatuses') },
            h('option', { value: '' }, t('knowledge.allStatuses')),
            statuses.map((value) => h('option', { key: value, value }, value))),
          h('span', { className: 'dmh-section-hint' }, `${filtered.length} ${t('knowledge.count')}`)),
        filtered.length === 0
          ? h(Empty, { title: t('knowledge.empty'), hint: t('knowledge.emptyHint') })
          : h('div', { className: selected === null ? 'dmh-split' : 'dmh-split has-detail' },
            h('div', { className: 'dmh-list' }, filtered.map((item) =>
              h(KnowledgeRow, { key: item.id, item, core: props.core, selected: selected === item.id, onOpen: open }))),
            selected === null ? null : h(KnowledgeDetail, {
              state: detail,
              core: props.core,
              onClose: () => {
                setSelected(null);
                setDetail({ phase: 'idle', data: null, error: null });
              },
            })));
    }

    function PendingTab(props) {
      const pending = Array.isArray(props.data.pending) ? props.data.pending : [];
      if (pending.length === 0) {
        return h(Empty, { title: t('pending.empty'), hint: t('pending.emptyHint') });
      }
      return h(React.Fragment, null,
        h('div', { className: 'dmh-banner' }, t('pending.hint')),
        h('div', { className: 'dmh-list' }, pending.map((proposal) =>
          h('div', { key: proposal.id, className: 'dmh-card' },
            h('div', { className: 'dmh-row-top' },
              h('span', { className: 'dmh-row-id' }, proposal.id),
              h(Tag, { tone: 'warn' }, proposal.operation),
              h(Tag, null, proposal.type),
              h(Tag, null, proposal.scope)),
            h('div', { className: 'dmh-row-title' }, proposal.title),
            h('div', { className: 'dmh-row-summary' }, proposal.summary),
            h('div', { className: 'dmh-row-id dmh-mono' }, `${proposal.taskId} · ${formatTime(proposal.createdAt)}`)))));
    }

    function ActivityTab(props) {
      const data = props.data;
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const policy = data.policy || {};
      const preflight = policy.preflight || {};
      const gate = policy.gate || {};
      const evidence = policy.evidence || {};
      const required = Array.isArray(evidence.required_for) ? evidence.required_for : [];
      return h(React.Fragment, null,
        h('section', { className: 'dmh-section' },
          h(SectionHead, { title: t('section.policy') }),
          h('div', { className: 'dmh-grid' },
            h('div', { className: 'dmh-card' },
              h('div', { className: 'dmh-section-title' }, t('policy.preflight')),
              h('dl', { className: 'dmh-kv' },
                h('dt', null, t('policy.mode')), h('dd', null, String(preflight.mode || '—')),
                h('dt', null, t('policy.packTokens')), h('dd', null, String(preflight.pack_tokens ?? '—')),
                h('dt', null, t('policy.maxHits')), h('dd', null, String(preflight.max_hits ?? '—')))),
            h('div', { className: 'dmh-card' },
              h('div', { className: 'dmh-section-title' }, t('policy.gate')),
              h('dl', { className: 'dmh-kv' },
                h('dt', null, t('policy.mode')), h('dd', null, String(gate.mode || '—')),
                h('dt', null, t('policy.onError')), h('dd', null, String(gate.on_preflight_error || '—')),
                h('dt', null, t('policy.unknown')), h('dd', null, String(gate.unknown_tools || '—')))),
            h('div', { className: 'dmh-card' },
              h('div', { className: 'dmh-section-title' }, t('policy.evidence')),
              h('div', { className: 'dmh-meta' }, required.length === 0
                ? h(Tag, null, '—')
                : required.map((type) => h(Tag, { key: type }, type))))))),
        h('section', { className: 'dmh-section' },
          h(SectionHead, { title: t('section.tasks') }),
          tasks.length === 0
            ? h(Empty, { title: t('activity.empty'), hint: t('section.recent.hint') })
            : h('div', { className: 'dmh-list' }, tasks.map((task) =>
              h('div', { key: task.taskId, className: 'dmh-card' },
                h('div', { className: 'dmh-row-top' },
                  h('span', { className: 'dmh-row-id' }, task.taskId),
                  h(Tag, null, `${t('activity.turn')} ${task.turn}`),
                  task.preflight === null
                    ? h(Tag, { tone: 'warn' }, `${t('activity.preflight')} —`)
                    : h(Tag, { tone: 'ok' }, `${t('activity.preflight')} ${task.preflight.status}`),
                  h(Tag, null, `${t('activity.assessment')} ${assessmentLabel(task.assessment)}`)),
                h('div', { className: 'dmh-row-id dmh-mono' },
                  `${t('activity.session')} ${shortId(task.sessionId)} · ${t('activity.workspace')} ${task.workspaceId || '—'} · ${formatTime(task.createdAt)}`)))));
    }

    function CapabilitiesTab() {
      return h(React.Fragment, null,
        h('section', { className: 'dmh-section' },
          h(SectionHead, { title: t('section.capabilities'), hint: t('section.capabilities.hint') }),
          h('div', { className: 'dmh-grid' }, CAPABILITIES.map((capability) =>
            h('div', { key: capability.name, className: 'dmh-card dmh-cap' },
              h('div', { className: 'dmh-cap-name' }, capability.name),
              h('div', { className: 'dmh-cap-desc' }, t(capability.key)))))));
    }

    function useConfig() {
      const [state, setState] = useState({ phase: 'loading', data: null, error: null });
      const load = useCallback(async () => {
        setState((current) => ({ ...current, phase: current.data === null ? 'loading' : 'refreshing' }));
        try {
          const response = await fetch(API_CONFIG, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          setState({ phase: 'ready', data, error: null });
          return data;
        } catch (error) {
          setState({ phase: 'error', data: null, error: error instanceof Error ? error.message : String(error) });
          return null;
        }
      }, []);
      const save = useCallback(async (payload) => {
        setState((current) => ({ ...current, phase: 'saving' }));
        try {
          const response = await fetch(API_CONFIG, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
          setState({ phase: 'ready', data, error: null });
          return data;
        } catch (error) {
          setState((current) => ({ ...current, phase: current.data === null ? 'error' : 'ready', error: error instanceof Error ? error.message : String(error) }));
          throw error;
        }
      }, []);
      useEffect(() => { void load(); }, [load]);
      return { state, load, save };
    }

    function ConfigTab() {
      const { state, load, save } = useConfig();
      const data = state.data || { core_workspaces: [], workspaces: [], readOnly: false };
      const coreWorkspaces = Array.isArray(data.core_workspaces) ? data.core_workspaces : [];
      const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
      const [selectedCore, setSelectedCore] = useState('');
      const [subCore, setSubCore] = useState(null);
      const [message, setMessage] = useState(null);

      const [coreId, setCoreId] = useState('');
      const [coreName, setCoreName] = useState('');
      const [coreRoot, setCoreRoot] = useState('');
      const [subId, setSubId] = useState('');
      const [subRoot, setSubRoot] = useState('');
      const [subDomains, setSubDomains] = useState('');
      const [subAdmin, setSubAdmin] = useState(false);
      const [subEnabled, setSubEnabled] = useState(true);
      const [showCoreForm, setShowCoreForm] = useState(false);
      const [showSubForm, setShowSubForm] = useState(false);

      const activeCore = selectedCore !== '' ? selectedCore : (coreWorkspaces[0] ? coreWorkspaces[0].id : '');
      const targetCore = subCore === null ? activeCore : subCore;
      const selectedSubs = useMemo(() => workspaces.filter((w) => w.core_id === activeCore), [workspaces, activeCore]);
      const unassigned = useMemo(() => workspaces.filter((w) => !w.core_id), [workspaces]);

      useEffect(() => {
        if (selectedCore !== '' && !coreWorkspaces.some((core) => core.id === selectedCore)) {
          setSelectedCore('');
        }
      }, [coreWorkspaces, selectedCore]);

      const showMessage = (text, isError) => {
        setMessage({ text, isError });
        setTimeout(() => setMessage(null), 3000);
      };

      const handleAddCore = async (event) => {
        event.preventDefault();
        if (!coreId.trim()) {
          showMessage(t('config.emptyId'), true);
          return;
        }
        const nextCore = { id: coreId.trim(), name: coreName.trim() || coreId.trim(), root: coreRoot.trim() || undefined };
        if (coreWorkspaces.some((c) => c.id === nextCore.id)) {
          showMessage(t('config.error'), true);
          return;
        }
        try {
          await save({ core_workspaces: [...coreWorkspaces, nextCore] });
          setCoreId('');
          setCoreName('');
          setCoreRoot('');
          showMessage(t('config.saved'), false);
        } catch (error) {
          showMessage(error.message || t('config.error'), true);
        }
      };

      const handleAddSub = async (event) => {
        event.preventDefault();
        if (!subId.trim()) {
          showMessage(t('config.emptyId'), true);
          return;
        }
        if (!subRoot.trim()) {
          showMessage(t('config.emptyRoot'), true);
          return;
        }
        const nextSub = {
          id: subId.trim(),
          core_id: targetCore || null,
          root: subRoot.trim(),
          domains: subDomains.split(',').map((s) => s.trim()).filter(Boolean),
          admin: subAdmin,
          enabled: subEnabled,
        };
        if (workspaces.some((w) => w.id === nextSub.id)) {
          showMessage(t('config.error'), true);
          return;
        }
        try {
          await save({ workspaces: [...workspaces, nextSub] });
          setSubId('');
          setSubRoot('');
          setSubDomains('');
          setSubAdmin(false);
          setSubEnabled(true);
          showMessage(t('config.saved'), false);
        } catch (error) {
          showMessage(error.message || t('config.error'), true);
        }
      };

      const readOnly = data.readOnly === true;

      const coreForm = h('form', { className: 'dmh-form', onSubmit: handleAddCore },
        h('div', { className: 'dmh-form-row' },
          h('input', { className: 'dmh-input', placeholder: t('config.id'), value: coreId, onChange: (e) => setCoreId(e.target.value), required: true }),
          h('input', { className: 'dmh-input', placeholder: t('config.name'), value: coreName, onChange: (e) => setCoreName(e.target.value) })),
        h('div', { className: 'dmh-form-row' },
          h('input', { className: 'dmh-input', placeholder: t('config.root'), value: coreRoot, onChange: (e) => setCoreRoot(e.target.value) })),
        h('button', { type: 'submit', className: 'dmh-btn', disabled: readOnly || state.phase === 'saving' }, t('config.save')));

      const subForm = h('form', { className: 'dmh-form', onSubmit: handleAddSub },
        h('div', { className: 'dmh-form-row' },
          h('input', { className: 'dmh-input', placeholder: t('config.id'), value: subId, onChange: (e) => setSubId(e.target.value), required: true }),
          h('input', { className: 'dmh-input', placeholder: t('config.root'), value: subRoot, onChange: (e) => setSubRoot(e.target.value), required: true })),
        h('div', { className: 'dmh-form-row' },
          h('input', { className: 'dmh-input', placeholder: t('config.domains'), value: subDomains, onChange: (e) => setSubDomains(e.target.value) }),
          h('select', { className: 'dmh-select', value: targetCore, onChange: (e) => setSubCore(e.target.value) },
            h('option', { value: '' }, t('config.unassigned')),
            coreWorkspaces.map((core) => h('option', { key: core.id, value: core.id }, core.name || core.id)))),
        h('div', { className: 'dmh-form-checks' },
          h('label', { className: 'dmh-check' },
            h('input', { type: 'checkbox', checked: subAdmin, onChange: (e) => setSubAdmin(e.target.checked) }),
            t('config.admin')),
          h('label', { className: 'dmh-check' },
            h('input', { type: 'checkbox', checked: subEnabled, onChange: (e) => setSubEnabled(e.target.checked) }),
            t('config.enabled'))),
        h('button', { type: 'submit', className: 'dmh-btn', disabled: readOnly || state.phase === 'saving' }, t('config.add')));

      const coreSection = h('section', { className: 'dmh-section' },
        h(SectionHead, { title: t('config.coreTitle'), hint: t('config.coreHint') }),
        coreWorkspaces.length === 0
          ? h(Empty, { title: t('config.noCore'), hint: t('config.noCoreHint') })
          : h('div', { className: 'dmh-list' }, coreWorkspaces.map((core) =>
            h('button', {
              key: core.id,
              type: 'button',
              className: 'dmh-row',
              'data-selected': activeCore === core.id ? 'true' : 'false',
              onClick: () => {
                setSelectedCore(core.id);
                setSubCore(null);
              },
            },
              h('div', { className: 'dmh-row-title' }, core.name || core.id),
              h('div', { className: 'dmh-row-id dmh-mono' }, core.id),
              core.root ? h('div', { className: 'dmh-row-summary' }, core.root) : null))),
        h('div', { className: 'dmh-form-actions' },
          h('button', {
            type: 'button',
            className: 'dmh-btn',
            onClick: () => setShowCoreForm((value) => !value),
          }, showCoreForm ? t('config.collapse') : t('config.addCore'))),
        showCoreForm ? coreForm : null);

      const renderWorkspace = (workspace) => h('div', { key: workspace.id, className: 'dmh-card' },
        h('div', { className: 'dmh-row-top' },
          h('span', { className: 'dmh-row-title' }, workspace.id),
          workspace.admin === true ? h(Tag, { tone: 'ok' }, t('workspace.admin')) : null,
          workspace.enabled === false ? h(Tag, { tone: 'warn' }, t('workspace.disabled')) : null),
        h('div', { className: 'dmh-row-id dmh-mono' }, workspace.root),
        (workspace.domains || []).length === 0
          ? null
          : h('div', { className: 'dmh-row-id' }, `${t('workspace.domains')}: ${(workspace.domains || []).join(', ')}`));

      const subSection = h('section', { className: 'dmh-section' },
        h(SectionHead, { title: t('config.subTitle'), hint: t('config.subHint') }),
        selectedSubs.length === 0
          ? h(Empty, { title: t('config.noSub'), hint: t('config.unassignedHint') })
          : h('div', { className: 'dmh-list' }, selectedSubs.map(renderWorkspace)),
        h('div', { className: 'dmh-form-actions' },
          h('button', {
            type: 'button',
            className: 'dmh-btn',
            onClick: () => setShowSubForm((value) => !value),
          }, showSubForm ? t('config.collapse') : t('config.addSub'))),
        showSubForm ? subForm : null);

      const unassignedSection = h('section', { className: 'dmh-section' },
        h(SectionHead, { title: t('config.unassigned'), hint: t('config.unassignedHint') }),
        unassigned.length === 0
          ? h(Empty, { title: t('config.unassigned'), hint: t('config.unassignedHint') })
          : h('div', { className: 'dmh-list' }, unassigned.map(renderWorkspace)));

      return h('div', { className: 'dmh-config' },
        message ? h('div', { className: `dmh-banner${message.isError ? ' err' : ''}` }, message.text) : null,
        readOnly ? h('div', { className: 'dmh-banner err' }, t('config.readonly')) : null,
        h('div', { className: 'dmh-config-body' }, coreSection, subSection, unassignedSection));
    }

    function Panel(props) {
      const [selectedCore, setSelectedCore] = useState('');
      const { state, load } = useOverview(selectedCore, props && props.initialData ? props.initialData : null);
      const hubs = useHubs();
      const [tab, setTab] = useState(props && props.initialTab ? props.initialTab : 'overview');
      const [openRequest, setOpenRequest] = useState(null);
      const data = state.data;
      const error = state.error;
      const initialized = data === null ? true : data.initialized !== false;
      const readOnly = data === null ? false : data.readOnly === true;
      const configError = data === null ? null : data.configError;
      const root = data === null ? '' : data.root || '';
      const version = data === null ? '' : data.version || '';
      const generatedAt = data === null ? '' : data.generatedAt || '';
      const cores = Array.isArray(hubs.state.cores) ? hubs.state.cores : [];
      useEffect(() => {
        if (selectedCore === '' && cores.length > 0 && !cores.some((core) => core.id === selectedCore)) {
          setSelectedCore(cores[0].id);
        }
      }, [cores, selectedCore]);
      const tabs = [
        ['overview', t('tab.overview')],
        ['config', t('tab.config')],
        ['knowledge', t('tab.knowledge')],
        ['pending', t('tab.pending')],
        ['activity', t('tab.activity')],
        ['capabilities', t('tab.capabilities')],
      ];
      const hubSelector = cores.length <= 1
        ? null
        : h('select', {
            className: 'dmh-select dmh-hub-select',
            value: selectedCore,
            onChange: (event) => setSelectedCore(event.target.value),
            'aria-label': t('hub.select'),
          },
          cores.map((core) => h('option', { key: core.id, value: core.id },
            core.id === '' ? t('hub.fallback') : `${core.id} (${core.root})`)));
      return h('div', { className: 'dmh-root' },
        h('style', null, CSS),
        h('div', { className: 'dmh-shell' },
          h('header', { className: 'dmh-header' },
            h('div', null,
              h('h1', { className: 'dmh-title' }, t('title')),
              h('p', { className: 'dmh-sub' }, t('subtitle'))),
            h('div', { className: 'dmh-pills' },
              initialized
                ? (readOnly
                  ? h(Pill, { tone: 'warn' }, t('status.readonly'))
                  : h(Pill, { tone: 'ok' }, t('status.live')))
                : h(Pill, { tone: 'err' }, t('status.error')),
              hubSelector,
              h('button', {
                type: 'button',
                className: 'dmh-btn',
                onClick: () => void load(),
                disabled: state.phase === 'loading' || state.phase === 'refreshing',
              }, state.phase === 'loading' || state.phase === 'refreshing'
                ? h('span', { className: 'dmh-spin' })
                : null, t('refresh')))),
          error === null ? null : h('div', { className: 'dmh-banner err' },
            `${t('error')}: ${error} — ${t('error.hint')}`),
          initialized ? null : h('div', { className: 'dmh-banner err' },
            `${t('status.error')}: ${data && data.error ? data.error : t('error.hint')}`),
          readOnly ? h('div', { className: 'dmh-banner' }, `${t('badge.readonly')}${data && data.readOnlyReason ? `: ${data.readOnlyReason}` : ''}`) : null,
          configError ? h('div', { className: 'dmh-banner err' }, `${t('badge.config')}: ${configError}`) : null,
          data !== null && data.policy && data.policy.approval && data.policy.approval.mode === 'auto'
            ? h('div', { className: 'dmh-banner err' }, t('approval.auto'))
            : null,
          h('nav', { className: 'dmh-tabs', role: 'tablist' }, tabs.map(([id, label]) =>
            h('button', {
              key: id,
              type: 'button',
              className: 'dmh-tab',
              'data-active': tab === id ? 'true' : 'false',
              role: 'tab',
              'aria-selected': tab === id ? 'true' : 'false',
              onClick: () => setTab(id),
            }, label))),
          state.phase === 'loading' && data === null
            ? h('div', { className: 'dmh-empty' }, h('span', { className: 'dmh-spin' }), ' ', t('loading'))
            : (data === null ? null : (
              tab === 'overview' ? h(OverviewTab, {
                data,
                onOpen: (id) => {
                  setOpenRequest({ id, at: Date.now() });
                  setTab('knowledge');
                },
              })
                : tab === 'config' ? h(ConfigTab)
                  : tab === 'knowledge' ? h(KnowledgeTab, { data, openRequest, core: selectedCore })
                    : tab === 'pending' ? h(PendingTab, { data })
                      : tab === 'activity' ? h(ActivityTab, { data })
                        : h(CapabilitiesTab)
            )),
          h('footer', { className: 'dmh-footer' },
            h('span', { className: 'dmh-mono' }, root === '' ? '' : `${t('root')}: ${root}`),
            h('span', null, [
              version === '' ? null : `${t('version')} ${version}`,
              generatedAt === '' ? null : `${t('generated')} ${formatTime(generatedAt)}`,
            ].filter(Boolean).join(' · ')))));
    }

    function PanelIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20;
      const active = Boolean(props && props.active);
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.72 },
      },
        h('circle', { cx: 12, cy: 12, r: 2.6, fill: 'currentColor' }),
        h('circle', { cx: 5, cy: 5, r: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { cx: 19, cy: 5, r: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { cx: 5, cy: 19, r: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { cx: 19, cy: 19, r: 2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M10.4 10.4 6.3 6.3M13.6 10.4l4.1-4.1M10.4 13.6l-4.1 4.1M13.6 13.6l4.1 4.1', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
    }

    return { Panel, PanelIcon };
  }

  loader.load({
    id: 'dsh-memory-hub',
    factory(require) {
      let React = null;
      try {
        React = require('react');
      } catch {
        React = null;
      }
      if (React === null || typeof React.createElement !== 'function') {
        return { name: 'dsh-memory-hub', inject: [], apply() {} };
      }

      return {
        name: 'dsh-memory-hub',
        inject: ['slots', 'locale'],
        apply(ctx) {
          const locale = ctx.locale;
          const dictionaries = { zh: ZH, en: EN };
          const disposers = [];
          if (locale && typeof locale.register === 'function') {
            for (const language of ['zh', 'en']) {
              try {
                disposers.push(locale.register('dsh-memory-hub', language, dictionaries[language]));
              } catch {
                // A duplicate namespace on HMR is harmless; bind() still resolves.
              }
            }
          }
          let bound = null;
          try {
            if (locale && typeof locale.bind === 'function') bound = locale.bind('dsh-memory-hub');
          } catch {
            bound = null;
          }
          const active = () => {
            try {
              return locale && typeof locale.getLocale === 'function' ? String(locale.getLocale().active || '') : '';
            } catch {
              return '';
            }
          };
          const translate = (key) => {
            if (bound !== null) {
              try {
                const value = bound(key);
                if (typeof value === 'string' && value !== key) return value;
              } catch {
                // fall through
              }
            }
            const dictionary = active().startsWith('zh') ? ZH : EN;
            return dictionary[key] !== undefined ? dictionary[key] : (EN[key] !== undefined ? EN[key] : key);
          };
          ctx.effect(() => () => {
            for (const dispose of disposers) {
              try {
                dispose();
              } catch {
                // ignore
              }
            }
          });

          const { Panel, PanelIcon } = createPanel(React, translate);
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 50,
            label: () => translate('title'),
          }, PanelIcon));
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => ({}),
          }, Panel));
        },
      };
    },
  });
})();
