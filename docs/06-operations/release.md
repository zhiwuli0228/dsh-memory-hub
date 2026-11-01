# Release Guide

发布由 `.github/workflows/release.yml` 自动完成：推送 `v*` tag 后，在 Windows runner 上跑 typecheck、build、test，打包 npm tarball，按需发布到 npm，并创建 GitHub Release。

## 触发方式

### 推荐：推送 tag

```sh
git tag v0.1.3
git push origin v0.1.3
```

或一次推送提交和 tag：

```sh
git push origin main --follow-tags
```

### 手动触发

GitHub → Actions → Release → Run workflow，输入已存在的 tag（例如 `v0.1.3`）。

## 发布前检查

1. `package.json` 的 `version` 必须与 tag 去掉 `v` 后完全一致；不一致时 workflow 会在第一步失败。
2. 本地跑一遍：

   ```sh
   npm run check
   ```

3. 确认 `dist/index.js` 和 `client.js` 已更新并提交。
4. 确认 `README.md`、`docs/00-project/current-state.md` 已更新。
5. 提交后打 tag；tag 指向的 commit 应包含所有发布内容。

## 配置 npm 自动发布（可选）

不配置 `NPM_TOKEN` 时，workflow 仍会创建 GitHub Release 并附上 tarball，只是跳过 npm 发布。

配置步骤：

1. 在 npm 创建 **Granular Access Token**：
   - 包权限：`dsh-memory-hub` 的 Read and write；
   - 勾选 **Bypass 2FA**（Automation token）；
   - 设置合理的过期时间。
2. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret：
   - Name: `NPM_TOKEN`
   - Value: 上一步的 token
3. 重新推送 tag，workflow 会执行：

   ```sh
   npm publish --access public --provenance
   ```

   发布步骤只在存在 `NPM_TOKEN` 时运行，并临时写入 `.npmrc`（发布后删除）；不要把 `.npmrc` 提交到仓库。

`--provenance` 使用 GitHub OIDC（workflow 已声明 `id-token: write`），生成可验证的供应链证明。若 npm 端或 token 不支持 provenance，可去掉该参数。

### Trusted Publisher（可选，仍需一次性配置）

**`--provenance` 不等于 Trusted Publisher。** 前者只生成供应链证明；后者是 npm 侧的发布授权方式，需要把包绑定到具体仓库和 workflow：

1. npmjs.com → `dsh-memory-hub` → Settings → Trusted publishing → Add GitHub Actions publisher：
   - owner/repo：`zhiwuli0228/dsh-memory-hub`
   - workflow filename：`release.yml`
   - environment：可留空
2. workflow 保留 `id-token: write`，但删除 `NPM_TOKEN` / `.npmrc` 相关步骤。
3. npm CLI 需要 >= 11.5.1；Node 22 自带 npm 10，需要在 workflow 里执行 `npm install -g npm@latest`。
4. 之后 `npm publish --access public --provenance` 使用 OIDC，不需要 `NPM_TOKEN`。

当前仓库**没有配置 Trusted Publisher**，仍使用 `NPM_TOKEN`；未配置 secret 时 npm 发布步骤会被跳过。

## Workflow 步骤

1. Checkout tag。
2. 校验 tag 与 `package.json` 版本。
3. `npm ci`。
4. `npm run check`（typecheck + build + test）。
5. `npm pack`，生成 `dsh-memory-hub-<version>.tgz`。
6. 如果存在 `NPM_TOKEN`：发布到 npm。
7. 创建 GitHub Release，自动生成 release notes，并上传 tarball。

## 权限

```yaml
permissions:
  contents: write   # 创建 Release
  id-token: write   # npm provenance
```

## 常见失败

- **tag 与版本不一致**：先改 `package.json`，提交后再打 tag。
- **npm 版本已存在**：npm 不允许覆盖同版本；提升版本号后重新打 tag。
- **EOTP / 2FA**：`NPM_TOKEN` 必须是可绕过 2FA 的 Automation token。
- **Windows 路径测试失败**：workflow 固定在 `windows-latest`，与插件目标平台一致；不要改成 Ubuntu。
- **Release 已存在**：`softprops/action-gh-release` 会更新已有 Release；如需全新发布请使用新 tag。
