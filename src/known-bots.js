(function (root) {
  'use strict';

  /**
   * 已知 AI Coding Agent / AI Review Agent 账号（均用小写、不含 [bot] 后缀）
   */
  const KNOWN_AI_AGENTS = {
    // GitHub Copilot
    'copilot': 'GitHub Copilot',
    'copilot-swe-agent': 'GitHub Copilot SWE Agent',
    'copilot-workspace': 'GitHub Copilot Workspace',
    'github-copilot': 'GitHub Copilot',
    'copilot-code-review': 'GitHub Copilot Review',

    // Anthropic Claude
    'claude': 'Claude',
    'claude-code': 'Claude Code',
    'claudecode': 'Claude Code',
    'anthropic-claude': 'Claude',
    'claude-ai': 'Claude',

    // OpenAI Codex / ChatGPT
    'codex': 'OpenAI Codex',
    'openai-codex': 'OpenAI Codex',
    'chatgpt-codex-connector': 'OpenAI Codex',
    'codex-bot': 'OpenAI Codex',
    'codex-agent': 'OpenAI Codex',

    // Cognition / Devin / DeepWiki
    'devin-ai-integration': 'Devin AI',
    'devin-ai-integration-staging': 'Devin AI',
    'devin-ai': 'Devin AI',
    'devin-bot': 'Devin AI',
    'devin-review': 'Devin Review',
    'devin-app': 'Devin AI',
    'devin-agent': 'Devin AI',
    'cognition-devin': 'Devin AI',
    'deepwiki': 'DeepWiki (Devin)',
    'deepwiki-bot': 'DeepWiki (Devin)',
    'devin': 'Devin AI',

    // Cursor
    'cursoragent': 'Cursor Agent',
    'cursor-agent': 'Cursor Agent',
    'cursor-bot': 'Cursor',
    'cursor-ai': 'Cursor',
    'bugbot': 'Cursor Bugbot',
    'cursor-bugbot': 'Cursor Bugbot',

    // Google Gemini / Jules
    'gemini-code-assist': 'Gemini Code Assist',
    'google-labs-jules': 'Google Jules',
    'jules-bot': 'Google Jules',
    'google-jules': 'Google Jules',

    // Factory / Droid
    'factory-droid': 'Factory Droid',
    'droid-agent': 'Factory Droid',

    // Code Review & SWE Agents
    'coderabbitai': 'CodeRabbit AI',
    'sweep-ai': 'Sweep AI',
    'sourcery-ai': 'Sourcery AI',
    'greptile-apps': 'Greptile AI',
    'qodo-merge-pro': 'Qodo Merge',
    'qodo-code-review': 'Qodo',
    'codiumai': 'CodiumAI',
    'pr-agent': 'PR-Agent',
    'ellipsis-dev': 'Ellipsis AI',
    'korbit-ai': 'Korbit AI',
    'aider-bot': 'Aider',
    'openhands-agent': 'OpenHands',
    'all-hands-bot': 'OpenHands',
    'mentatbot': 'Mentat AI',
    'mentat-ai': 'Mentat AI',
    'amazon-q-developer': 'Amazon Q Developer',
    'aws-q-developer': 'Amazon Q Developer',
    'tabnine-bot': 'Tabnine',
    'augmentcode': 'Augment Code',
    'augment-agent': 'Augment Code',
    'windsurf-bot': 'Windsurf',
    'codeium-bot': 'Codeium',
    'graphite-app': 'Graphite',
    'graphite-diamond': 'Graphite Diamond',
    'cubic-dev-ai': 'Cubic AI',
    'sentry-autofix': 'Sentry Autofix',
    'warp-agent': 'Warp Agent',
    'ampagent': 'Amp',
    'amp-agent': 'Amp',
    'amp-code': 'Amp',
    'junie-bot': 'JetBrains Junie',
    'junie-agent': 'JetBrains Junie',
    'jetbrains-junie': 'JetBrains Junie',
    'opencode-agent': 'OpenCode',
    'continue-bot': 'Continue AI',
    'cody-bot': 'Sourcegraph Cody',
    'codegen-sh': 'Codegen AI',
    'bito-code-review': 'Bito AI',
    'dosubot': 'Dosu AI',
    'gru-agent': 'Gru AI',
    'tembo-io': 'Tembo AI',
    'fine-dev': 'Fine AI',
    'marblism-ai': 'Marblism AI',
    'potpie-ai': 'Potpie AI',
    'entelligence-ai-pr-reviews': 'Entelligence AI',
    'baz-reviewer': 'Baz AI'
  };

  /**
   * 已知自动化 / CI / 依赖管理 / 机器人账号（均用小写、不含 [bot] 后缀）
   */
  const KNOWN_BOTS = {
    'dependabot': 'Dependabot',
    'dependabot-preview': 'Dependabot',
    'renovate': 'Renovate',
    'renovate-bot': 'Renovate',
    'mend-bolt': 'Mend Bolt',
    'github-actions': 'GitHub Actions',
    'web-flow': 'GitHub Web Flow',
    'actions-user': 'GitHub Actions User',
    'codecov': 'Codecov',
    'codecov-commenter': 'Codecov',
    'coveralls': 'Coveralls',
    'sonarcloud': 'SonarCloud',
    'vercel': 'Vercel',
    'netlify': 'Netlify',
    'cloudflare-workers-and-pages': 'Cloudflare',
    'render': 'Render',
    'railway-app': 'Railway',
    'fly-io': 'Fly.io',
    'greenkeeper': 'Greenkeeper',
    'snyk-bot': 'Snyk',
    'imgbot': 'ImgBot',
    'allcontributors': 'All Contributors',
    'pre-commit-ci': 'pre-commit.ci',
    'mergify': 'Mergify',
    'bors': 'Bors',
    'homu': 'Homu',
    'kodiak-hq': 'Kodiak',
    'pull': 'Pull Bot',
    'stale': 'Stale Bot',
    'release-please': 'Release Please',
    'semantic-release-bot': 'Semantic Release',
    'changeset-bot': 'Changesets',
    'changesets-bot': 'Changesets',
    'lgtm-com': 'LGTM',
    'claassistant': 'CLA Assistant',
    'google-cla': 'Google CLA',
    'linux-foundation-easycla': 'EasyCLA',
    'deepsource-autofix': 'DeepSource',
    'gitguardian': 'GitGuardian',
    'socket-security': 'Socket Security',
    'step-security-bot': 'StepSecurity',
    'copybara-service': 'Copybara',
    'chromium-autoroll': 'Chromium Autoroll',
    'skia-autoroll': 'Skia Autoroll',
    'k8s-ci-robot': 'Kubernetes CI Robot',
    'k8s-cherrypick-robot': 'Kubernetes Robot',
    'openshift-ci-robot': 'OpenShift CI Robot',
    'rustbot': 'Rustbot',
    'pytorch-bot': 'PyTorch Bot',
    'pytorchmergebot': 'PyTorch Merge Bot',
    'facebook-github-bot': 'Meta Bot',
    'meta-bot': 'Meta Bot',
    'msftbot': 'Microsoft Bot',
    'dotnet-maestro': '.NET Maestro',
    'angular-robot': 'Angular Robot',
    'vue-bot': 'Vue Bot',
    'nextjs-bot': 'Next.js Bot',
    'homebrew-bot': 'Homebrew Bot',
    'brewtestbot': 'Homebrew Test Bot',
    'conda-forge-admin': 'Conda Forge Bot',
    'conda-forge-linter': 'Conda Forge Linter',
    'depfu': 'Depfu',
    'pyup-bot': 'PyUp',
    'whitesource-bolt-for-github': 'WhiteSource',
    'codeclimate': 'Code Climate',
    'circleci': 'CircleCI',
    'travis-ci': 'Travis CI',
    'azure-pipelines': 'Azure Pipelines',
    'crowdin-bot': 'Crowdin',
    'weblate': 'Weblate',
    'transifex-integration': 'Transifex',
    'linear': 'Linear',
    'jira': 'Jira',
    'sentry-io': 'Sentry',
    'chromatic-app': 'Chromatic',
    'percy-bot': 'Percy',
    'storybook-bot': 'Storybook',
    'github-learning-lab': 'GitHub Learning Lab',
    'github-classroom': 'GitHub Classroom',
    'ghost': 'Ghost (Deleted User)'
  };

  /**
   * 当账号已被确认为 GitHub App / [bot] 时，若名称命中这些关键词，归类为 AI Agent
   */
  const AI_AGENT_SIGNAL_PATTERNS = [
    /(^|[-_])(copilot|claude|codex|devin|cursor|gemini|jules|aider|openhands|coderabbit|sourcery|greptile|sweep|qodo|codium|mentat|augment|windsurf|codeium|ellipsis|korbit|autofix|bugbot|droid|ampagent|junie)($|[-_])/,
    /(^|[-_])(ai-agent|swe-agent|coding-agent|code-agent|pr-agent|ai-review|ai-reviewer|code-assist)($|[-_])/,
    /[-_]agent$/
  ];

  /**
   * 启发式 Bot/Agent 账号命名规则（仅匹配明确词边界，避免误伤人类账号如 abbot / talbot）
   */
  const HEURISTIC_BOT_PATTERNS = [
    { regex: /\[bot\]$/i, kind: 'bot', reason: '用户名含 [bot] 后缀' },
    { regex: /^devin[-_](ai|bot|app|review|agent|integration|enterprise|staging)/i, kind: 'ai-agent', reason: '匹配 Devin 企业/定制版 App 命名' },
    { regex: /[-_](swe|ai|coding|code|pr)[-_]?agent$/i, kind: 'ai-agent', reason: '命名匹配 AI Agent 模式' },
    { regex: /[-_]agent$/i, kind: 'ai-agent', reason: '用户名以 -agent / _agent 结尾' },
    { regex: /[-_](bot|robot|automaton|automation|autoroll|auto-roll|roller)$/i, kind: 'bot', reason: '用户名匹配机器人后缀规则' },
    { regex: /^(bot|robot|ci|cd|automation|auto-merge|release)[-_]/i, kind: 'bot', reason: '用户名匹配自动化前缀规则' },
    { regex: /[-_](ci|cd)[-_](bot|robot|user|runner)$/i, kind: 'bot', reason: '用户名匹配 CI/CD 机器人模式' }
  ];

  const api = {
    KNOWN_AI_AGENTS,
    KNOWN_BOTS,
    AI_AGENT_SIGNAL_PATTERNS,
    HEURISTIC_BOT_PATTERNS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GHBS = root.GHBS || {};
    root.GHBS.knownBots = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
