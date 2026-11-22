(function (root) {
  'use strict';

  const TOOLBAR_ID = 'ghbs-sidebar-contributors-toolbar';

  function findSidebarCell() {
    const sidebar = document.querySelector('.Layout-sidebar') || document.querySelector('.repository-content');
    if (!sidebar) return null;

    const links = sidebar.querySelectorAll('h2 a[href*="/graphs/contributors"], h3 a[href*="/graphs/contributors"]');
    for (const link of links) {
      const cell = link.closest('.BorderGrid-cell') || link.closest('div');
      if (cell && cell.querySelector('ul')) {
        return { cell, heading: link.closest('h2, h3') };
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
    const img = li.querySelector('img.avatar') || li.querySelector('img[src*="avatars.githubusercontent.com"]');
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
    const toolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    if (toolbar) toolbar.remove();

    const found = findSidebarCell();
    if (!found) return;
    const ul = found.cell.querySelector('ul');
    if (!ul) return;

    ul.classList.remove('ghbs-sidebar-list', 'ghbs-sidebar-grid', 'ghbs-sidebar-rows');
    ul.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    ul.querySelectorAll('li.ghbs-sidebar-item').forEach((li) => {
      li.classList.remove(
        'ghbs-sidebar-item',
        'ghbs-item--human',
        'ghbs-item--bot',
        'ghbs-item--ai-agent',
        'ghbs-hidden'
      );
      li.style.removeProperty('order');
      delete li.dataset.ghbsKind;
    });
  }

  function render(ctx) {
    const { settings, mode, onModeChange } = ctx;
    const { detector, ui } = root.GHBS;

    if (!settings.enabled || !settings.views.repoSidebar) {
      cleanup();
      return null;
    }

    const found = findSidebarCell();
    if (!found) return null;

    const { cell, heading } = found;
    const ul = cell.querySelector('ul');
    if (!ul) return null;

    const items = Array.from(ul.children).filter(
      (el) => el.tagName === 'LI' && el.dataset.ghbsOwned !== 'true' && el.querySelector('a, img')
    );

    if (items.length === 0) return null;

    const isAvatarGrid =
      ul.classList.contains('flex-wrap') ||
      items.every((li) => (li.textContent || '').trim().length === 0);

    ul.classList.add('ghbs-sidebar-list');
    ul.classList.toggle('ghbs-sidebar-grid', isAvatarGrid);
    ul.classList.toggle('ghbs-sidebar-rows', !isAvatarGrid);

    Array.from(ul.children).forEach((child) => {
      if (child.dataset && child.dataset.ghbsOwned === 'true') child.remove();
    });

    const counts = { total: 0, human: 0, aiAgent: 0, bot: 0, assisted: 0 };

    for (const li of items) {
      const { link, signals } = extractSidebarSignals(li);
      const cls = detector.classifyAccount(signals, settings);

      counts.total += 1;
      if (cls.isBot) {
        if (cls.kind === 'ai-agent') counts.aiAgent += 1;
        else counts.bot += 1;
      } else {
        counts.human += 1;
      }

      li.classList.add('ghbs-sidebar-item');
      li.classList.remove('ghbs-item--human', 'ghbs-item--bot', 'ghbs-item--ai-agent', 'ghbs-hidden');
      li.classList.add(`ghbs-item--${cls.kind}`);
      li.dataset.ghbsKind = cls.kind;

      // 清理行内旧徽章
      li.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

      if (link) {
        link.title = `${cls.display} · ${cls.label}（${cls.reason}）`;
      }

      if (!isAvatarGrid && cls.isBot) {
        const badge = ui.createBadge(cls, { allowOverride: false });
        li.appendChild(badge);
      }

      if (mode === 'split') {
        li.style.order = cls.isBot ? '40' : '20';
      } else if (mode === 'human') {
        li.style.removeProperty('order');
        if (cls.isBot) li.classList.add('ghbs-hidden');
      } else if (mode === 'bot') {
        li.style.removeProperty('order');
        if (!cls.isBot) li.classList.add('ghbs-hidden');
      } else {
        li.style.removeProperty('order');
      }
    }

    const totalBots = counts.aiAgent + counts.bot;

    if (mode === 'split' && (totalBots > 0 || counts.human > 0)) {
      const hHeader = ui.createSectionHeader('li', {
        kind: 'human',
        title: '人类',
        count: counts.human,
        compact: true
      });
      hHeader.style.order = '10';
      ul.appendChild(hHeader);

      const bHeader = ui.createSectionHeader('li', {
        kind: counts.aiAgent > 0 ? 'ai-agent' : 'bot',
        title: 'Bot / Agent',
        count: totalBots,
        compact: true
      });
      bHeader.style.order = '30';
      ul.appendChild(bHeader);

      if (totalBots === 0) {
        const none = ui.createEl('li', 'ghbs-empty-note ghbs-empty-note--compact', '暂无 Bot / Agent');
        none.dataset.ghbsOwned = 'true';
        none.style.order = '41';
        ul.appendChild(none);
      }
    } else if (mode === 'bot' && totalBots === 0) {
      const none = ui.createEl('li', 'ghbs-empty-note ghbs-empty-note--compact', '侧边栏未检测到 Bot / Agent');
      none.dataset.ghbsOwned = 'true';
      ul.appendChild(none);
    }

    const existingToolbar = cell.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    const toolbar = ui.renderToolbar(existingToolbar, {
      id: TOOLBAR_ID,
      mode,
      counts,
      compact: true,
      onModeChange
    });

    if (!existingToolbar) {
      if (heading && heading.nextSibling) {
        heading.parentElement.insertBefore(toolbar, heading.nextSibling);
      } else {
        cell.insertBefore(toolbar, ul);
      }
    }

    return {
      view: 'repoSidebar',
      counts
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
