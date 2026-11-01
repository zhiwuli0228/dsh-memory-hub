# Release Guide

发布由 `.github/workflows/release.yml` 自动完成：推送 `v*` tag 后，在 Windows runner 上跑 typecheck、build、test，打包 npm tarball，按需发布到 npm，并创建 GitHub Release。

## 触发方式

### 推荐：推送 tag

```sh
git tag v0.1.4
git push origin v0.1.4
```

或一次推送提交和 tag：

```sh
git push origin main --follow-tags
```

### 手动触发

GitHub → Actions → Release → Run workflow，输入已存在的 tag（例如 `v0.1.4`）。

## 发布前检查

1. `package.json` 的 `version` 必须与 tag 去掉 `v` 后完全一致；不一致时 workflow 会在第一步失败。
2. 本地跑一遍：

   ```sh
   npm run check
   ```

3. 确认 `dist/index.js` 和 `client.js` 已更新并提交。
4. 确认 `README.md`、`docs/00-project/current-state.md` 已更新。
5. 提交后打 tag；tag 指向的 commit 应包含所有发布内容。

## 配置 npm 自动发布（Trusted Publisher）

workflow 使用 npm Trusted Publisher + OIDC，不需要 `NPM_TOKEN`。前提是先在 npm 包上完成一次绑定。

### 一次性配置

1. npm CLI 需要 >= 11.5.1；workflow 会在发布前执行 `npm install -g npm@latest`。
2. 在 npm 包上绑定 GitHub Actions：
   - 网页：npmjs.com → `dsh-memory-hub` → Settings → Trusted publishing → Add GitHub Actions publisher：
     - owner/repo：`zhiwuli0228/dsh-memory-hub`
     - workflow filename：`release.yml`
     - environment：留空
   - 或 CLI（需要 2FA）：

     ```sh
     npm trust github dsh-memory-hub --file release.yml --repo zhiwuli0228/dsh-memory-hub --allow-publish -y
     ```

3. 确认绑定：

   ```sh
   npm trust list dsh-memory-hub
   ```

### workflow 行为

- `permissions: id-token: write` 让 npm CLI 获取 OIDC token。
- `npm publish --access public --provenance` 使用 OIDC 授权，并生成 provenance。
- 不需要 `NPM_TOKEN` secret，也不需要 `.npmrc`。
- 如果 npm 侧未绑定，发布会失败（`ENEEDAUTH` / `EOTP`），不会创建 GitHub Release。
- 已验证：`v0.1.4` 由 GitHub Actions 无 token 发布，npm 记录 SLSA provenance（run `41323539975`）；`v0.1.3` 同样验证过（run `41316616352`）。

### 备选：NPM_TOKEN

如果暂时不想配置 Trusted Publisher，也可以改回 `NPM_TOKEN` 方案：创建 Automation token，设为仓库 secret，并在 workflow 里写入 `.npmrc`。当前 workflow 已切换为 Trusted Publisher。

## Workflow 步骤

1. Checkout tag。
2. 校验 tag 与 `package.json` 版本。
3. `npm ci`。
4. `npm run check`（typecheck + build + test）。
5. `npm pack`，生成 `dsh-memory-hub-<version>.tgz`。
6. 升级 npm CLI，然后用 Trusted Publisher / OIDC 发布到 npm。
7. 创建 GitHub Release，自动生成 release notes，并上传 tarball。

## 权限

```yaml
permissions:
  contents: write   # 创建 Release
  id-token: write   # Trusted Publisher + npm provenance
```

## 常见失败

- **首次发布 404 / `whoami` 401**：本机 token 无效或未登录；重新 `npm login`。npm 新包不需要预先在网页创建，第一个发布账号自动成为 maintainer。
- **tag 与版本不一致**：先改 `package.json`，提交后再打 tag。
- **npm 版本已存在**：npm 不允许覆盖同版本；提升版本号后重新打 tag。
- **EOTP / 2FA**：交互式发布需要 OTP；CI 用 Trusted Publisher，或使用可绕过 2FA 的 Automation token。
- **`--provenance` 不等于发布授权**：它只生成供应链证明；授权仍靠 Trusted Publisher 或 token。
- **`npm view` 仍显示旧版本**：registry 传播通常需要 1–5 分钟；先看 workflow 日志，不要立即重复 publish。
- **jsDelivr 返回旧索引**：`@main` 有缓存；purge 对应路径后带 cache-bust 再验证。
- **lightweight tag 没被推送**：`git push --follow-tags` 不会推 lightweight tag；用 `git tag -a` 或显式 `git push origin <tag>`。
- **Windows 路径测试失败**：workflow 固定在 `windows-latest`，与插件目标平台一致；不要改成 Ubuntu。
- **Release 已存在**：`softprops/action-gh-release` 会更新已有 Release；如需全新发布请使用新 tag。
