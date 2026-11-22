(function (root) {
  'use strict';

  const TOGGLE_ID = 'ghbs-sidebar-inline-toggle';
  const SUMMARY_ID = 'ghbs-sidebar-repo-summary';

  function findSidebarCell() {
    const links = document.querySelectorAll(
      'h2 a[href*="/graphs/contributors"], h3 a[href*="/graphs/contributors"]'
    );
    for (const link of links) {
      const cell =
        link.closest('[class*="sidebarSection"]') ||
        link.closest('.BorderGrid-cell') ||
        link.closest('section') ||
        link.closest('div');
      if (cell && cell.querySelector('ul')) {
        return {
          cell,
          heading: link.closest('h2, h3'),
          contribLink: link
        };
      }
    }
    return null;
  }

  function matches() {
    return Boolean(findSidebarCell());
  }

  function extractSidebarSignals(li) {
    const link =
      li.querySelector('a[href^="/apps/"]') ||
      li.querySelector('a[data-hovercard-type]') ||
      li.querySelector('a[href^="/"]');
    const img =
      li.querySelector('img[data-testid="github-avatar"]') ||
      li.querySelector('img.avatar') ||
      li.querySelector('img[src*="avatars.githubusercontent.com"]');
    const nameSpan = li.querySelector('strong, span.color-fg-default');

    let login = '';
    if (nameSpan && (nameSpan.textContent || '').trim()) {
      login = (nameSpan.textContent || '').trim();
    } else if (link && (link.textContent || '').trim()) {
      login = (link.textContent || '').trim().split(/\s+/)[0];
    } else if (img && img.alt) {
      login = img.alt.replace(/^@/, '').trim();
    }

    return {
      link,
      signals: {
        login,
        href: link ? link.getAttribute('href') || '' : '',
        avatarSrc: img ? img.getAttribute('src') || '' : '',
        hovercardType: link ? link.getAttribute('data-hovercard-type') || '' : '',
        hovercardUrl: link ? link.getAttribute('data-hovercard-url') || '' : '',
        hasBotBadge: false
      }
    };
  }

  function cleanup() {
    document.querySelectorAll(`[data-ghbs-id="${TOGGLE_ID}"], [data-ghbs-id="${SUMMARY_ID}"]`).forEach((el) => {
      el.remove();
    });
    document.querySelectorAll('.ghbs-sidebar-heading').forEach((el) => {
      el.classList.remove('ghbs-sidebar-heading');
    });

    const found = findSidebarCell();
    if (!found) return;
    const ul = found.cell.querySelector('ul');
    if (!ul) return;

    ul.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    ul.querySelectorAll('li.ghbs-sidebar-item').forEach((li) => {
      li.classList.remove(
        'ghbs-sidebar-item',
        'ghbs-sidebar-bot-avatar',
        'ghbs-item--human',
        'ghbs-item--bot',
        'ghbs-item--ai-agent',
        'ghbs-hidden'
      );
      li.style.removeProperty('order');
      delete li.dataset.ghbsKind;
    });
  }

  function formatBotCountLabel(counts) {
    const total = counts.aiAgent + counts.bot;
    if (counts.aiAgent > 0 && counts.bot > 0) return `${total} 个 Bot / Agent`;
    if (counts.aiAgent > 0) return `${counts.aiAgent} 个 AI Agent`;
    return `${counts.bot} 个 Bot`;
  }

  function render(ctx) {
    const { settings, mode, onModeChange, onRequestRerender } = ctx;
    const { detector, ui, contributorsData } = root.GHBS;

    if (!settings.enabled || !settings.views.repoSidebar) {
      cleanup();
      return null;
    }

    const found = findSidebarCell();
    if (!found) return null;

    const { cell, heading, contribLink } = found;
    const ul = cell.querySelector('ul');
    if (!ul) return null;

    const items = Array.from(ul.children).filter(
      (el) => el.tagName === 'LI' && el.dataset.ghbsOwned !== 'true' && el.querySelector('a, img')
    );

    if (items.length === 0) return null;

    // 复用同源 /graphs/contributors-data，让侧边栏与贡献榜保持完全一致的全仓库口径
    const contribHref = contribLink ? contribLink.getAttribute('href') || '' : '';
    let repoInfo = null;
    if (contribHref && contributorsData) {
      try {
        const parsedUrl = new URL(contribHref, window.location.origin);
        repoInfo = contributorsData.parseRepoFromPath(parsedUrl.pathname);
      } catch (_) {
        repoInfo = null;
      }
    }

    let fullAnalysis = null;
    if (repoInfo && contributorsData) {
      const repoState = contributorsData.ensureRepoDataLoaded(repoInfo.owner, repoInfo.repo, () => {
        if (typeof onRequestRerender === 'function') onRequestRerender();
      });
      if (repoState && repoState.status === 'ready' && repoState.records.length > 0) {
        fullAnalysis = contributorsData.analyzeContributors(repoState.records, settings, detector);
      }
    }

    const isAvatarGrid =
      /avatarGrid/i.test(ul.className || '') ||
      ul.classList.contains('flex-wrap') ||
      items.every((li) => (li.textContent || '').trim().length === 0);

    Array.from(ul.children).forEach((child) => {
      if (child.dataset && child.dataset.ghbsOwned === 'true') child.remove();
    });

    const visibleCounts = { total: 0, human: 0, aiAgent: 0, bot: 0, assisted: 0 };

    for (const li of items) {
      const { link, signals } = extractSidebarSignals(li);
      const localCls = detector.classifyAccount(signals, settings);
      const matched =
        fullAnalysis &&
        ((localCls.baseLogin && fullAnalysis.byLogin.get(localCls.baseLogin)) ||
          (localCls.login && fullAnalysis.byLogin.get(localCls.login)));
      const cls = matched ? matched.cls : localCls;

      visibleCounts.total += 1;
      if (cls.isBot) {
        if (cls.kind === 'ai-agent') visibleCounts.aiAgent += 1;
        else visibleCounts.bot += 1;
      } else {
        visibleCounts.human += 1;
      }

      li.classList.add('ghbs-sidebar-item');
      li.classList.remove(
        'ghbs-sidebar-bot-avatar',
        'ghbs-item--human',
        'ghbs-item--bot',
        'ghbs-item--ai-agent',
        'ghbs-hidden'
      );
      li.classList.add(`ghbs-item--${cls.kind}`);
      li.dataset.ghbsKind = cls.kind;
      li.style.removeProperty('order');
      li.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

      if (link && cls.isBot) {
        link.title = `${cls.display} · ${cls.label}（${cls.reason}）`;
      }

      if (cls.isBot && isAvatarGrid) {
        li.classList.add('ghbs-sidebar-bot-avatar');
      } else if (cls.isBot && !isAvatarGrid) {
        const badge = ui.createBadge(cls, { allowOverride: false });
        li.appendChild(badge);
      }

      if (mode === 'human') {
        if (cls.isBot) li.classList.add('ghbs-hidden');
      } else if (mode === 'bot') {
        if (!cls.isBot) li.classList.add('ghbs-hidden');
      }
    }

    const visibleBots = visibleCounts.aiAgent + visibleCounts.bot;

    // 1. 标题行右侧极简切换按钮：仅当前排头像中存在 Bot 时出现，不插入多余大框割裂标题与头像
    const existingToggle = cell.querySelector(`[data-ghbs-id="${TOGGLE_ID}"]`);
    if (visibleBots > 0 && heading) {
      heading.classList.add('ghbs-sidebar-heading');
      const btn = existingToggle || ui.createEl('button', 'ghbs-sidebar-inline-toggle');
      btn.type = 'button';
      btn.dataset.ghbsId = TOGGLE_ID;
      btn.dataset.ghbsOwned = 'true';

      let label = '';
      let nextMode = 'all';
      if (mode === 'human') {
        label = `前排已隐藏 ${visibleBots} · 显示`;
        nextMode = 'all';
      } else if (mode === 'bot') {
        label = `仅看 Bot · 看人类`;
        nextMode = 'human';
      } else {
        label = `隐藏前排 Bot`;
        nextMode = 'human';
      }
      btn.textContent = label;
      btn.title = `当前侧边栏展示的前 ${visibleCounts.total} 位贡献者中含 ${formatBotCountLabel(visibleCounts)}`;

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onModeChange === 'function') onModeChange(nextMode);
      };

      if (!existingToggle) {
        heading.appendChild(btn);
      }
    } else {
      if (existingToggle) existingToggle.remove();
      if (heading) heading.classList.remove('ghbs-sidebar-heading');
    }

    // 2. 侧边栏底部全仓库占比摘要（与 /graphs/contributors 完全同源、同口径）
    const existingSummary = cell.querySelector(`[data-ghbs-id="${SUMMARY_ID}"]`);
    const hasFullBots = Boolean(fullAnalysis && fullAnalysis.counts.totalBots > 0);

    if (hasFullBots) {
      const summary = existingSummary || ui.createEl('div', 'ghbs-sidebar-summary');
      summary.dataset.ghbsId = SUMMARY_ID;
      summary.dataset.ghbsOwned = 'true';
      summary.textContent = '';

      // 3px 极简单色比例条
      const track = ui.createEl('div', 'ghbs-ratio-track ghbs-ratio-track--sidebar');
      track.setAttribute('aria-hidden', 'true');
      if (fullAnalysis.shares.humanPct > 0) {
        const segH = ui.createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--human');
        segH.style.width = `${fullAnalysis.shares.humanPct.toFixed(2)}%`;
        track.appendChild(segH);
      }
      if (fullAnalysis.shares.aiAgentPct > 0) {
        const segA = ui.createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--ai');
        segA.style.width = `${fullAnalysis.shares.aiAgentPct.toFixed(2)}%`;
        track.appendChild(segA);
      }
      if (fullAnalysis.shares.botPct > 0) {
        const segB = ui.createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--bot');
        segB.style.width = `${fullAnalysis.shares.botPct.toFixed(2)}%`;
        track.appendChild(segB);
      }
      summary.appendChild(track);

      const metaRow = ui.createEl('div', 'ghbs-sidebar-summary-row');
      const ratioParts = [`人类 ${fullAnalysis.shares.humanPct.toFixed(1)}%`];
      if (fullAnalysis.counts.aiAgent > 0 && fullAnalysis.counts.bot > 0) {
        ratioParts.push(`Bot/Agent ${fullAnalysis.shares.allBotsPct.toFixed(1)}%`);
      } else if (fullAnalysis.counts.aiAgent > 0) {
        ratioParts.push(`AI Agent ${fullAnalysis.shares.aiAgentPct.toFixed(1)}%`);
      } else {
        ratioParts.push(`Bot ${fullAnalysis.shares.botPct.toFixed(1)}%`);
      }
      metaRow.appendChild(ui.createEl('span', 'ghbs-sidebar-summary-ratio', ratioParts.join(' · ')));

      const detailLink = ui.createEl(
        'a',
        'ghbs-sidebar-summary-link',
        `${formatBotCountLabel(fullAnalysis.counts)} ›`
      );
      detailLink.href = contribHref || `/${repoInfo.owner}/${repoInfo.repo}/graphs/contributors`;
      detailLink.title = '查看全仓库人类与 Bot / AI Agent 贡献详情';
      metaRow.appendChild(detailLink);

      summary.appendChild(metaRow);

      if (!existingSummary) {
        cell.appendChild(summary);
      }
    } else if (existingSummary) {
      existingSummary.remove();
    }

    if (fullAnalysis) {
      return {
        view: 'repoSidebar',
        isFullData: true,
        counts: fullAnalysis.counts,
        commits: {
          human: fullAnalysis.metrics.human.commits,
          bot: fullAnalysis.metrics.allBots.commits
        }
      };
    }

    return {
      view: 'repoSidebar',
      isFullData: false,
      counts: visibleCounts
    };
  }

  root.GHBS = root.GHBS || {};
  root.GHBS.views = root.GHBS.views || {};
  root.GHBS.views.repoSidebar = {
    matches,
    render,
    cleanup
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
