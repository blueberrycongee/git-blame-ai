(function (root) {
  'use strict';

  const knownBots =
    typeof module !== 'undefined' && module.exports
      ? require('./known-bots.js')
      : (root.GHBS && root.GHBS.knownBots) || {};

  const KNOWN_AI_AGENTS = knownBots.KNOWN_AI_AGENTS || {};
  const KNOWN_BOTS = knownBots.KNOWN_BOTS || {};
  const AI_AGENT_SIGNAL_PATTERNS = knownBots.AI_AGENT_SIGNAL_PATTERNS || [];
  const HEURISTIC_BOT_PATTERNS = knownBots.HEURISTIC_BOT_PATTERNS || [];

  /**
   * 从原始文本或 URL 提取标准化的 GitHub 登录名
   */
  function normalizeLogin(raw, href) {
    let login = (raw || '').trim();

    if (!login && href) {
      login = extractLoginFromHref(href);
    }

    if (login.startsWith('@')) {
      login = login.slice(1);
    }

    // 处理类似 "apps/dependabot" 或 URL
    if (login.includes('/')) {
      const fromUrl = extractLoginFromHref(login);
      if (fromUrl) login = fromUrl;
    }

    // 保留原始显示名，同时把带空格的 git 作者名（如 "Devin AI" / "Claude Code"）规范化为连字符形式
    const display = login.replace(/\s+/g, ' ').trim();
    const lower = display.toLowerCase().replace(/\s+/g, '-');
    const baseLogin = lower.endsWith('[bot]') ? lower.slice(0, -5) : lower;

    return {
      display,
      login: lower,
      baseLogin
    };
  }

  /**
   * 从 GitHub 链接中提取用户名或 App 名称
   */
  function extractLoginFromHref(href) {
    if (!href || typeof href !== 'string') return '';
    try {
      const url = new URL(href, 'https://github.com');
      const path = url.pathname.replace(/\/+$/, '');

      // /apps/<app-name>
      const appMatch = path.match(/^\/apps\/([^/]+)$/);
      if (appMatch) {
        return decodeURIComponent(appMatch[1]) + '[bot]';
      }

      // ?author=<login>（commits 筛选链接）
      const authorParam = url.searchParams.get('author');
      if (authorParam) {
        return authorParam.trim();
      }

      // /<owner>/<repo>/commits?author=<login> 已在上面处理
      // /<login> 单段路径（排除 GitHub 保留路径）
      const singleMatch = path.match(/^\/([^/]+)$/);
      if (singleMatch) {
        const seg = decodeURIComponent(singleMatch[1]);
        const reserved = new Set([
          'apps', 'orgs', 'topics', 'explore', 'marketplace', 'features',
          'settings', 'notifications', 'pulls', 'issues', 'search', 'login',
          'signup', 'sponsors', 'pricing', 'about', 'enterprise', 'team'
        ]);
        if (!reserved.has(seg.toLowerCase())) {
          return seg;
        }
      }
    } catch (_) {
      return '';
    }
    return '';
  }

  function isAppUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    return /(?:^https?:\/\/github\.com)?\/apps\/[^/?#]+/i.test(urlStr);
  }

  function isAppAvatarUrl(src) {
    if (!src || typeof src !== 'string') return false;
    // GitHub App / Bot 安装头像路径格式：avatars.githubusercontent.com/in/<id>
    return /avatars\.githubusercontent\.com\/in\/\d+/i.test(src);
  }

  function looksLikeAiAgent(baseLogin) {
    if (!baseLogin) return false;
    if (KNOWN_AI_AGENTS[baseLogin]) return true;
    return AI_AGENT_SIGNAL_PATTERNS.some((re) => re.test(baseLogin));
  }

  /**
   * 将用户自定义通配符或 /regex/ 字符串转为测试函数
   */
  function matchesCustomPattern(login, baseLogin, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) return null;

    for (const rawPattern of patterns) {
      const pattern = (rawPattern || '').trim();
      if (!pattern) continue;

      try {
        let regex;
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
          const lastSlash = pattern.lastIndexOf('/');
          const body = pattern.slice(1, lastSlash);
          const flags = pattern.slice(lastSlash + 1) || 'i';
          regex = new RegExp(body, flags);
        } else {
          // Glob 通配符支持 * 和 ?
          const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          regex = new RegExp('^' + escaped + '$', 'i');
        }

        if (regex.test(login) || regex.test(baseLogin)) {
          return pattern;
        }
      } catch (_) {
        // 忽略无效正则
      }
    }
    return null;
  }

  /**
   * 核心分类函数：判断单个 GitHub 账号是人类、AI Agent 还是普通 Bot
   *
   * @param {Object} input
   * @param {string} [input.login]
   * @param {string} [input.href]
   * @param {string} [input.avatarSrc]
   * @param {string} [input.hovercardType]
   * @param {string} [input.hovercardUrl]
   * @param {boolean} [input.hasBotBadge]
   * @param {Object} [settings]
   */
  function classifyAccount(input, settings) {
    const cfg = Object.assign(
      {
        detectHeuristics: true,
        distinguishAiAgent: true,
        customBots: [],
        customHumans: [],
        customPatterns: []
      },
      settings || {}
    );

    const norm = normalizeLogin(input && input.login, input && input.href);
    const login = norm.login;
    const baseLogin = norm.baseLogin;
    const display = norm.display || baseLogin || 'unknown';

    const customHumans = new Set((cfg.customHumans || []).map((s) => normalizeLogin(s).baseLogin).filter(Boolean));
    const customBots = new Set((cfg.customBots || []).map((s) => normalizeLogin(s).baseLogin).filter(Boolean));

    const makeResult = (isBot, rawKind, label, reason, source, overridden) => {
      let kind = rawKind;
      let finalLabel = label;
      if (isBot && !cfg.distinguishAiAgent) {
        kind = 'bot';
        finalLabel = 'Bot';
      }
      return {
        display,
        login,
        baseLogin,
        isBot,
        kind,
        label: finalLabel,
        reason,
        source,
        overridden: Boolean(overridden)
      };
    };

    // 1. 用户手动覆盖（最高优先级）
    if (baseLogin && customHumans.has(baseLogin)) {
      return makeResult(false, 'human', '人类', '已由你手动标记为人类账号', 'override-human', true);
    }
    if (baseLogin && customBots.has(baseLogin)) {
      const isAi = looksLikeAiAgent(baseLogin);
      return makeResult(
        true,
        isAi ? 'ai-agent' : 'bot',
        isAi ? 'AI Agent' : 'Bot',
        '已由你手动标记为 Bot / Agent',
        'override-bot',
        true
      );
    }

    // 2. 用户自定义正则/通配符规则
    if (login || baseLogin) {
      const matchedPattern = matchesCustomPattern(login, baseLogin, cfg.customPatterns);
      if (matchedPattern) {
        const isAi = looksLikeAiAgent(baseLogin);
        return makeResult(
          true,
          isAi ? 'ai-agent' : 'bot',
          isAi ? 'AI Agent' : 'Bot',
          `匹配自定义规则: ${matchedPattern}`,
          'custom-pattern',
          false
        );
      }
    }

    // 3. GitHub 原生强信号（零误判）
    const hrefIsApp = isAppUrl(input && input.href) || isAppUrl(input && input.hovercardUrl);
    const hoverIsApp =
      input &&
      typeof input.hovercardType === 'string' &&
      (input.hovercardType.toLowerCase() === 'app' || input.hovercardType.toLowerCase() === 'bot');
    const hasBotSuffix = login.endsWith('[bot]');
    const avatarIsApp = isAppAvatarUrl(input && input.avatarSrc);
    const hasDomBadge = Boolean(input && input.hasBotBadge);

    if (hrefIsApp || hoverIsApp || hasBotSuffix || avatarIsApp || hasDomBadge) {
      const aiName = KNOWN_AI_AGENTS[baseLogin];
      const botName = KNOWN_BOTS[baseLogin];
      const isAi = Boolean(aiName) || looksLikeAiAgent(baseLogin);

      let source = 'github-app';
      let reason = 'GitHub App / Bot 账号';
      if (hasBotSuffix) {
        source = 'bot-suffix';
        reason = 'GitHub 官方 [bot] 账号';
      } else if (hrefIsApp || hoverIsApp) {
        source = 'github-app';
        reason = '链接指向 GitHub App (/apps/...)';
      } else if (avatarIsApp) {
        source = 'avatar-app';
        reason = '使用 GitHub App 专属头像通道 (/in/)';
      } else if (hasDomBadge) {
        source = 'dom-badge';
        reason = 'GitHub 页面已标注 bot/app 徽章';
      }

      if (aiName) {
        reason = `已知 AI Agent (${aiName}) · ${reason}`;
      } else if (botName) {
        reason = `已知机器人 (${botName}) · ${reason}`;
      }

      return makeResult(true, isAi ? 'ai-agent' : 'bot', isAi ? 'AI Agent' : 'Bot', reason, source, false);
    }

    // 4. 已知 AI Agent 账号库
    if (baseLogin && KNOWN_AI_AGENTS[baseLogin]) {
      return makeResult(
        true,
        'ai-agent',
        'AI Agent',
        `已知 AI Coding Agent (${KNOWN_AI_AGENTS[baseLogin]})`,
        'known-ai-agent',
        false
      );
    }

    // 5. 已知自动化 Bot 账号库
    if (baseLogin && KNOWN_BOTS[baseLogin]) {
      return makeResult(
        true,
        'bot',
        'Bot',
        `已知自动化机器人 (${KNOWN_BOTS[baseLogin]})`,
        'known-bot',
        false
      );
    }

    // 6. 可选启发式命名规则
    if (cfg.detectHeuristics && (login || baseLogin)) {
      for (const rule of HEURISTIC_BOT_PATTERNS) {
        if (rule.regex.test(login) || rule.regex.test(baseLogin)) {
          const isAi = rule.kind === 'ai-agent' || looksLikeAiAgent(baseLogin);
          return makeResult(
            true,
            isAi ? 'ai-agent' : 'bot',
            isAi ? 'AI Agent' : 'Bot',
            `启发式规则：${rule.reason}`,
            'heuristic',
            false
          );
        }
      }
    }

    // 7. 默认人类
    return makeResult(false, 'human', '人类', '人类贡献者账号', 'default-human', false);
  }

  /**
   * 针对可能包含多位作者 / Co-authored-by 的条目（例如 Commit）进行综合分类
   * @param {Array<Object>} accountInputs
   * @param {Object} [settings]
   */
  function classifyAccountGroup(accountInputs, settings) {
    const cfg = Object.assign({ assistedPolicy: 'human' }, settings || {});
    const seen = new Set();
    const results = [];

    for (const item of accountInputs || []) {
      const classified = classifyAccount(item, cfg);
      const dedupeKey = classified.baseLogin || classified.display;
      if (dedupeKey && seen.has(dedupeKey)) continue;
      if (dedupeKey) seen.add(dedupeKey);
      results.push(classified);
    }

    if (results.length === 0) {
      return {
        groupKind: 'human',
        isBot: false,
        isAssisted: false,
        primary: classifyAccount({ login: '' }, cfg),
        humans: [],
        bots: [],
        all: []
      };
    }

    const humans = results.filter((r) => !r.isBot);
    const bots = results.filter((r) => r.isBot);

    if (bots.length === 0) {
      return {
        groupKind: 'human',
        isBot: false,
        isAssisted: false,
        primary: humans[0],
        humans,
        bots,
        all: results
      };
    }

    if (humans.length === 0) {
      const hasAi = bots.some((b) => b.kind === 'ai-agent');
      return {
        groupKind: hasAi ? 'ai-agent' : 'bot',
        isBot: true,
        isAssisted: false,
        primary: bots[0],
        humans,
        bots,
        all: results
      };
    }

    // 人类 + Bot/Agent 共同提交（例如 Co-authored-by: Claude / Copilot）
    const policy = cfg.assistedPolicy || 'assisted';
    if (policy === 'human') {
      return {
        groupKind: 'human',
        isBot: false,
        isAssisted: true,
        primary: humans[0],
        humans,
        bots,
        all: results
      };
    }
    if (policy === 'bot') {
      const hasAi = bots.some((b) => b.kind === 'ai-agent');
      return {
        groupKind: hasAi ? 'ai-agent' : 'bot',
        isBot: true,
        isAssisted: true,
        primary: bots[0],
        humans,
        bots,
        all: results
      };
    }

    return {
      groupKind: 'assisted',
      isBot: false,
      isAssisted: true,
      primary: bots[0],
      humans,
      bots,
      all: results
    };
  }

  /**
   * 从文本中解析数字（支持逗号、k / m 后缀，如 "1,234 commits"、"2.5k"）
   */
  function parseCompactNumber(text) {
    if (typeof text === 'number' && Number.isFinite(text)) return text;
    if (!text || typeof text !== 'string') return 0;

    const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([km])?/i);
    if (!match) return 0;

    let value = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();
    if (unit === 'k') value *= 1000;
    else if (unit === 'm') value *= 1000000;
    return Math.round(value);
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }

  const api = {
    normalizeLogin,
    extractLoginFromHref,
    isAppUrl,
    isAppAvatarUrl,
    looksLikeAiAgent,
    matchesCustomPattern,
    classifyAccount,
    classifyAccountGroup,
    parseCompactNumber,
    formatNumber
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GHBS = root.GHBS || {};
    root.GHBS.detector = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
