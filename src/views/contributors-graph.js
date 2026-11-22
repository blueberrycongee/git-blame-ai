(function (root) {
  'use strict';

  const PATH_RE = /^\/[^/]+\/[^/]+\/graphs\/contributors\/?$/;
  const TOOLBAR_ID = 'ghbs-contributors-toolbar';

  function matches(pathname) {
    return PATH_RE.test(pathname);
  }

  function extractContributorSignals(card) {
    // 尝试多种 GitHub DOM 选择器定位用户名链接与头像
    const nameLink =
      card.querySelector('h3 a.aname') ||
      card.querySelector('h3 a[href^="/apps/"]') ||
      card.querySelector('h3 a[data-hovercard-type]') ||
      Array.from(card.querySelectorAll('h3 a[href]')).find((a) => (a.textContent || '').trim().length > 0) ||
      card.querySelector('a.aname') ||
      card.querySelector('a[href^="/apps/"]');

    const avatarImg =
      card.querySelector('img.avatar') ||
      card.querySelector('img[src*="avatars.githubusercontent.com"]');

    const botBadge = Array.from(card.querySelectorAll('span.Label, span.label, span[class*="Label"]')).some((el) =>
      /^(bot|app)$/i.test((el.textContent || '').trim())
    );

    let login = nameLink ? (nameLink.textContent || '').trim() : '';
    const href = nameLink ? nameLink.getAttribute('href') || '' : '';

    if (!login && avatarImg && avatarImg.alt) {
      login = avatarImg.alt.replace(/^@/, '').trim();
    }

    return {
      nameLink,
      signals: {
        login,
        href,
        avatarSrc: avatarImg ? avatarImg.getAttribute('src') || '' : '',
        hovercardType: nameLink ? nameLink.getAttribute('data-hovercard-type') || '' : '',
        hovercardUrl: nameLink ? nameLink.getAttribute('data-hovercard-url') || '' : '',
        hasBotBadge: botBadge
      }
    };
  }

  function extractCardMetrics(card, detector) {
    const meta = card.querySelector('.cmeta') || card;
    const commitsEl =
      meta.querySelector('a[href*="commits"]') ||
      Array.from(meta.querySelectorAll('a, span')).find((el) => /\bcommits?\b/i.test(el.textContent || ''));
    const addEl = meta.querySelector('.a');
    const delEl = meta.querySelector('.d');

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
    list.querySelectorAll('li.ghbs-item').forEach((card) => {
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

  function findListContainer() {
    return (
      document.querySelector('#contributors ol.contrib-data') ||
      document.querySelector('ol.contrib-data') ||
      document.querySelector('#contributors ol')
    );
  }

  function render(ctx) {
    const { settings, mode, onModeChange, onToggleOverride } = ctx;
    const { detector, ui } = root.GHBS;

    if (!settings.enabled || !settings.views.contributorsGraph) {
      cleanup();
      return null;
    }

    const list = findListContainer();
    if (!list) return null;

    const cards = Array.from(list.children).filter(
      (el) => el.tagName === 'LI' && el.dataset.ghbsOwned !== 'true' && (el.classList.contains('contrib-person') || el.querySelector('h3'))
    );

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

    // 清理旧的注入头和空提示
    Array.from(list.children).forEach((child) => {
      if (child.dataset && child.dataset.ghbsOwned === 'true') {
        child.remove();
      }
    });

    list.classList.add('ghbs-contrib-list');
    list.classList.remove('ghbs-mode-split', 'ghbs-mode-human', 'ghbs-mode-bot', 'ghbs-mode-all');
    list.classList.add(`ghbs-mode-${mode}`);

    let humanIndex = 0;
    let botIndex = 0;

    for (const { card, nameLink, cls } of classifiedCards) {
      card.classList.add('ghbs-item');
      card.classList.remove('ghbs-item--human', 'ghbs-item--bot', 'ghbs-item--ai-agent', 'ghbs-hidden');
      card.classList.add(`ghbs-item--${cls.kind}`);
      card.dataset.ghbsKind = cls.kind;

      // 清理卡片内部旧徽章
      card.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

      // 可见性与排序
      if (mode === 'split') {
        if (cls.isBot) {
          botIndex += 1;
          card.style.order = String(40);
        } else {
          humanIndex += 1;
          card.style.order = String(20);
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

      // 注入徽章 + 快速切换覆盖按钮
      const headerTarget = (nameLink && nameLink.parentElement) || card.querySelector('h3');
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
      return `${detector.formatNumber(bucket.commits)} commits${pct} · ${detector.formatNumber(bucket.additions)} ++ / ${detector.formatNumber(bucket.deletions)} --`;
    };

    // 分组模式注入两个全宽区域头
    if (mode === 'split') {
      const humanHeader = ui.createSectionHeader('li', {
        kind: 'human',
        title: '人类贡献者',
        count: counts.human,
        detail: fmtDetail(metrics.human)
      });
      humanHeader.style.order = '10';
      list.appendChild(humanHeader);

      if (counts.human === 0) {
        const emptyH = ui.createEl('li', 'ghbs-empty-note', '当前时间范围内暂无人类贡献者');
        emptyH.dataset.ghbsOwned = 'true';
        emptyH.style.order = '21';
        list.appendChild(emptyH);
      }

      const botTitle =
        counts.aiAgent > 0 && counts.bot > 0
          ? `Bot / AI Agent（AI Agent ${counts.aiAgent} · Bot ${counts.bot}）`
          : counts.aiAgent > 0
            ? 'AI Agent 贡献者'
            : 'Bot / Agent 贡献者';

      const botHeader = ui.createSectionHeader('li', {
        kind: counts.aiAgent > 0 ? 'ai-agent' : 'bot',
        title: botTitle,
        count: totalBotCount,
        detail: fmtDetail(metrics.bot)
      });
      botHeader.style.order = '30';
      list.appendChild(botHeader);

      if (totalBotCount === 0) {
        const emptyB = ui.createEl('li', 'ghbs-empty-note', '未检测到 Bot 或 AI Agent 账号（也可在任意卡片上点击「标为 Bot」手动归类）');
        emptyB.dataset.ghbsOwned = 'true';
        emptyB.style.order = '41';
        list.appendChild(emptyB);
      }
    } else if (mode === 'bot' && totalBotCount === 0) {
      const empty = ui.createEl('li', 'ghbs-empty-note', '当前贡献者列表中未检测到 Bot 或 AI Agent 账号');
      empty.dataset.ghbsOwned = 'true';
      list.appendChild(empty);
    } else if (mode === 'human' && counts.human === 0) {
      const empty = ui.createEl('li', 'ghbs-empty-note', '当前贡献者列表中未检测到人类账号');
      empty.dataset.ghbsOwned = 'true';
      list.appendChild(empty);
    }

    // 渲染顶部工具栏
    let extraSummary = '';
    if (totalCommits > 0) {
      const humanPct = ((metrics.human.commits / totalCommits) * 100).toFixed(1);
      const botPct = ((metrics.bot.commits / totalCommits) * 100).toFixed(1);
      extraSummary = `提交占比：人类 ${humanPct}% · Bot/Agent ${botPct}%`;
    }

    const hostParent = list.parentElement || document.querySelector('#contributors');
    const existingToolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    const toolbar = ui.renderToolbar(existingToolbar, {
      id: TOOLBAR_ID,
      title: '贡献者分类',
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
