(function (root) {
  'use strict';

  const PATH_RE = /^\/[^/]+\/[^/]+\/graphs\/contributors\/?$/;
  const TOOLBAR_ID = 'ghbs-contributors-toolbar';
  const BOT_PANEL_ID = 'ghbs-contributors-bot-panel';

  let lastRepoKey = null;
  let botsPanelExpanded = false;

  function matches(pathname) {
    return PATH_RE.test(pathname);
  }

  function findListContainer() {
    const reactList = document.querySelector('ul[class*="chartList__"]');
    if (reactList) return reactList;

    const firstCommitLink = document.querySelector('main a[href*="/commits?author="]');
    if (firstCommitLink) {
      let node = firstCommitLink;
      while (node && node.parentElement && node !== document.body) {
        const parent = node.parentElement;
        if (parent.tagName === 'UL' || parent.tagName === 'OL') {
          const matching = Array.from(parent.children).filter(
            (ch) => ch.dataset.ghbsOwned !== 'true' && ch.querySelector('a[href*="/commits?author="]')
          );
          if (matching.length >= 1) return parent;
        }
        node = parent;
      }
    }

    return (
      document.querySelector('#contributors ol.contrib-data') ||
      document.querySelector('ol.contrib-data') ||
      document.querySelector('#contributors ol')
    );
  }

  function isLoadedCard(el) {
    if (!el || el.tagName !== 'LI' || el.dataset.ghbsOwned === 'true') return false;
    return Boolean(
      el.querySelector('a[href*="/commits?author="]') ||
        el.classList.contains('contrib-person') ||
        el.querySelector('h2 a[href], h3 a[href]')
    );
  }

  function extractContributorSignals(card) {
    const nameLink =
      card.querySelector('h2 a[href]') ||
      card.querySelector('h3 a.aname') ||
      card.querySelector('h3 a[href^="/apps/"]') ||
      card.querySelector('h3 a[data-hovercard-type]') ||
      Array.from(card.querySelectorAll('h3 a[href]')).find((a) => (a.textContent || '').trim().length > 0) ||
      card.querySelector('a[href^="/apps/"]') ||
      card.querySelector('a[data-hovercard-type="user"]');

    const avatarLink =
      card.querySelector('a[data-hovercard-type]') ||
      card.querySelector('a[href^="/apps/"]');

    const avatarImg =
      card.querySelector('img[data-testid="github-avatar"]') ||
      card.querySelector('img.avatar') ||
      card.querySelector('img[src*="avatars.githubusercontent.com"]');

    const commitLink = card.querySelector('a[href*="/commits?author="]');

    const botBadge = Array.from(card.querySelectorAll('span.Label, span.label, span[data-component="Label"]')).some(
      (el) => /^(bot|app)$/i.test((el.textContent || '').trim())
    );

    let login = nameLink ? (nameLink.textContent || '').trim() : '';
    const href =
      (nameLink && nameLink.getAttribute('href')) ||
      (avatarLink && avatarLink.getAttribute('href')) ||
      (commitLink && commitLink.getAttribute('href')) ||
      '';

    if (!login && avatarImg && avatarImg.alt) {
      login = avatarImg.alt.replace(/^@/, '').trim();
    }

    return {
      nameLink,
      signals: {
        login,
        href,
        avatarSrc: avatarImg ? avatarImg.getAttribute('src') || '' : '',
        hovercardType:
          (nameLink && nameLink.getAttribute('data-hovercard-type')) ||
          (avatarLink && avatarLink.getAttribute('data-hovercard-type')) ||
          '',
        hovercardUrl:
          (nameLink && nameLink.getAttribute('data-hovercard-url')) ||
          (avatarLink && avatarLink.getAttribute('data-hovercard-url')) ||
          '',
        hasBotBadge: botBadge
      }
    };
  }

  function extractCardMetrics(card, detector) {
    const commitsEl =
      card.querySelector('a[href*="/commits?author="]') ||
      card.querySelector('.cmeta a[href*="commits"]') ||
      Array.from(card.querySelectorAll('a, span')).find((el) => /\bcommits?\b/i.test(el.textContent || ''));
    const addEl = card.querySelector('.color-fg-success, .cmeta .a');
    const delEl = card.querySelector('.color-fg-danger, .cmeta .d');

    return {
      commits: commitsEl ? detector.parseCompactNumber(commitsEl.textContent || '') : 0,
      additions: addEl ? detector.parseCompactNumber(addEl.textContent || '') : 0,
      deletions: delEl ? detector.parseCompactNumber(delEl.textContent || '') : 0
    };
  }

  function cleanup() {
    const toolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    if (toolbar) toolbar.remove();

    const botPanel = document.querySelector(`[data-ghbs-id="${BOT_PANEL_ID}"]`);
    if (botPanel) botPanel.remove();

    const list = findListContainer();
    if (!list) return;

    list.classList.remove('ghbs-hidden');
    list.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    Array.from(list.children).forEach((card) => {
      card.classList.remove(
        'ghbs-item',
        'ghbs-item--human',
        'ghbs-item--bot',
        'ghbs-item--ai-agent',
        'ghbs-hidden'
      );
      card.style.removeProperty('order');
      delete card.dataset.ghbsKind;
    });
  }

  function buildRatioSummaryText(analysis, isFallback, isLoading) {
    if (isLoading) {
      return '正在获取仓库全量贡献统计…';
    }
    if (!analysis || analysis.metrics.total.commits <= 0) {
      return '';
    }

    const parts = [];
    parts.push(`人类 ${analysis.shares.humanPct.toFixed(1)}%`);

    if (analysis.counts.aiAgent > 0 && analysis.counts.bot > 0) {
      parts.push(`AI Agent ${analysis.shares.aiAgentPct.toFixed(1)}%`);
      parts.push(`Bot ${analysis.shares.botPct.toFixed(1)}%`);
    } else if (analysis.counts.aiAgent > 0) {
      parts.push(`AI Agent ${analysis.shares.aiAgentPct.toFixed(1)}%`);
    } else if (analysis.counts.bot > 0) {
      parts.push(`Bot ${analysis.shares.botPct.toFixed(1)}%`);
    }

    if (isFallback) {
      parts.push('仅统计已加载卡片');
    }

    return parts.join(' · ');
  }

  function formatBotLabel(counts) {
    const segs = [];
    if (counts.aiAgent > 0) segs.push(`${counts.aiAgent} 个 AI Agent`);
    if (counts.bot > 0) segs.push(`${counts.bot} 个 Bot`);
    return segs.join(' · ') || '0 个 Bot / Agent';
  }

  function buildBotCard(rec, repoInfo, totalRepoCommits, options) {
    const { ui, detector, contributorsData, onToggleOverride } = options;

    const card = ui.createEl('article', `ghbs-bot-card ghbs-item ghbs-item--${rec.cls.kind}`);
    card.dataset.ghbsOwned = 'true';

    // 卡片头部：头像 + 名称 + 标签 + 排名
    const head = ui.createEl('div', 'ghbs-bot-card-head');

    const profile = ui.createEl('div', 'ghbs-bot-card-profile');
    const profileHref = rec.href || (rec.login ? `/${encodeURIComponent(rec.login)}` : '#');

    if (rec.avatarSrc) {
      const avatarLink = ui.createEl('a', 'ghbs-bot-avatar-link');
      avatarLink.href = profileHref;
      const img = ui.createEl('img', 'ghbs-bot-avatar');
      img.src = rec.avatarSrc;
      img.alt = rec.cls.display;
      img.width = 36;
      img.height = 36;
      img.loading = 'lazy';
      avatarLink.appendChild(img);
      profile.appendChild(avatarLink);
    }

    const identity = ui.createEl('div', 'ghbs-bot-identity');
    const nameRow = ui.createEl('div', 'ghbs-bot-name-row');

    const nameLink = ui.createEl('a', 'ghbs-bot-name', rec.cls.display);
    nameLink.href = profileHref;
    nameRow.appendChild(nameLink);

    const badge = ui.createBadge(rec.cls, {
      allowOverride: true,
      onToggleOverride
    });
    nameRow.appendChild(badge);
    identity.appendChild(nameRow);

    // 指标行：commits + 增删行 + 全仓库占比
    const metricsRow = ui.createEl('div', 'ghbs-bot-metrics');
    const commitsHref = repoInfo
      ? `/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(repoInfo.repo)}/commits?author=${encodeURIComponent(rec.login || rec.cls.baseLogin)}`
      : profileHref;
    const commitsLink = ui.createEl(
      'a',
      'ghbs-bot-commits-link',
      `${detector.formatNumber(rec.commits)} commits`
    );
    commitsLink.href = commitsHref;
    metricsRow.appendChild(commitsLink);

    if (totalRepoCommits > 0) {
      const share = ((rec.commits / totalRepoCommits) * 100).toFixed(1);
      metricsRow.appendChild(ui.createEl('span', 'ghbs-bot-share', `(${share}%)`));
    }

    if (rec.additions > 0 || rec.deletions > 0) {
      metricsRow.appendChild(
        ui.createEl('span', 'ghbs-bot-add', `+${detector.formatNumber(rec.additions)}`)
      );
      metricsRow.appendChild(
        ui.createEl('span', 'ghbs-bot-del', `-${detector.formatNumber(rec.deletions)}`)
      );
    }

    identity.appendChild(metricsRow);
    profile.appendChild(identity);
    head.appendChild(profile);

    if (rec.overallRank > 0) {
      const rank = ui.createEl('span', 'ghbs-bot-rank', `总榜 #${rec.overallRank}`);
      rank.title = `在 GitHub 原始全量贡献榜中排第 #${rec.overallRank}`;
      head.appendChild(rank);
    }

    card.appendChild(head);

    // 周贡献柱状图
    const bars = contributorsData.aggregateWeeklyBars(rec.weeks, 48);
    card.appendChild(ui.createWeeklyChartSvg(bars));

    return card;
  }

  function renderBotPanel(existingPanel, options) {
    const {
      mode,
      analysis,
      repoInfo,
      isFullData,
      ui,
      detector,
      contributorsData,
      onModeChange,
      onToggleOverride,
      onRequestRerender
    } = options;

    // 全部模式下不显示额外面板
    if (mode === 'all') {
      if (existingPanel) existingPanel.remove();
      return null;
    }

    // 人类模式下：若没有检测到任何 Bot / Agent，不占空间
    if (mode === 'human' && (!analysis || analysis.counts.totalBots === 0)) {
      if (existingPanel) existingPanel.remove();
      return null;
    }

    // Bot 模式下若只有 DOM 降级数据且数量为 0，在面板展示空态
    const panel = existingPanel || ui.createEl('section', 'ghbs-bot-panel');
    panel.dataset.ghbsId = BOT_PANEL_ID;
    panel.dataset.ghbsOwned = 'true';
    panel.textContent = '';

    const totalRepoCommits = analysis ? analysis.metrics.total.commits : 0;
    const bots = analysis ? analysis.bots : [];

    if (mode === 'human') {
      panel.classList.add('ghbs-bot-panel--strip');
      panel.classList.remove('ghbs-bot-panel--full');

      const summaryBar = ui.createEl('div', 'ghbs-bot-strip');

      const left = ui.createEl('div', 'ghbs-bot-strip-left');
      left.appendChild(
        ui.createEl('span', 'ghbs-bot-strip-title', `已从主榜剥离 ${formatBotLabel(analysis.counts)}`)
      );

      const chipList = ui.createEl('div', 'ghbs-bot-chips');
      const visibleChips = bots.slice(0, 3);
      for (const rec of visibleChips) {
        const chip = ui.createEl('span', 'ghbs-bot-chip');
        chip.title = `${rec.cls.display} · ${rec.cls.label} · ${detector.formatNumber(rec.commits)} commits`;
        if (rec.avatarSrc) {
          const av = ui.createEl('img', 'ghbs-bot-chip-avatar');
          av.src = rec.avatarSrc;
          av.alt = '';
          av.width = 14;
          av.height = 14;
          chip.appendChild(av);
        }
        chip.appendChild(ui.createEl('span', 'ghbs-bot-chip-name', rec.cls.display));
        if (totalRepoCommits > 0) {
          const pct = ((rec.commits / totalRepoCommits) * 100).toFixed(1);
          chip.appendChild(ui.createEl('span', 'ghbs-bot-chip-meta', `${pct}%`));
        }
        chipList.appendChild(chip);
      }
      if (bots.length > visibleChips.length) {
        chipList.appendChild(
          ui.createEl('span', 'ghbs-bot-chip ghbs-bot-chip--more', `+${bots.length - visibleChips.length}`)
        );
      }
      left.appendChild(chipList);
      summaryBar.appendChild(left);

      const right = ui.createEl('div', 'ghbs-bot-strip-right');
      if (analysis.metrics.allBots.commits > 0) {
        const pctStr =
          totalRepoCommits > 0 ? ` (${analysis.shares.allBotsPct.toFixed(1)}%)` : '';
        right.appendChild(
          ui.createEl(
            'span',
            'ghbs-bot-strip-stat',
            `${detector.formatNumber(analysis.metrics.allBots.commits)} commits${pctStr}`
          )
        );
      }

      if (isFullData) {
        const toggleBtn = ui.createEl(
          'button',
          'ghbs-collapse-btn',
          botsPanelExpanded ? '收起' : '展开详情'
        );
        toggleBtn.type = 'button';
        toggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          botsPanelExpanded = !botsPanelExpanded;
          if (typeof onRequestRerender === 'function') onRequestRerender();
        });
        right.appendChild(toggleBtn);
      } else {
        const viewBtn = ui.createEl('button', 'ghbs-collapse-btn', '查看 Bot');
        viewBtn.type = 'button';
        viewBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof onModeChange === 'function') onModeChange('bot');
        });
        right.appendChild(viewBtn);
      }

      summaryBar.appendChild(right);
      panel.appendChild(summaryBar);

      if (isFullData && botsPanelExpanded) {
        const grid = ui.createEl('div', 'ghbs-bot-grid');
        for (const rec of bots) {
          grid.appendChild(
            buildBotCard(rec, repoInfo, totalRepoCommits, {
              ui,
              detector,
              contributorsData,
              onToggleOverride
            })
          );
        }
        panel.appendChild(grid);
      }

      return panel;
    }

    // mode === 'bot'
    panel.classList.remove('ghbs-bot-panel--strip');
    panel.classList.add('ghbs-bot-panel--full');

    if (!isFullData) {
      // 降级模式下直接使用原生列表过滤展示，仅在无 Bot 时给空态
      if (bots.length === 0) {
        panel.appendChild(ui.createEl('div', 'ghbs-empty-note', '当前已加载的贡献者中未检测到 Bot / AI Agent'));
        return panel;
      }
      if (existingPanel) existingPanel.remove();
      return null;
    }

    if (bots.length === 0) {
      panel.appendChild(ui.createEl('div', 'ghbs-empty-note', '该仓库前 100 位贡献者中未检测到独立 Bot / AI Agent 账号'));
      return panel;
    }

    const grid = ui.createEl('div', 'ghbs-bot-grid');
    for (const rec of bots) {
      grid.appendChild(
        buildBotCard(rec, repoInfo, totalRepoCommits, {
          ui,
          detector,
          contributorsData,
          onToggleOverride
        })
      );
    }
    panel.appendChild(grid);

    return panel;
  }

  function render(ctx) {
    const { settings, mode, onModeChange, onToggleOverride, onRequestRerender } = ctx;
    const { detector, ui, contributorsData } = root.GHBS;

    if (!settings.enabled || !settings.views.contributorsGraph) {
      cleanup();
      return null;
    }

    const list = findListContainer();
    if (!list) return null;

    const repoInfo = contributorsData ? contributorsData.parseRepoFromPath(window.location.pathname) : null;
    if (repoInfo && repoInfo.key !== lastRepoKey) {
      lastRepoKey = repoInfo.key;
      botsPanelExpanded = false;
    }

    let repoState = null;
    if (repoInfo && contributorsData) {
      repoState = contributorsData.ensureRepoDataLoaded(repoInfo.owner, repoInfo.repo, () => {
        if (typeof onRequestRerender === 'function') onRequestRerender();
      });
    }

    const allLis = Array.from(list.children).filter(
      (el) => el.tagName === 'LI' && el.dataset.ghbsOwned !== 'true'
    );
    const cards = allLis.filter(isLoadedCard);

    const isFullData = Boolean(repoState && repoState.status === 'ready' && repoState.records.length > 0);
    const isLoadingData = Boolean(repoState && repoState.status === 'loading');

    if (cards.length === 0 && !isFullData) return null;

    // 1. 优先用全量 contributors-data 构建精确分析；未就绪或异常时用已加载 DOM 降级
    let analysis = null;
    if (isFullData) {
      analysis = contributorsData.analyzeContributors(repoState.records, settings, detector);
    } else {
      const domRecords = cards.map((card) => {
        const { signals } = extractContributorSignals(card);
        const m = extractCardMetrics(card, detector);
        return {
          login: signals.login,
          href: signals.href,
          avatarSrc: signals.avatarSrc,
          hovercardType: signals.hovercardType,
          hovercardUrl: signals.hovercardUrl,
          commits: m.commits,
          additions: m.additions,
          deletions: m.deletions,
          weeks: []
        };
      });
      analysis = contributorsData.analyzeContributors(domRecords, settings, detector);
    }

    // 清理可能残留的旧版自有子元素（不再往原生 ul 里塞分组头或改 order）
    Array.from(list.children).forEach((child) => {
      if (child.dataset && child.dataset.ghbsOwned === 'true') {
        child.remove();
      }
    });

    // 2. 控制原生列表整体显示：在有全量数据的 Bot 模式下直接隐藏原生列表，改用全量 Bot 卡片网格
    const hideNativeList = mode === 'bot' && isFullData;
    list.classList.toggle('ghbs-hidden', hideNativeList);

    // 3. 原位处理每个已水合的原生卡片（绝不使用 CSS order 重排，彻底杜绝下滑跳动）
    let domHumanCounter = 0;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const { nameLink, signals } = extractContributorSignals(card);
      const localCls = detector.classifyAccount(signals, settings);
      const matched =
        (localCls.baseLogin && analysis.byLogin.get(localCls.baseLogin)) ||
        (localCls.login && analysis.byLogin.get(localCls.login)) ||
        null;

      const cls = matched ? matched.cls : localCls;

      card.classList.add('ghbs-item');
      card.classList.remove('ghbs-item--human', 'ghbs-item--bot', 'ghbs-item--ai-agent', 'ghbs-hidden');
      card.classList.add(`ghbs-item--${cls.kind}`);
      card.dataset.ghbsKind = cls.kind;
      card.style.removeProperty('order');

      card.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

      if (!cls.isBot) {
        domHumanCounter += 1;
      }

      if (mode === 'human') {
        if (cls.isBot) card.classList.add('ghbs-hidden');
      } else if (mode === 'bot' && !isFullData) {
        if (!cls.isBot) card.classList.add('ghbs-hidden');
      }

      const headerTarget =
        (nameLink && nameLink.parentElement) ||
        card.querySelector('h2 > span, h2, h3');

      if (headerTarget) {
        const badgeWrap = ui.createBadge(cls, {
          allowOverride: true,
          onToggleOverride
        });

        // 仅在人类主榜中，且该人类排名确实因前面有 Bot 被顶后时，才展示清晰的「人类 #N」标签，避免无意义的双重排名
        if (mode === 'human' && !cls.isBot) {
          const humanRank = matched ? matched.groupRank : domHumanCounter;
          const overallRank = matched ? matched.overallRank : i + 1;
          if (humanRank > 0 && humanRank !== overallRank) {
            const rankPill = ui.createEl('span', 'ghbs-group-rank', `人类 #${humanRank}`);
            rankPill.title = `去除 Bot / AI Agent 后的人类贡献排名 #${humanRank}（总榜 #${overallRank}）`;
            badgeWrap.prepend(rankPill);
          }
        }

        if (badgeWrap.childNodes.length > 0) {
          headerTarget.appendChild(badgeWrap);
        }
      }
    }

    // 4. 渲染顶部控制栏（使用全量精准计数与占比条）
    const hostParent = list.parentElement || document.querySelector('#contributors');
    const existingToolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    const toolbar = ui.renderToolbar(existingToolbar, {
      id: TOOLBAR_ID,
      mode,
      modeOrder: ['human', 'bot', 'all'],
      counts: isLoadingData ? {} : analysis.counts,
      extraSummary: buildRatioSummaryText(analysis, !isFullData, isLoadingData),
      ratioBar: isFullData
        ? {
            humanPct: analysis.shares.humanPct,
            aiAgentPct: analysis.shares.aiAgentPct,
            botPct: analysis.shares.botPct
          }
        : null,
      compact: false,
      onModeChange
    });

    if (!existingToolbar && hostParent) {
      hostParent.insertBefore(toolbar, list);
    }

    // 5. 渲染顶部紧凑 AI/Bot 摘要条（人类模式）或全量 Bot 卡片网格（Bot 模式）
    const existingBotPanel = document.querySelector(`[data-ghbs-id="${BOT_PANEL_ID}"]`);
    const botPanel = renderBotPanel(existingBotPanel, {
      mode,
      analysis,
      repoInfo,
      isFullData,
      ui,
      detector,
      contributorsData,
      onModeChange,
      onToggleOverride,
      onRequestRerender
    });

    if (botPanel && !existingBotPanel && hostParent) {
      hostParent.insertBefore(botPanel, list);
    }

    return {
      view: 'contributorsGraph',
      isFullData,
      counts: analysis.counts,
      commits: {
        human: analysis.metrics.human.commits,
        bot: analysis.metrics.allBots.commits
      }
    };
  }

  root.GHBS = root.GHBS || {};
  root.GHBS.views = root.GHBS.views || {};
  root.GHBS.views.contributorsGraph = {
    matches,
    render,
    cleanup
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
