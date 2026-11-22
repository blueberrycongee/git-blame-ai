# git-blame-ai

> Separate **human contributors** from autonomous **Bot & AI Agent accounts** in GitHub Contributions.
>
> *Humans using AI tools is totally fine — the insight is still human. `git-blame-ai` simply separates autonomous bot/agent accounts from human contributors so you can see who's actually building a repo.*

**中文简介**：在 GitHub 的 **Contributors 贡献榜**、**仓库侧边栏 Contributors**（以及可选的 Commits / PR / Issues 列表）中，将 **人类账号** 与 **独立运行的 Bot / AI Agent 账号**（如 `devin-ai-integration[bot]`、`copilot-swe-agent[bot]`、`claude[bot]`、`dependabot[bot]`、`renovate[bot]` 等）自动分开展示。

> **核心理念**：如今人类开发者普遍会借助 AI 写代码，这完全没问题——**人驱动机器产出，核心依然是人的 insight**。本插件并不是“反 AI”，而是把独立的机器人 / Agent 账号从人类贡献榜中剥离分组，让仓库的真实人类贡献和自动化机器贡献一目了然。因此对于 `Co-authored-by`（人类 + AI 辅助）提交，默认仍归入人类贡献（仅附轻量 `AI 辅助` 标记，可在设置中自由调整）。

---

## Features / 功能特性

- **Insights → Contributors (`/graphs/contributors`)**
  - 默认以 **分组模式（Split）** 上下分离「人类贡献者」与「Bot / AI Agent 贡献者」，并给出各分组内排名
  - 实时统计双方人数、Commit 数、代码增删行数及提交占比比例条
  - 一键切换：`分组` / `仅人类` / `Bot / Agent` / `全部`
  - 使用 CSS Grid `order` 布局，不破坏 GitHub 原生时间轴拖动刷选
- **Repo Sidebar Contributors（仓库主页右侧栏）**
  - 同时适配头像网格和列表两种布局，自动插入紧凑切换与分组头
- **Commits & PR / Issues（可选）**
  - 支持 `/commits`、PR Commits、`/pulls`、`/issues` 列表页分组与筛选
  - 支持 `Co-authored-by` 识别，默认将人类主导的 AI 辅助提交保留在人类组（附 `AI 辅助` 徽章），也可在弹窗切换为单列或归入 Bot
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
node --test tests/detector.test.js
```

## License

[MIT](LICENSE)
