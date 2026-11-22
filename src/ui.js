(function (root) {
  'use strict';

  const MODES = [
    { key: 'split', label: '分组' },
    { key: 'human', label: '仅人类' },
    { key: 'bot', label: 'Bot / Agent' },
    { key: 'all', label: '全部' }
  ];

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function makeSvgIcon(kind) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ghbs-icon');

    const path = document.createElementNS(svgNS, 'path');
    if (kind === 'human') {
      path.setAttribute(
        'd',
        'M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z'
      );
    } else if (kind === 'ai-agent' || kind === 'assisted') {
      // Sparkle / Agent icon
      path.setAttribute(
        'd',
        'M7.53 1.282a.5.5 0 0 1 .94 0l1.178 3.237a.5.5 0 0 0 .303.303l3.237 1.178a.5.5 0 0 1 0 .94l-3.237 1.178a.5.5 0 0 0-.303.303L8.47 11.658a.5.5 0 0 1-.94 0L6.352 8.421a.5.5 0 0 0-.303-.303L2.812 6.94a.5.5 0 0 1 0-.94l3.237-1.178a.5.5 0 0 0 .303-.303L7.53 1.282ZM12.5 10.25a.4.4 0 0 1 .752 0l.445 1.224a.4.4 0 0 0 .242.242l1.224.445a.4.4 0 0 1 0 .752l-1.224.445a.4.4 0 0 0-.242.242l-.445 1.224a.4.4 0 0 1-.752 0l-.445-1.224a.4.4 0 0 0-.242-.242l-1.224-.445a.4.4 0 0 1 0-.752l1.224-.445a.4.4 0 0 0 .242-.242l.445-1.224Z'
      );
    } else {
      // Bot / CPU icon
      path.setAttribute(
        'd',
        'M6.5 1.75a.75.75 0 0 1 1.5 0V3h2.25A2.75 2.75 0 0 1 13 5.75v4.5A2.75 2.75 0 0 1 10.25 13h-4.5A2.75 2.75 0 0 1 3 10.25v-4.5A2.75 2.75 0 0 1 5.75 3H6.5V1.75ZM5.75 4.5A1.25 1.25 0 0 0 4.5 5.75v4.5c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25h-4.5ZM6.5 7.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z'
      );
    }

    svg.appendChild(path);
    return svg;
  }

  /**
   * 渲染或更新顶部控制工具栏
   */
  function renderToolbar(existingEl, options) {
    const {
      id,
      title,
      mode,
      counts,
      extraSummary,
      compact,
      onModeChange
    } = options;

    const bar = existingEl || createEl('div', 'ghbs-toolbar');
    bar.dataset.ghbsId = id || 'toolbar';
    bar.classList.toggle('ghbs-toolbar--compact', Boolean(compact));
    bar.textContent = '';

    const topRow = createEl('div', 'ghbs-toolbar-row');

    if (!compact && title) {
      const titleWrap = createEl('div', 'ghbs-toolbar-title');
      titleWrap.appendChild(makeSvgIcon('ai-agent'));
      titleWrap.appendChild(createEl('span', 'ghbs-toolbar-title-text', title));
      topRow.appendChild(titleWrap);
    }

    const tabs = createEl('div', 'ghbs-tabs');
    tabs.setAttribute('role', 'tablist');

    const total = counts.total || 0;
    const humanCount = counts.human || 0;
    const botCount = (counts.bot || 0) + (counts.aiAgent || 0);
    const assistedCount = counts.assisted || 0;

    const countByMode = {
      split: null,
      human: humanCount,
      bot: botCount,
      all: total
    };

    for (const item of MODES) {
      const btn = createEl('button', 'ghbs-tab');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(mode === item.key));
      btn.dataset.mode = item.key;
      if (mode === item.key) btn.classList.add('is-active');

      const labelSpan = createEl('span', 'ghbs-tab-label', item.label);
      btn.appendChild(labelSpan);

      const countVal = countByMode[item.key];
      if (countVal !== null && countVal !== undefined) {
        const badge = createEl('span', 'ghbs-tab-count', String(countVal));
        if (item.key === 'bot' && botCount > 0) badge.classList.add('ghbs-tab-count--bot');
        if (item.key === 'human') badge.classList.add('ghbs-tab-count--human');
        btn.appendChild(badge);
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onModeChange === 'function') {
          onModeChange(item.key);
        }
      });

      tabs.appendChild(btn);
    }

    topRow.appendChild(tabs);

    if (!compact && extraSummary) {
      const summaryEl = createEl('div', 'ghbs-toolbar-summary', extraSummary);
      topRow.appendChild(summaryEl);
    } else if (!compact && assistedCount > 0) {
      const assistedPill = createEl('span', 'ghbs-assisted-summary', `AI 协作 ${assistedCount}`);
      topRow.appendChild(assistedPill);
    }

    bar.appendChild(topRow);

    // 比例条（当有数据时显示）
    const barTotal = humanCount + assistedCount + (counts.aiAgent || 0) + (counts.bot || 0);
    if (barTotal > 0) {
      const ratioWrap = createEl('div', 'ghbs-ratio-bar');
      const humanPct = (humanCount / barTotal) * 100;
      const assistedPct = (assistedCount / barTotal) * 100;
      const aiPct = ((counts.aiAgent || 0) / barTotal) * 100;
      const botPct = ((counts.bot || 0) / barTotal) * 100;

      if (humanPct > 0) {
        const seg = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--human');
        seg.style.width = `${humanPct.toFixed(2)}%`;
        seg.title = `人类: ${humanCount} (${humanPct.toFixed(1)}%)`;
        ratioWrap.appendChild(seg);
      }
      if (assistedPct > 0) {
        const seg = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--assisted');
        seg.style.width = `${assistedPct.toFixed(2)}%`;
        seg.title = `人类 + AI 协作: ${assistedCount} (${assistedPct.toFixed(1)}%)`;
        ratioWrap.appendChild(seg);
      }
      if (aiPct > 0) {
        const seg = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--ai');
        seg.style.width = `${aiPct.toFixed(2)}%`;
        seg.title = `AI Agent: ${counts.aiAgent} (${aiPct.toFixed(1)}%)`;
        ratioWrap.appendChild(seg);
      }
      if (botPct > 0) {
        const seg = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--bot');
        seg.style.width = `${botPct.toFixed(2)}%`;
        seg.title = `Bot: ${counts.bot} (${botPct.toFixed(1)}%)`;
        ratioWrap.appendChild(seg);
      }
      bar.appendChild(ratioWrap);
    }

    return bar;
  }

  /**
   * 创建分组模式下的区域标题元素
   */
  function createSectionHeader(tagName, options) {
    const { kind, title, count, detail, compact } = options;
    const el = createEl(tagName || 'li', `ghbs-section-header ghbs-section-header--${kind}`);
    if (compact) el.classList.add('ghbs-section-header--compact');
    el.dataset.ghbsOwned = 'true';
    el.dataset.ghbsHeader = kind;

    const left = createEl('div', 'ghbs-section-header-left');
    left.appendChild(makeSvgIcon(kind));
    left.appendChild(createEl('span', 'ghbs-section-title', title));
    left.appendChild(createEl('span', 'ghbs-section-count', String(count)));
    el.appendChild(left);

    if (detail) {
      el.appendChild(createEl('span', 'ghbs-section-detail', detail));
    }

    return el;
  }

  /**
   * 创建行内身份徽章（AI Agent / Bot / AI 协作），并支持快速手动覆写
   */
  function createBadge(classification, options) {
    const opts = options || {};
    const wrap = createEl('span', 'ghbs-badge-wrap');
    wrap.dataset.ghbsOwned = 'true';

    if (classification.isBot || opts.forceKind) {
      const kind = opts.forceKind || classification.kind;
      const text = opts.label || classification.label;
      const badge = createEl('span', `ghbs-badge ghbs-badge--${kind}`);
      badge.appendChild(makeSvgIcon(kind));
      badge.appendChild(createEl('span', '', text));
      badge.title = opts.title || classification.reason || text;
      wrap.appendChild(badge);
    }

    if (opts.allowOverride && classification.baseLogin && typeof opts.onToggleOverride === 'function') {
      const btn = createEl('button', 'ghbs-override-btn');
      btn.type = 'button';
      if (classification.overridden) {
        btn.textContent = '重置';
        btn.title = `当前已手动覆写（${classification.label}），点击恢复自动识别`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          opts.onToggleOverride(classification.baseLogin, 'auto');
        });
      } else if (classification.isBot) {
        btn.textContent = '标为人类';
        btn.title = `误判了？点击将 @${classification.display} 标记为人类账号`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          opts.onToggleOverride(classification.baseLogin, 'human');
        });
      } else {
        btn.textContent = '标为 Bot';
        btn.title = `这是机器人或 AI Agent？点击将 @${classification.display} 标记为 Bot / Agent`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          opts.onToggleOverride(classification.baseLogin, 'bot');
        });
      }
      wrap.appendChild(btn);
    }

    return wrap;
  }

  const api = {
    MODES,
    createEl,
    makeSvgIcon,
    renderToolbar,
    createSectionHeader,
    createBadge
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GHBS = root.GHBS || {};
    root.GHBS.ui = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
