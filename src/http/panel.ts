/**
 * standalone 面板（ADR-0010 S4 / §8）：总览 / 待审批 / 配置，刻意做窄。
 *
 * - 单文件内嵌（TS 模板字符串），esbuild 打进 dist——serve 无外部静态文件依赖。
 * - 纯 DOM + 原生 fetch，零框架零构建；API 与 DSH 内嵌面板**同一套端点**（硬规则：
 *   standalone 不新增任何 API 端点，数据全部来自既有 API；前缀由 serve 渲染时
 *   以 `__DMH_API_BASE__` 注入——serve 独立端口是 /api，DSH 内嵌是 /dsh-memory-hub/api）。
 * - 审批仍走三层守卫：`x-dmh-review: 1` + 同源 Origin（浏览器自动带）+ `x-dmh-token`
 *   （fixed-port 模式；token 由 serve 在渲染本页时注入 `window.__DMH_TOKEN__`）。
 * - 只读时（另一进程持有写锁）审批按钮禁用并显示原因——ADR-0010 §7。
 *
 * 注意：本文件的 JS 片段刻意不用反引号/模板字面量，避免与外层 TS 模板冲突。
 */

const PANEL_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>memory-hub panel (standalone)</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, "Segoe UI", sans-serif; margin: 0; background: #f6f7f9; color: #1c1e21; }
  header { background: #1f2937; color: #f9fafb; padding: 12px 20px; display: flex; gap: 16px; align-items: baseline; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header span { font-size: 12px; opacity: .7; }
  nav { display: flex; gap: 4px; padding: 8px 20px 0; background: #1f2937; }
  nav button { border: 0; background: transparent; color: #d1d5db; padding: 8px 14px; font-size: 13px; cursor: pointer; border-radius: 6px 6px 0 0; }
  nav button.active { background: #f6f7f9; color: #111827; font-weight: 600; }
  main { padding: 16px 20px 48px; max-width: 1080px; margin: 0 auto; }
  .banner { border-radius: 8px; padding: 10px 14px; margin: 12px 0; font-size: 13px; }
  .banner.warn { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
  .banner.ok { background: #ecfdf5; color: #065f46; border: 1px solid #10b981; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #4b5563; margin-bottom: 12px; }
  .meta code { background: #e5e7eb; border-radius: 4px; padding: 2px 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #f0f1f3; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; color: #374151; position: sticky; top: 0; }
  td.id { font-family: ui-monospace, monospace; white-space: nowrap; }
  .card { background: #fff; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  .card h3 { margin: 0 0 4px; font-size: 14px; }
  .card p { margin: 4px 0; font-size: 12.5px; color: #374151; }
  .card .tags { font-size: 11px; color: #6b7280; }
  .risk { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 8px; }
  .risk.high { background: #fee2e2; color: #991b1b; }
  .risk.med { background: #fef3c7; color: #92400e; }
  .risk.low { background: #ecfdf5; color: #065f46; }
  button.act { border: 1px solid #d1d5db; background: #fff; border-radius: 6px; padding: 4px 12px; font-size: 12.5px; cursor: pointer; }
  button.act.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  button.act.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
  button.act:disabled { opacity: .45; cursor: not-allowed; }
  .toolbar { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
  pre.config { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; max-height: 360px; }
  textarea { width: 100%; min-height: 220px; font-family: ui-monospace, monospace; font-size: 12px; border-radius: 8px; border: 1px solid #d1d5db; padding: 10px; box-sizing: border-box; }
  .toast { position: fixed; right: 16px; bottom: 16px; background: #111827; color: #f9fafb; padding: 10px 16px; border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity .2s; }
  .toast.show { opacity: 1; }
  .hidden { display: none; }
  .status-tag { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
  .status-tag.ok { background: #ecfdf5; color: #065f46; }
  .status-tag.err { background: #fee2e2; color: #991b1b; }
  .status-tag.muted { background: #e5e7eb; color: #4b5563; }
  .kind { font-family: ui-monospace, monospace; font-size: 11px; color: #6b7280; border: 1px solid #d1d5db; border-radius: 4px; padding: 0 5px; }
  h2.section { font-size: 14px; margin: 18px 0 8px; }
  .section-hint { font-size: 11.5px; color: #6b7280; margin: 0 0 8px; }
</style>
</head>
<body>
<header>
  <h1>memory-hub panel</h1>
  <span>standalone &middot; <span id="ver"></span></span>
</header>
<nav>
  <button id="tab-overview" class="active" onclick="show('overview')">总览</button>
  <button id="tab-pending" onclick="show('pending')">待审批 <span id="pending-count"></span></button>
  <button id="tab-config" onclick="show('config')">配置</button>
</nav>
<main>
  <div id="banner"></div>

  <section id="view-overview">
    <div class="meta" id="meta"></div>
    <table>
      <thead><tr><th>ID</th><th>类型</th><th>作用域</th><th>标题</th><th>更新</th><th>最近引用</th><th>时效</th></tr></thead>
      <tbody id="knowledge-rows"></tbody>
    </table>
  </section>

  <section id="view-pending" class="hidden">
    <div class="toolbar">
      <button class="act primary" id="btn-approve" onclick="bulk('approve')">批准选中</button>
      <button class="act danger" id="btn-reject" onclick="bulk('reject')">拒绝选中</button>
      <span id="review-note" style="font-size:12px;color:#6b7280"></span>
    </div>
    <div id="pending-list"></div>
  </section>

  <section id="view-config" class="hidden">
    <h2 class="section">远端记忆（S7：状态只读展示）</h2>
    <p class="section-hint">角色：feed 拉远端候选（绝不自动入库）· mirror 分发本地知识。同步/作废传播走模型工具 memory_remote_sync / memory_remote_forget，本页只展示状态；remote 段可在下方 JSON 编辑后保存。</p>
    <div id="remote-status"></div>
    <p style="font-size:12.5px;color:#4b5563">只读视图；remote 段可编辑后保存（走与 DSH 面板同一份 updateConfig 校验）。</p>
    <pre class="config" id="config-json"></pre>
    <textarea id="config-remote" spellcheck="false"></textarea>
    <div class="toolbar">
      <button class="act primary" id="btn-save-config" onclick="saveConfig()">保存 remote 配置</button>
    </div>
  </section>
</main>
<div class="toast" id="toast"></div>
<script>
window.__DMH_TOKEN__ = '__DMH_WRITE_TOKEN__';
var API_BASE = '__DMH_API_BASE__';

function toast(text) {
  var el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2600);
}

function api(path, options) {
  options = options || {};
  var headers = { 'content-type': 'application/json' };
  if (options.review) headers['x-dmh-review'] = '1';
  if (window.__DMH_TOKEN__) headers['x-dmh-token'] = window.__DMH_TOKEN__;
  return fetch(path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).then(function (response) {
    return response.json().then(function (payload) {
      return { status: response.status, payload: payload };
    });
  });
}

var overview = null;
var config = null;

function esc(text) {
  var div = document.createElement('div');
  div.textContent = String(text == null ? '' : text);
  return div.innerHTML;
}

function show(name) {
  ['overview', 'pending', 'config'].forEach(function (tab) {
    document.getElementById('view-' + tab).classList.toggle('hidden', tab !== name);
    document.getElementById('tab-' + tab).classList.toggle('active', tab === name);
  });
  if (name === 'pending') loadPending();
  if (name === 'config') loadConfig();
}

function banner(payload) {
  var el = document.getElementById('banner');
  if (payload.readOnly === true) {
    var reason = payload.readOnlyReason || '另一进程持有写锁';
    el.innerHTML = '<div class="banner warn">只读模式：' + esc(reason) + '（审批已禁用；另一进程写完后会自动解除）</div>';
  } else {
    el.innerHTML = '<div class="banner ok">可写</div>';
  }
}

function loadOverview() {
  return api(API_BASE + '/overview').then(function (result) {
    overview = result.payload;
    document.getElementById('ver').textContent = overview.version || '';
    banner(overview);
    var lock = overview.lock || {};
    document.getElementById('meta').innerHTML =
      '<code>root: ' + esc(overview.root) + '</code>' +
      '<code>knowledge: ' + esc((overview.knowledge || []).length) + '</code>' +
      '<code>pending: ' + esc(overview.pendingTotal) + '</code>' +
      (lock.expiresAt ? '<code>lock expires: ' + esc(lock.expiresAt) + '</code>' : '') +
      (overview.error ? '<code>error: ' + esc(overview.error) + '</code>' : '');
    var rows = (overview.knowledge || []).map(function (row) {
      var temporal = row.temporal && row.temporal.state ? row.temporal.state : '';
      return '<tr><td class="id">' + esc(row.id) + '@' + esc(row.version) + '</td>' +
        '<td>' + esc(row.type) + '</td>' +
        '<td>' + esc(row.scope) + '</td>' +
        '<td>' + esc(row.title) + '</td>' +
        '<td>' + esc((row.updatedAt || '').slice(0, 10)) + '</td>' +
        '<td>' + esc((row.lastCitedAt || '').slice(0, 10) || '-') + '</td>' +
        '<td>' + esc(temporal) + '</td></tr>';
    });
    document.getElementById('knowledge-rows').innerHTML = rows.join('');
    document.getElementById('pending-count').textContent = overview.pendingTotal ? '(' + overview.pendingTotal + ')' : '';
  }).catch(function (error) { toast('加载失败: ' + error); });
}

function loadPending() {
  var writable = overview && overview.readOnly === false;
  ['btn-approve', 'btn-reject'].forEach(function (id) {
    document.getElementById(id).disabled = !writable;
  });
  document.getElementById('review-note').textContent = writable
    ? '批准动作即人工点击；账本记 panel:human。'
    : '只读模式（另一进程持有写锁），审批已禁用。';
  var list = (overview && overview.pending) || [];
  if (list.length === 0) {
    document.getElementById('pending-list').innerHTML = '<div class="card"><p>没有待审批候选。</p></div>';
    return;
  }
  var cards = list.map(function (proposal) {
    var riskClass = proposal.risk && proposal.risk.level === 'high' ? 'high' : (proposal.risk && proposal.risk.level === 'medium' ? 'med' : 'low');
    var riskText = proposal.risk ? proposal.risk.level + (proposal.risk.reasons && proposal.risk.reasons.length ? ' · ' + proposal.risk.reasons.join('; ') : '') : '';
    return '<div class="card">' +
      '<h3><input type="checkbox" class="pick" value="' + esc(proposal.id) + '"> ' + esc(proposal.title) +
      '<span class="risk ' + riskClass + '">' + esc(riskText) + '</span></h3>' +
      '<p>' + esc(proposal.summary) + '</p>' +
      '<p class="tags">' + esc(proposal.id) + ' · ' + esc(proposal.operation) + ' · ' + esc(proposal.type) + ' · ' + esc(proposal.scope) +
      (proposal.batch ? ' · batch:' + esc(proposal.batch) : '') + ' · ' + esc((proposal.createdAt || '').slice(0, 19)) + '</p>' +
      '<p><button class="act primary" onclick="reviewOne(\'approve\',\'' + esc(proposal.id) + '\')">批准</button> ' +
      '<button class="act danger" onclick="reviewOne(\'reject\',\'' + esc(proposal.id) + '\')">拒绝</button></p>' +
      '</div>';
  });
  document.getElementById('pending-list').innerHTML = cards.join('');
}

function reviewOne(action, id) {
  return api(API_BASE + '/pending', {
    method: 'POST',
    review: true,
    body: { action: action, ids: [id] },
  }).then(function (result) {
    toast(action === 'approve' ? '已批准 ' + id : '已拒绝 ' + id);
    return loadOverview();
  }).catch(function (error) { toast('操作失败: ' + error); });
}

function bulk(action) {
  var picked = Array.prototype.map.call(document.querySelectorAll('.pick:checked'), function (box) { return box.value; });
  if (picked.length === 0) { toast('先勾选候选'); return; }
  return api(API_BASE + '/pending', {
    method: 'POST',
    review: true,
    body: { action: action, ids: picked },
  }).then(function (result) {
    toast(action + ': ' + JSON.stringify(result.payload));
    return loadOverview();
  }).catch(function (error) { toast('操作失败: ' + error); });
}

function fmtTime(value) {
  return value ? String(value).slice(0, 19).replace('T', ' ') : '从未';
}

/* 远端 provider 状态卡片（S7）：纯展示快照，数据来自 GET /api/config 的 remote 段
 * （service.config() 并入 remoteStatus() 逐 provider sync 快照——与 DSH 内嵌面板同源）。 */
function renderRemote(remote) {
  var el = document.getElementById('remote-status');
  if (!remote || remote.enabled !== true) {
    el.innerHTML = '<div class="banner warn">远端 provider 未启用：在 hub 根 config.yaml 设 remote.enabled（或 tencent.enabled 兼容入口）后刷新。</div>';
    return;
  }
  var html = '';
  if (remote.validation && remote.validation.ok === false) {
    html += '<div class="banner warn">远端配置无效：' + esc((remote.validation.errors || []).join('；')) + '</div>';
  }
  var providers = remote.providers || [];
  if (providers.length === 0) {
    el.innerHTML = html + '<div class="banner warn">远端已启用但没有 provider。</div>';
    return;
  }
  html += providers.map(function (p) {
    var tag = p.enabled !== true
      ? '<span class="status-tag muted">已停用</span>'
      : (p.ready === true ? '<span class="status-tag ok">正常</span>' : '<span class="status-tag err">不可用</span>');
    var sync = p.sync || {};
    return '<div class="card"><h3><code>' + esc(p.id) + '</code> <span class="kind">' + esc(p.kind) + '</span>' + tag + '</h3>' +
      (p.error ? '<p style="color:#991b1b">' + esc(p.error) + '</p>' : '') +
      '<p class="tags">角色: ' + esc((p.roles || []).join(' / ')) + '</p>' +
      '<p>待传播 ' + esc(sync.pendingForget || 0) + ' · 孤儿 ' + esc(sync.orphans || 0) + ' · 待重放 ' + esc(sync.outboxPending || 0) + ' · 已镜像 ' + esc(sync.mirrored || 0) + '</p>' +
      '<p class="tags">上次 pull ' + esc(fmtTime(sync.lastPullAt)) + ' · 上次 push ' + esc(fmtTime(sync.lastPushAt)) + ' · 上次作废传播 ' + esc(fmtTime(sync.lastForgetAt)) + '</p>' +
      (sync.lastError ? '<p style="color:#92400e">上次错误: ' + esc(sync.lastError) + '</p>' : '') +
      '</div>';
  }).join('');
  el.innerHTML = html;
}

function loadConfig() {
  return api(API_BASE + '/config').then(function (result) {
    config = result.payload;
    document.getElementById('config-json').textContent = JSON.stringify(config, null, 2);
    document.getElementById('config-remote').value = JSON.stringify(config.remote || {}, null, 2);
    renderRemote(config.remote);
  }).catch(function (error) { toast('加载配置失败: ' + error); });
}

function saveConfig() {
  var remote;
  try {
    remote = JSON.parse(document.getElementById('config-remote').value);
  } catch (error) {
    toast('remote JSON 不合法: ' + error.message);
    return;
  }
  return api(API_BASE + '/config', {
    method: 'POST',
    body: { remote: remote },
  }).then(function (result) {
    toast(result.status === 200 ? '已保存' : '保存失败: ' + JSON.stringify(result.payload));
    return loadConfig();
  }).catch(function (error) { toast('保存失败: ' + error); });
}

loadOverview();
</script>
</body>
</html>
`

/**
 * 渲染面板：把 token 与 API 前缀注入占位符（serve 专用；同源页面可读，跨源脚本读不到）。
 * apiBase 是 API 端点前缀（serve='/' 时为 '/api'；DSH 内嵌为 '/dsh-memory-hub/api'）。
 */
export function renderPanelHtml(token: string, apiBase: string): string {
  const withApi = PANEL_TEMPLATE.split('__DMH_API_BASE__').join(apiBase)
  return withApi.split('__DMH_WRITE_TOKEN__').join(token)
}
