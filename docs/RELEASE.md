# 发版与自动升级

Taoscope 采用 Tauri Updater + GitHub Releases 的免费组合：tag 一推，CI 多平台构建 + 签名 + 发布，老客户端在下次启动时会自动检查到 `latest.json`，用户点一下"install"就能就地升级。

## 一次性准备

### 1. 生成 ed25519 签名密钥

```bash
pnpm tauri signer generate -w ./taoscope.key
```

输出两个文件：

- `./taoscope.key` —— **私钥**，CI 用它给每个安装包签名。**不要进仓库**。
- `./taoscope.key.pub` —— **公钥**，要复制到 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，跟随客户端一起分发。

### 2. 把私钥写进 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| 名称 | 值 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `cat ./taoscope.key` 的完整内容（含 `untrusted comment:` 头） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成时设的密码；没设留空 |

### 3. 把公钥贴到客户端配置

打开 `src-tauri/tauri.conf.json`：

```jsonc
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/<你的-用户名>/Taoscope/releases/latest/download/latest.json"
    ],
    "pubkey": "untrusted comment: ...\n<base64 公钥>"
  }
}
```

`endpoints` 里的 `OWNER` 占位符也要改成你 GitHub 的用户名/组织名。

### 4. 把私钥离线备份

私钥一旦丢失 → 新版的签名校验会跟客户端里贴的旧公钥对不上 → **所有老用户都装不了更新**（只能让他们手动下载替换）。建议：

- 1Password / Bitwarden 加密笔记
- 离线 U 盘 / 纸质冷备份

## 每次发版

```bash
# 1. 改版本号（package.json + Cargo.toml + tauri.conf.json，三处保持一致）
pnpm version patch        # 或 minor / major
# 它会自动更新 package.json 并打一个 git tag

# 2. 同步 Rust 那两份
# 把 Cargo.toml 的 version 和 tauri.conf.json 的 version 改成同一个值
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit --amend --no-edit

# 3. 推
git push --follow-tags origin main
```

GitHub Actions 接管：

1. `release.yml` 在三平台 4 个 target（mac aarch64 / mac x86_64 / linux x86_64 / windows x86_64）并行构建；
2. `tauri-action` 用私钥签名安装包，生成 `*.sig` 和 `latest.json`；
3. 全部产物上传到一个**草稿** Release（`releaseDraft: true`）。

回到 GitHub Releases 页面：检查 assets 齐全 → 编辑 release notes → 点 **Publish release**。客户端第一次启动 / 手动点状态栏 `v?.?.?` 时会拉到新版本。

## 用户体验

- **启动时静默检查**：失败（断网、没有 release）不弹任何东西。
- **检测到新版**：StatusBar 右下角变成绿色 `v0.2.0 · install`。点击 → 下载 → 安装 → 自动重启。
- **手动检查**：随时点 StatusBar 的版本号，已是最新会 toast 提示。
- **下载中**：版本块显示 `downloading 42%`，再点不响应（避免重复下载）。
- **失败**：变成 `v?.?.? · retry`，鼠标悬停看错误消息，点一下重试。

## 注意 / 局限

- 当前未做 OS 代码签名（Apple Developer / Windows OV-EV）。第一次安装时：
  - **macOS**：用户右键 → 打开 → 同意一次。后续 in-place 更新不再触发 Gatekeeper（updater 直接替换 .app 包，不经过 quarantine 标记）。
  - **Windows**：SmartScreen 蓝色提示 → "更多信息 → 仍要运行"。
  - **Linux**：无障碍。
- `endpoints` 只指向 `releases/latest/...`。如果想做灰度（部分用户先升级），可以加多个 endpoint 并切换 URL，或在 `latest.json` 上加自定义字段，客户端读取后自己判断。
- 私网部署：把 `endpoints` 换成自家静态服务器 + `latest.json`，签名机制不变。
