(function (root) {
  'use strict';

  const PATH_RE = /^\/(?:[^/]+\/[^/]+\/)?(?:pulls|issues)\/?$/;
  const TOOLBAR_ID = 'ghbs-issues-prs-toolbar';

  function matches(pathname) {
    return PATH_RE.test(pathname);
  }

  function findRowsAndContainer() {
    // 1. 2026 新版 React PR / Issues ListView（ul[data-listview-component="items-list"]）
    const reactList = document.querySelector('ul[data-listview-component="items-list"]');
    if (reactList) {
      const rows = Array.from(reactList.children).filter(
        (el) => el.tagName === 'LI' && el.dataset.ghbsOwned !== 'true'
      );
      if (rows.length > 0) {
        return { container: reactList, rows, itemTag: 'li', style: 'modern' };
      }
    }

    // 2. 经典 GitHub PR / Issues 列表
    const classicContainer = document.querySelector('.js-navigation-container.js-active-navigation-container');
    if (classicContainer) {
      const rows = Array.from(classicContainer.children).filter(
        (el) =>
          el.dataset.ghbsOwned !== 'true' &&
          (el.classList.contains('js-issue-row') || /^issue_\d+$/.test(el.id || ''))
      );
      if (rows.length > 0) {
        return { container: classicContainer, rows, itemTag: 'div', style: 'classic' };
      }
    }

    // 3. 兜底 React ListItem
    const fallbackRows = Array.from(
      document.querySelectorAll('li[data-listview-item-id], li[class*="ListItem-module__listItem"]')
    ).filter((el) => el.dataset.ghbsOwned !== 'true');

    if (fallbackRows.length > 0 && fallbackRows[0].parentElement) {
      return {
        container: fallbackRows[0].parentElement,
        rows: fallbackRows,
        itemTag: 'li',
        style: 'modern'
      };
    }

    return null;
  }

  function parseAuthorFromQueryHref(href) {
    if (!href) return null;
    try {
      const url = new URL(href, 'https://github.com');
      const q = url.searchParams.get('q') || '';
      const appMatch = q.match(/(?:^|\s)author:app\/([^\s]+)/i);
      if (appMatch) {
        return { login: appMatch[1] + '[bot]', isApp: true };
      }
      const userMatch = q.match(/(?:^|\s)author:([^\s]+)/i);
      if (userMatch) {
        return { login: userMatch[1], isApp: false };
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function extractIssuePrAuthor(row) {
    const authorLink =
      row.querySelector('a[data-testid="author-filter-link"]') ||
      row.querySelector('a[data-testid="issue-author-link"]') ||
      row.querySelector('a[data-hovercard-type="user"][href*="author"]') ||
      row.querySelector('.opened-by a[data-hovercard-type]') ||
      row.querySelector('.opened-by a[href]') ||
      row.querySelector('a[href*="author%3A"]') ||
      row.querySelector('a[href*="author:"]') ||
      row.querySelector('a[href^="/apps/"]');

    const href = authorLink ? authorLink.getAttribute('href') || '' : '';
    const parsedFromQuery = parseAuthorFromQueryHref(href);

    let login = authorLink ? (authorLink.textContent || '').trim() : '';
    if (parsedFromQuery && parsedFromQuery.login) {
      login = parsedFromQuery.login;
    }

    const avatarImg =
      row.querySelector('img[data-testid="github-avatar"]') ||
      row.querySelector('.opened-by img.avatar') ||
      row.querySelector('img.avatar');

    const hasBotBadge = Array.from(
      row.querySelectorAll('.opened-by span, [class*="Label"], [data-component="Label"]')
    ).some((el) => /^(bot|app)$/i.test((el.textContent || '').trim()));

    return {
      authorLink,
      signals: {
        login,
        href:
          parsedFromQuery && parsedFromQuery.isApp
            ? `/apps/${parsedFromQuery.login.replace(/\[bot\]$/i, '')}`
            : href,
        avatarSrc: avatarImg ? avatarImg.getAttribute('src') || '' : '',
        hovercardType: authorLink ? authorLink.getAttribute('data-hovercard-type') || '' : '',
        hovercardUrl: authorLink ? authorLink.getAttribute('data-hovercard-url') || '' : '',
        hasBotBadge
      }
    };
  }

  function cleanup() {
    const toolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    if (toolbar) toolbar.remove();

    document.querySelectorAll('.ghbs-issue-list').forEach((container) => {
      container.classList.remove('ghbs-issue-list');
      container.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    });

    document.querySelectorAll('.ghbs-issue-item').forEach((row) => {
      row.classList.remove(
        'ghbs-issue-item',
        'ghbs-item--human',
        'ghbs-item--bot',
        'ghbs-item--ai-agent',
        'ghbs-hidden'
      );
      row.style.removeProperty('order');
      row.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    });
  }

  function render(ctx) {
    const { settings, mode, onModeChange, onToggleOverride } = ctx;
    const { detector, ui } = root.GHBS;

    if (!settings.enabled || !settings.views.issuesPrs) {
      cleanup();
      return null;
    }

    const found = findRowsAndContainer();
    if (!found) return null;

    const { container, rows, itemTag } = found;
    const isPrPage = /\/pulls\/?$/.test(window.location.pathname);

    container.classList.add('ghbs-issue-list');
    Array.from(container.children).forEach((child) => {
      if (child.dataset && child.dataset.ghbsOwned === 'true') child.remove();
    });

    const counts = { total: 0, human: 0, aiAgent: 0, bot: 0, assisted: 0 };

    for (const row of rows) {
      const { authorLink, signals } = extractIssuePrAuthor(row);
      const cls = detector.classifyAccount(signals, settings);

      counts.total += 1;
      if (cls.isBot) {
        if (cls.kind === 'ai-agent') counts.aiAgent += 1;
        else counts.bot += 1;
      } else {
        counts.human += 1;
      }

      row.classList.add('ghbs-issue-item');
      row.classList.remove('ghbs-item--human', 'ghbs-item--bot', 'ghbs-item--ai-agent', 'ghbs-hidden');
      row.classList.add(`ghbs-item--${cls.kind}`);

      row.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

      if (mode === 'split') {
        row.style.order = cls.isBot ? '40' : '20';
      } else if (mode === 'human') {
        row.style.removeProperty('order');
        if (cls.isBot) row.classList.add('ghbs-hidden');
      } else if (mode === 'bot') {
        row.style.removeProperty('order');
        if (!cls.isBot) row.classList.add('ghbs-hidden');
      } else {
        row.style.removeProperty('order');
      }

      const metaTarget =
        (authorLink && authorLink.parentElement) ||
        row.querySelector('[data-testid="timestamp-container"]') ||
        row.querySelector('.opened-by');

      if (metaTarget && cls.baseLogin) {
        const badge = ui.createBadge(cls, {
          allowOverride: true,
          onToggleOverride
        });
        badge.classList.add('ghbs-badge-wrap--inline');
        metaTarget.appendChild(badge);
      }
    }

    const totalBots = counts.aiAgent + counts.bot;

    if (mode === 'split') {
      const humanHeader = ui.createSectionHeader(itemTag, {
        kind: 'human',
        title: isPrPage ? '人类发起的 Pull Requests' : '人类发起的 Issues',
        count: counts.human,
        compact: true
      });
      humanHeader.style.order = '10';
      container.appendChild(humanHeader);

      const botHeader = ui.createSectionHeader(itemTag, {
        kind: counts.aiAgent > 0 ? 'ai-agent' : 'bot',
        title: isPrPage ? 'Bot / AI Agent 发起的 Pull Requests' : 'Bot / AI Agent 发起的 Issues',
        count: totalBots,
        compact: true
      });
      botHeader.style.order = '30';
      container.appendChild(botHeader);

      if (totalBots === 0) {
        const empty = ui.createEl(itemTag, 'ghbs-empty-note ghbs-empty-note--compact', '当前页未检测到 Bot / AI Agent 发起的条目');
        empty.dataset.ghbsOwned = 'true';
        empty.style.order = '41';
        container.appendChild(empty);
      }
    } else if (mode === 'bot' && totalBots === 0) {
      const empty = ui.createEl(itemTag, 'ghbs-empty-note ghbs-empty-note--compact', '当前页未检测到 Bot / AI Agent 条目');
      empty.dataset.ghbsOwned = 'true';
      container.appendChild(empty);
    }

    // 注入工具栏到列表外框上方
    const boxAnchor =
      container.closest('.Box') ||
      container.closest('[data-listview-component="list-view"]')?.parentElement ||
      container.parentElement;
    const existingToolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    const toolbar = ui.renderToolbar(existingToolbar, {
      id: TOOLBAR_ID,
      title: isPrPage ? 'git-blame-ai · Pull Requests 分组' : 'git-blame-ai · Issues 分组',
      mode,
      counts,
      extraSummary:
        totalBots > 0
          ? `当前页检测到 ${counts.aiAgent} 条 AI Agent · ${counts.bot} 条 Bot`
          : '当前页全部由人类发起',
      compact: false,
      onModeChange
    });

    if (!existingToolbar && boxAnchor && boxAnchor.parentElement) {
      boxAnchor.parentElement.insertBefore(toolbar, boxAnchor);
    }

    return {
      view: 'issuesPrs',
      counts
    };
  }

  root.GHBS = root.GHBS || {};
  root.GHBS.views = root.GHBS.views || {};
  root.GHBS.views.issuesPrs = {
    matches,
    render,
    cleanup
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
