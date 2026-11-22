(function (root) {
  'use strict';

  const REPO_CONTRIB_PATH_RE = /^\/([^/]+)\/([^/]+)\/graphs\/contributors\/?$/;
  const RETRY_DELAYS_MS = [1000, 1500, 2000, 2500, 3000, 3500];

  // 按 owner/repo 缓存全量贡献者原始数据
  const repoCache = new Map();

  function parseRepoFromPath(pathname) {
    const match = String(pathname || '').match(REPO_CONTRIB_PATH_RE);
    if (!match) return null;
    return { owner: match[1], repo: match[2], key: `${match[1]}/${match[2]}`.toLowerCase() };
  }

  /**
   * 规范化单条 GitHub contributors-data 记录
   * 兼容 GitHub 内部 /graphs/contributors-data 与 REST /stats/contributors 结构
   */
  function normalizeRawEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const author = entry.author && typeof entry.author === 'object' ? entry.author : {};
    const weeks = Array.isArray(entry.weeks)
      ? entry.weeks
          .filter((w) => w && typeof w === 'object')
          .map((w) => ({
            w: Number(w.w) || 0,
            a: Number(w.a) || 0,
            d: Number(w.d) || 0,
            c: Number(w.c) || 0
          }))
      : [];

    let additions = 0;
    let deletions = 0;
    let weekCommits = 0;
    for (const wk of weeks) {
      additions += wk.a;
      deletions += wk.d;
      weekCommits += wk.c;
    }

    const total = Number(entry.total);
    const commits = Number.isFinite(total) && total > 0 ? total : weekCommits;

    const login = String(author.login || '').trim();
    const href = String(author.path || author.html_url || '').trim();
    const avatarSrc = String(author.avatar || author.avatar_url || '').trim();
    const hovercardUrl = String(author.hovercard_url || '').trim();
    const authorType = String(author.type || '').trim();

    if (!login && !href) return null;

    return {
      id: author.id || null,
      login,
      href,
      avatarSrc,
      hovercardUrl,
      hovercardType: authorType,
      commits,
      additions,
      deletions,
      weeks
    };
  }

  /**
   * 规范化并按 commits 降序排序（GitHub contributors-data 原始顺序常为升序）
   */
  function normalizeContributorsPayload(payload) {
    let rawList = null;
    if (Array.isArray(payload)) {
      rawList = payload;
    } else if (payload && Array.isArray(payload.contributors)) {
      rawList = payload.contributors;
    } else if (payload && Array.isArray(payload.data)) {
      rawList = payload.data;
    }

    if (!rawList) return [];

    const normalized = [];
    for (const item of rawList) {
      const rec = normalizeRawEntry(item);
      if (rec) normalized.push(rec);
    }

    normalized.sort((a, b) => {
      if (b.commits !== a.commits) return b.commits - a.commits;
      if (b.additions !== a.additions) return b.additions - a.additions;
      return a.login.localeCompare(b.login);
    });

    return normalized;
  }

  /**
   * 对全量贡献者记录执行分类、分组排名与占比统计
   */
  function analyzeContributors(records, settings, detectorArg) {
    const detector =
      detectorArg ||
      (typeof module !== 'undefined' && module.exports ? require('./detector.js') : root.GHBS && root.GHBS.detector);

    const list = Array.isArray(records) ? records : [];
    const all = [];
    const humans = [];
    const bots = [];
    const aiAgents = [];
    const traditionalBots = [];
    const byLogin = new Map();

    const metrics = {
      total: { commits: 0, additions: 0, deletions: 0 },
      human: { commits: 0, additions: 0, deletions: 0 },
      aiAgent: { commits: 0, additions: 0, deletions: 0 },
      bot: { commits: 0, additions: 0, deletions: 0 },
      allBots: { commits: 0, additions: 0, deletions: 0 }
    };

    const addMetrics = (bucket, rec) => {
      bucket.commits += rec.commits || 0;
      bucket.additions += rec.additions || 0;
      bucket.deletions += rec.deletions || 0;
    };

    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      const cls = detector.classifyAccount(
        {
          login: rec.login,
          href: rec.href,
          avatarSrc: rec.avatarSrc,
          hovercardType: rec.hovercardType,
          hovercardUrl: rec.hovercardUrl,
          hasBotBadge: false
        },
        settings
      );

      const enriched = {
        ...rec,
        cls,
        overallRank: i + 1,
        groupRank: 0
      };

      addMetrics(metrics.total, rec);

      if (cls.isBot) {
        bots.push(enriched);
        enriched.groupRank = bots.length;
        addMetrics(metrics.allBots, rec);
        if (cls.kind === 'ai-agent') {
          aiAgents.push(enriched);
          addMetrics(metrics.aiAgent, rec);
        } else {
          traditionalBots.push(enriched);
          addMetrics(metrics.bot, rec);
        }
      } else {
        humans.push(enriched);
        enriched.groupRank = humans.length;
        addMetrics(metrics.human, rec);
      }

      all.push(enriched);
      if (cls.baseLogin && !byLogin.has(cls.baseLogin)) {
        byLogin.set(cls.baseLogin, enriched);
      }
      if (cls.login && !byLogin.has(cls.login)) {
        byLogin.set(cls.login, enriched);
      }
    }

    const totalCommits = metrics.total.commits;
    const pct = (part) => (totalCommits > 0 ? (part / totalCommits) * 100 : 0);

    return {
      all,
      humans,
      bots,
      aiAgents,
      traditionalBots,
      byLogin,
      counts: {
        total: all.length,
        human: humans.length,
        aiAgent: aiAgents.length,
        bot: traditionalBots.length,
        totalBots: bots.length,
        assisted: 0
      },
      metrics,
      shares: {
        humanPct: pct(metrics.human.commits),
        aiAgentPct: pct(metrics.aiAgent.commits),
        botPct: pct(metrics.bot.commits),
        allBotsPct: pct(metrics.allBots.commits)
      }
    };
  }

  /**
   * 将按周数据压缩为适合紧凑柱状图绘制的柱子数组
   */
  function aggregateWeeklyBars(weeks, maxBars) {
    if (!Array.isArray(weeks) || weeks.length === 0) return [];
    const limit = maxBars || 48;

    // 去除首尾全 0 周之前先保留时间跨度一致性：只裁剪前导纯 0，让活跃期更清晰
    let firstActive = 0;
    while (firstActive < weeks.length - 1 && (weeks[firstActive].c || 0) === 0) {
      firstActive += 1;
    }
    const sliced = weeks.slice(firstActive);
    if (sliced.length === 0) return [];

    if (sliced.length <= limit) {
      return sliced.map((wk) => ({
        start: wk.w,
        end: wk.w,
        commits: wk.c || 0,
        additions: wk.a || 0,
        deletions: wk.d || 0
      }));
    }

    const bucketSize = Math.ceil(sliced.length / limit);
    const bars = [];
    for (let i = 0; i < sliced.length; i += bucketSize) {
      const chunk = sliced.slice(i, i + bucketSize);
      let commits = 0;
      let additions = 0;
      let deletions = 0;
      for (const wk of chunk) {
        commits += wk.c || 0;
        additions += wk.a || 0;
        deletions += wk.d || 0;
      }
      bars.push({
        start: chunk[0].w,
        end: chunk[chunk.length - 1].w,
        commits,
        additions,
        deletions
      });
    }
    return bars;
  }

  function getCachedRepoState(repoKey) {
    return repoCache.get(repoKey) || null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 从 GitHub 同源 /graphs/contributors-data 拉取完整 Top 100 贡献者数据
   * 自动处理 HTTP 202 异步计算重试，并通过 repoCache 去重
   */
  function ensureRepoDataLoaded(owner, repo, onUpdate) {
    const key = `${owner}/${repo}`.toLowerCase();
    const existing = repoCache.get(key);
    if (existing) {
      if (existing.status === 'loading' && typeof onUpdate === 'function') {
        existing.listeners.add(onUpdate);
      }
      return existing;
    }

    const entry = {
      key,
      owner,
      repo,
      status: 'loading', // 'loading' | 'ready' | 'error'
      records: [],
      error: null,
      listeners: new Set()
    };
    if (typeof onUpdate === 'function') entry.listeners.add(onUpdate);
    repoCache.set(key, entry);

    const notify = () => {
      for (const fn of entry.listeners) {
        try {
          fn(entry);
        } catch (_) {
          // ignore listener errors
        }
      }
    };

    const url = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/graphs/contributors-data`;

    (async () => {
      try {
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
          const resp = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
              Accept: 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            }
          });

          if (resp.status === 202) {
            if (attempt < RETRY_DELAYS_MS.length) {
              await sleep(RETRY_DELAYS_MS[attempt]);
              continue;
            }
            throw new Error('GitHub contributors-data still computing (202)');
          }

          if (resp.status === 204) {
            entry.records = [];
            entry.status = 'ready';
            notify();
            entry.listeners.clear();
            return;
          }

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }

          const contentType = resp.headers.get('content-type') || '';
          if (!contentType.includes('json')) {
            throw new Error(`Unexpected content-type: ${contentType}`);
          }

          const payload = await resp.json();
          entry.records = normalizeContributorsPayload(payload);
          entry.status = 'ready';
          notify();
          entry.listeners.clear();
          return;
        }
      } catch (err) {
        entry.status = 'error';
        entry.error = err ? String(err.message || err) : 'fetch failed';
        notify();
        entry.listeners.clear();
      }
    })();

    return entry;
  }

  const api = {
    parseRepoFromPath,
    normalizeRawEntry,
    normalizeContributorsPayload,
    analyzeContributors,
    aggregateWeeklyBars,
    getCachedRepoState,
    ensureRepoDataLoaded
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GHBS = root.GHBS || {};
    root.GHBS.contributorsData = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
