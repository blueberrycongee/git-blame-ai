(function (root) {
  'use strict';

  const PATH_RE = /^\/[^/]+\/[^/]+\/(?:commits(?:\/.*)?|pull\/\d+\/commits)\/?$/;
  const TOOLBAR_ID = 'ghbs-commits-toolbar';

  function matches(pathname) {
    return PATH_RE.test(pathname);
  }

  function findCommitRows() {
    const modern = Array.from(document.querySelectorAll('li[data-testid="commit-row-item"]'));
    if (modern.length > 0) return modern;

    const legacy = Array.from(
      document.querySelectorAll('li.js-commits-list-item, li.CommitsListItem, .TimelineItem-body li[data-url*="/commit/"]')
    );
    return legacy;
  }

  /**
   * 提取一条 Commit 中的所有作者与 Co-authored-by 账号信号
   */
  function extractCommitAuthors(row) {
    const candidates = [];

    // 1. 头像链接（多作者时会同时出现多个头像，包括 Co-authored-by 的 Claude / Copilot）
    const avatarLinks = row.querySelectorAll(
      'a[data-testid="avatar-icon-link"], .AvatarStack a[href], a[href^="/apps/"], a[data-hovercard-type="user"], a[href*="commits?author="]'
    );

    const seenEl = new Set();
    for (const a of avatarLinks) {
      if (seenEl.has(a)) continue;
      seenEl.add(a);

      // 跳过提交消息本身或 commit hash 链接
      const href = a.getAttribute('href') || '';
      if (/\/commit\/[0-9a-f]{7,}/i.test(href) || /\/tree\//.test(href)) continue;

      const img = a.querySelector('img');
      let login = (a.textContent || '').trim();
      if (!login && img && img.alt) {
        login = img.alt.replace(/^@/, '').trim();
      }
      if (!login && a.getAttribute('aria-label')) {
        login = a.getAttribute('aria-label').replace(/^@/, '').trim();
      }

      if (!login && !href) continue;

      candidates.push({
        login,
        href,
        avatarSrc: img ? img.getAttribute('src') || '' : '',
        hovercardType: a.getAttribute('data-hovercard-type') || '',
        hovercardUrl: a.getAttribute('data-hovercard-url') || '',
        hasBotBadge: false
      });
    }

    // 2. React 界面中无链接的纯文本作者或头像（如未绑定 GitHub 账号的 git co-author）
    const authorImgs = row.querySelectorAll('img[data-testid="github-avatar"], .AvatarStack img.avatar');
    for (const img of authorImgs) {
      if (img.closest('a') && seenEl.has(img.closest('a'))) continue;
      const alt = (img.alt || '').replace(/^@/, '').trim();
      const src = img.getAttribute('src') || '';
      if (alt || src) {
        candidates.push({
          login: alt,
          href: '',
          avatarSrc: src,
          hovercardType: '',
          hovercardUrl: '',
          hasBotBadge: false
        });
      }
    }

    // 3. 兜底读取 commit author 文本
    if (candidates.length === 0) {
      const authorEl =
        row.querySelector('[data-testid="commit-row-author"]') ||
        row.querySelector('.commit-author');
      if (authorEl) {
        const text = (authorEl.textContent || '').trim();
        if (text) {
          candidates.push({
            login: text,
            href: '',
            avatarSrc: '',
            hovercardType: '',
            hovercardUrl: '',
            hasBotBadge: false
          });
        }
      }
    }

    return candidates;
  }

  function cleanup() {
    const toolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    if (toolbar) toolbar.remove();

    document.querySelectorAll('.ghbs-commit-group-list').forEach((list) => {
      list.classList.remove('ghbs-commit-group-list');
      list.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    });

    document.querySelectorAll('.ghbs-commit-item').forEach((row) => {
      row.classList.remove(
        'ghbs-commit-item',
        'ghbs-item--human',
        'ghbs-item--bot',
        'ghbs-item--ai-agent',
        'ghbs-item--assisted',
        'ghbs-hidden'
      );
      row.style.removeProperty('order');
      row.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());
    });
  }

  function render(ctx) {
    const { settings, mode, onModeChange, onToggleOverride } = ctx;
    const { detector, ui } = root.GHBS;

    if (!settings.enabled || !settings.views.commits) {
      cleanup();
      return null;
    }

    const rows = findCommitRows();
    if (rows.length === 0) return null;

    const counts = { total: 0, human: 0, aiAgent: 0, bot: 0, assisted: 0 };
    const groupMap = new Map();

    for (const row of rows) {
      const authors = extractCommitAuthors(row);
      const groupCls = detector.classifyAccountGroup(authors, settings);

      counts.total += 1;
      if (groupCls.groupKind === 'assisted') counts.assisted += 1;
      else if (groupCls.groupKind === 'ai-agent') counts.aiAgent += 1;
      else if (groupCls.groupKind === 'bot') counts.bot += 1;
      else counts.human += 1;

      const listParent = row.parentElement;
      if (listParent) {
        if (!groupMap.has(listParent)) {
          groupMap.set(listParent, { human: 0, assisted: 0, bot: 0, aiAgent: 0, rows: [] });
        }
        const bucket = groupMap.get(listParent);
        if (groupCls.groupKind === 'assisted') bucket.assisted += 1;
        else if (groupCls.groupKind === 'ai-agent') bucket.aiAgent += 1;
        else if (groupCls.groupKind === 'bot') bucket.bot += 1;
        else bucket.human += 1;
        bucket.rows.push({ row, groupCls });
      }
    }

    // 按每个日期分组列表分别应用过滤/分组顺序
    for (const [listParent, bucket] of groupMap.entries()) {
      listParent.classList.add('ghbs-commit-group-list');
      Array.from(listParent.children).forEach((child) => {
        if (child.dataset && child.dataset.ghbsOwned === 'true') child.remove();
      });

      const groupBots = bucket.bot + bucket.aiAgent;

      for (const { row, groupCls } of bucket.rows) {
        row.classList.add('ghbs-commit-item');
        row.classList.remove(
          'ghbs-item--human',
          'ghbs-item--bot',
          'ghbs-item--ai-agent',
          'ghbs-item--assisted',
          'ghbs-hidden'
        );
        row.classList.add(`ghbs-item--${groupCls.groupKind}`);

        // 清理旧徽章
        row.querySelectorAll('[data-ghbs-owned="true"]').forEach((el) => el.remove());

        // 可见性与排序
        if (mode === 'split') {
          if (groupCls.groupKind === 'human') row.style.order = '20';
          else if (groupCls.groupKind === 'assisted') row.style.order = '40';
          else row.style.order = '60';
        } else if (mode === 'human') {
          row.style.removeProperty('order');
          if (groupCls.groupKind !== 'human') row.classList.add('ghbs-hidden');
        } else if (mode === 'bot') {
          row.style.removeProperty('order');
          if (groupCls.groupKind === 'human') row.classList.add('ghbs-hidden');
        } else {
          row.style.removeProperty('order');
        }

        // 注入徽章
        const target =
          row.querySelector('[class*="CommitAttributionContainer"]') ||
          row.querySelector('[data-testid="author-avatar"]')?.parentElement ||
          row.querySelector('[data-testid="commit-row-author"]')?.parentElement ||
          row.querySelector('h4') ||
          row.querySelector('.f6') ||
          row.firstElementChild;

        if (target) {
          let badgeWrap = null;
          if (groupCls.groupKind === 'assisted') {
            const botNames = groupCls.bots.map((b) => b.display).join(', ');
            badgeWrap = ui.createBadge(groupCls.primary, {
              forceKind: 'assisted',
              label: 'AI 协作',
              title: `人类与 Bot/Agent 共同提交（协作者: ${botNames}）`,
              allowOverride: true,
              onToggleOverride
            });
          } else if (groupCls.groupKind === 'human' && groupCls.isAssisted) {
            const botNames = groupCls.bots.map((b) => b.display).join(', ');
            badgeWrap = ui.createBadge(groupCls.primary, {
              forceKind: 'assisted',
              label: 'AI 辅助',
              title: `人类主导提交（归入人类贡献 · 辅助工具: ${botNames}）`,
              allowOverride: true,
              onToggleOverride
            });
          } else if (groupCls.isBot) {
            badgeWrap = ui.createBadge(groupCls.primary, {
              allowOverride: true,
              onToggleOverride
            });
          } else if (groupCls.primary && groupCls.primary.baseLogin) {
            badgeWrap = ui.createBadge(groupCls.primary, {
              allowOverride: true,
              onToggleOverride
            });
          }
          if (badgeWrap) {
            badgeWrap.classList.add('ghbs-badge-wrap--inline');
            target.appendChild(badgeWrap);
          }
        }
      }

      // 分组模式下，仅当该日期分组同时存在多种类型（或存在 bot/assisted）时展示分组头，避免满屏冗余标题
      if (mode === 'split' && (groupBots > 0 || bucket.assisted > 0)) {
        if (bucket.human > 0) {
          const hh = ui.createSectionHeader('li', {
            kind: 'human',
            title: '人类提交',
            count: bucket.human,
            compact: true
          });
          hh.style.order = '10';
          listParent.appendChild(hh);
        }
        if (bucket.assisted > 0) {
          const ah = ui.createSectionHeader('li', {
            kind: 'assisted',
            title: '人类 + AI 协作提交',
            count: bucket.assisted,
            compact: true
          });
          ah.style.order = '30';
          listParent.appendChild(ah);
        }
        if (groupBots > 0) {
          const bh = ui.createSectionHeader('li', {
            kind: bucket.aiAgent > 0 ? 'ai-agent' : 'bot',
            title: 'Bot / Agent 提交',
            count: groupBots,
            compact: true
          });
          bh.style.order = '50';
          listParent.appendChild(bh);
        }
      }
    }

    // 注入顶部工具栏（放在第一个提交分组容器上方）
    const firstList = groupMap.keys().next().value;
    const anchor =
      (firstList && (firstList.closest('[data-testid="commit-group"]') || firstList.closest('.TimelineItem'))) ||
      firstList;

    const existingToolbar = document.querySelector(`[data-ghbs-id="${TOOLBAR_ID}"]`);
    const summaryParts = [];
    if (counts.assisted > 0) summaryParts.push(`AI 协作 ${counts.assisted}`);
    if (counts.aiAgent > 0) summaryParts.push(`AI Agent ${counts.aiAgent}`);
    if (counts.bot > 0) summaryParts.push(`Bot ${counts.bot}`);

    const toolbar = ui.renderToolbar(existingToolbar, {
      id: TOOLBAR_ID,
      mode,
      counts,
      extraSummary: summaryParts.length > 0 ? summaryParts.join(' · ') : '',
      compact: false,
      onModeChange
    });

    if (!existingToolbar && anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(toolbar, anchor);
    }

    return {
      view: 'commits',
      counts
    };
  }

  root.GHBS = root.GHBS || {};
  root.GHBS.views = root.GHBS.views || {};
  root.GHBS.views.commits = {
    matches,
    render,
    cleanup
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
