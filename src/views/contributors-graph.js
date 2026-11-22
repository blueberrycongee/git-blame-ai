(function (root) {
  'use strict';

  const PATH_RE = /^\/[^/]+\/[^/]+\/graphs\/contributors\/?$/;
  const TOOLBAR_ID = 'ghbs-contributors-toolbar';

  // 分组模式下允许折叠 Bot 区域（默认展开，且位于上方，避免人类不断懒加载把 Bot 顶到底部）
  let botsCollapsed = false;

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

  function clearOwned(container) {
    if (!container) return;
    container.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
  }

  function cleanup() {
    const toolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    if (toolbar) toolbar.remove();

    const list = findListContainer();
    if (!list) return;

    list.classList.remove('ghbs-contrib-list', 'ghbs-mode-split', 'ghbs-mode-human', 'ghbs-mode-bot', 'ghbs-mode-all');
    clearOwned(list);
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

  function render(ctx) {
    const { settings, mode, onModeChange, onToggleOverride, onRequestRerender } = ctx;
    const { detector, ui } = root.GHBS;

    if (!settings.enabled || !settings.views.contributorsGraph) {
      cleanup();
      return null;
    }

    const list = findListContainer();
    if (!list) return null;

    const allLis = Array.from(list.children).filter(
      (el) => el.tagName === 'LI' && el.dataset.ghbsOwned !== 'true'
    );
    const cards = allLis.filter(isLoadedCard);
    const placeholders = allLis.filter((el) => !isLoadedCard(el));

    if (cards.length === 0) return null;

    const counts = { total: 0, human: 0, aiAgent: 0, bot: 0, assisted: 0 };
    const metrics = {
      human: { commits: 0, additions: 0, deletions: 0 },
      bot: { commits: 0, additions: 0, deletions: 0 }
    };

    const classifiedCards = [];

    for (const card of cards) {
      const { nameLink, signals } = extractContributorSignals(card);
      const cls = detector.classifyAccount(signals, settings);
      const m = extractCardMetrics(card, detector);

      counts.total += 1;
      if (cls.isBot) {
        if (cls.kind === 'ai-agent') counts.aiAgent += 1;
        else counts.bot += 1;
        metrics.bot.commits += m.commits;
        metrics.bot.additions += m.additions;
        metrics.bot.deletions += m.deletions;
      } else {
        counts.human += 1;
        metrics.human.commits += m.commits;
        metrics.human.additions += m.additions;
        metrics.human.deletions += m.deletions;
      }

      classifiedCards.push({ card, nameLink, cls, metrics: m });
    }

    Array.from(list.children).forEach((child) => {
      if (child.dataset && child.dataset.ghbsOwned === 'true') {
        child.remove();
      }
    });

    list.classList.add('ghbs-contrib-list');
    list.classList.remove('ghbs-mode-split', 'ghbs-mode-human', 'ghbs-mode-bot', 'ghbs-mode-all');
    list.classList.add(`ghbs-mode-${mode}`);

    // 未懒加载完成的占位 li 始终留在最底部，跟随人类区继续向下懒加载
    for (const ph of placeholders) {
      if (mode === 'split') ph.style.order = '50';
      else ph.style.removeProperty('order');
    }

    let humanIndex = 0;
    let botIndex = 0;

    for (const { card, nameLink, cls } of classifiedCards) {
      card.classList.add('ghbs-item');
      card.classList.remove('ghbs-item--human', 'ghbs-item--bot', 'ghbs-item--ai-agent', 'ghbs-hidden');
      card.classList.add(`ghbs-item--${cls.kind}`);
      card.dataset.ghbsKind = cls.kind;

      card.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

      // 分组模式：Bot / Agent 数量少且固定，置于上方（可折叠）；人类在下方自然向下懒加载，不会再把 Bot 顶跑
      if (mode === 'split') {
        if (cls.isBot) {
          botIndex += 1;
          card.style.order = '20';
          if (botsCollapsed) card.classList.add('ghbs-hidden');
        } else {
          humanIndex += 1;
          card.style.order = '40';
        }
      } else if (mode === 'human') {
        card.style.removeProperty('order');
        if (cls.isBot) card.classList.add('ghbs-hidden');
      } else if (mode === 'bot') {
        card.style.removeProperty('order');
        if (!cls.isBot) card.classList.add('ghbs-hidden');
      } else {
        card.style.removeProperty('order');
      }

      const headerTarget =
        (nameLink && nameLink.parentElement) ||
        card.querySelector('h2 > span, h2, h3');

      if (headerTarget) {
        const badgeWrap = ui.createBadge(cls, {
          allowOverride: true,
          onToggleOverride
        });
        if (mode === 'split') {
          const groupRank = cls.isBot ? botIndex : humanIndex;
          const rankPill = ui.createEl('span', 'ghbs-group-rank', `#${groupRank}`);
          rankPill.title = `当前分组内排名 #${groupRank}`;
          badgeWrap.prepend(rankPill);
        }
        headerTarget.appendChild(badgeWrap);
      }
    }

    const totalBotCount = counts.aiAgent + counts.bot;
    const totalCommits = metrics.human.commits + metrics.bot.commits;

    const fmtDetail = (bucket) => {
      if (!bucket.commits) return '';
      const pct = totalCommits > 0 ? ` (${((bucket.commits / totalCommits) * 100).toFixed(1)}%)` : '';
      return `${detector.formatNumber(bucket.commits)} commits${pct}`;
    };

    if (mode === 'split') {
      const botTitle =
        counts.aiAgent > 0 && counts.bot > 0
          ? `Bot / Agent`
          : counts.aiAgent > 0
            ? 'AI Agent'
            : 'Bot / Agent';

      const botHeader = ui.createSectionHeader('li', {
        kind: 'bot',
        title: botTitle,
        count: totalBotCount,
        detail: totalBotCount > 0 ? fmtDetail(metrics.bot) : '暂未检测到',
        collapsible: totalBotCount > 0,
        collapsed: botsCollapsed,
        onToggleCollapse: () => {
          botsCollapsed = !botsCollapsed;
          if (typeof onRequestRerender === 'function') onRequestRerender();
        }
      });
      botHeader.style.order = '10';
      list.appendChild(botHeader);

      const humanHeader = ui.createSectionHeader('li', {
        kind: 'human',
        title: '人类',
        count: counts.human,
        detail: fmtDetail(metrics.human)
      });
      humanHeader.style.order = '30';
      list.appendChild(humanHeader);

      if (counts.human === 0) {
        const emptyH = ui.createEl('li', 'ghbs-empty-note', '当前已加载的贡献者中暂无人类账号');
        emptyH.dataset.ghbsOwned = 'true';
        emptyH.style.order = '41';
        list.appendChild(emptyH);
      }
    } else if (mode === 'bot' && totalBotCount === 0 && placeholders.length === 0) {
      const empty = ui.createEl('li', 'ghbs-empty-note', '未检测到 Bot / Agent 账号');
      empty.dataset.ghbsOwned = 'true';
      list.appendChild(empty);
    } else if (mode === 'human' && counts.human === 0 && placeholders.length === 0) {
      const empty = ui.createEl('li', 'ghbs-empty-note', '未检测到人类账号');
      empty.dataset.ghbsOwned = 'true';
      list.appendChild(empty);
    }

    let extraSummary = '';
    if (totalCommits > 0) {
      const humanPct = ((metrics.human.commits / totalCommits) * 100).toFixed(1);
      const botPct = ((metrics.bot.commits / totalCommits) * 100).toFixed(1);
      extraSummary = `人类 ${humanPct}% · Bot ${botPct}%`;
    }

    const hostParent = list.parentElement || document.querySelector('#contributors');
    const existingToolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    const toolbar = ui.renderToolbar(existingToolbar, {
      id: TOOLBAR_ID,
      mode,
      counts,
      extraSummary,
      compact: false,
      onModeChange
    });

    if (!existingToolbar && hostParent) {
      hostParent.insertBefore(toolbar, list);
    }

    return {
      view: 'contributorsGraph',
      counts,
      commits: {
        human: metrics.human.commits,
        bot: metrics.bot.commits
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
