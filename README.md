# git-blame-ai

> Separate **human contributors** from autonomous **Bot & AI Agent accounts** in GitHub Contributions.
>
> *Humans using AI tools is totally fine — the insight is still human. `git-blame-ai` simply separates autonomous bot/agent accounts from human contributors so you can see who's actually building a repo.*

**中文简介**：在 GitHub 的 **Contributors 贡献榜** 与 **仓库侧边栏 Contributors** 中，清晰区分 **人类账号** 与 **独立运行的 Bot / AI Agent 账号**（如 `claude`、`devin-ai-integration[bot]`、`copilot-swe-agent[bot]`、`codex`、`dependabot[bot]`、`renovate[bot]` 等）。

> **核心理念**：如今人类开发者普遍会借助 AI 写代码，这完全没问题——**人驱动机器产出，核心依然是人的 insight**。本插件并不是“反 AI”，而是把独立的机器人 / Agent 账号从人类贡献榜中剥离，让仓库的真实人类骨架与自动化机器占比一目了然。

---

## Features / 功能特性

- **Insights → Contributors (`/graphs/contributors`) — 全量数据驱动 · 人类优先**
  - 直接读取仓库全量 Top 100 贡献数据，首屏即锁定准确的 **人类 / AI Agent / Bot 人数与提交占比**（含极简占比条），不再因下滑懒加载而数字乱跳或页面抖动
  - 默认以 **人类主榜** 展示真实维护者（排名受 Bot 影响时清晰标注 `人类 #1`，不与总榜排名混淆），并在顶部提供一条紧凑可展开的 **AI Agent & Bot 剥离摘要条**
  - 切换到 `Bot / Agent` Tab 时，直接基于全量数据渲染所有 Bot / AI Agent 卡片及周提交趋势图（无需滚动等待懒加载）
- **Repo Sidebar Contributors（仓库主页右侧栏）**
  - 零冗余设计：标题行右侧极简切换（`前排已隐藏 N · 显示`），底部同步展示与贡献榜一致的全仓库占比条与链接
- **Multi-layer Detection + Manual Override（精准识别 + 手动覆写）**
  - **GitHub 原生强信号**：`/apps/...` 链接、`[bot]` 后缀、GitHub App 专属头像通道（`avatars.githubusercontent.com/in/...`）、`author:app/...`
  - **内置 AI Agent & Bot 库**：Copilot (`copilot-swe-agent`)、Devin (`devin-ai-integration` / `devin-review` / `deepwiki`)、Claude、Codex、Cursor (`cursoragent` / `bugbot`)、Gemini / Jules、CodeRabbit、Factory Droid、OpenHands、Dependabot、Renovate、GitHub Actions 等
  - **一键纠偏**：悬停卡片或列表行点击「标为 Bot / 标为人类 / 重置」，或直接在插件弹窗维护自定义名单及通配符/正则规则

## Install / 安装方式

Zero build step required — load directly in any Chromium browser (Chrome / Edge / Arc / Brave):

1. Clone this repository:
   ```bash
   git clone https://github.com/blueberrycongee/git-blame-ai.git
   ```
2. Open `chrome://extensions` (or `edge://extensions` / `arc://extensions`).
3. Enable **Developer mode** (开发者模式).
4. Click **Load unpacked** (加载已解压的扩展程序) and select the `git-blame-ai` directory.
5. Visit any GitHub repository's **Insights → Contributors** page!

## Development & Tests

```bash
node --test tests/*.test.js
```

## License

[MIT](LICENSE)
