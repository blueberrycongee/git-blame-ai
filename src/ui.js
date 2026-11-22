(function (root) {
  'use strict';

  const MODES = [
    { key: 'split', label: '分组' },
    { key: 'human', label: '人类' },
    { key: 'bot', label: 'Bot / Agent' },
    { key: 'all', label: '全部' }
  ];

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  /**
   * 渲染极简单色控制栏
   */
  function renderToolbar(existingEl, options) {
    const {
      id,
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

    const row = createEl('div', 'ghbs-toolbar-row');

    const tabs = createEl('div', 'ghbs-tabs');
    tabs.setAttribute('role', 'tablist');

    const total = counts.total || 0;
    const humanCount = counts.human || 0;
    const botCount = (counts.bot || 0) + (counts.aiAgent || 0);

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

      const labelText = compact && item.key === 'bot' ? 'Bot' : item.label;
      btn.appendChild(createEl('span', 'ghbs-tab-label', labelText));

      const countVal = countByMode[item.key];
      if (countVal !== null && countVal !== undefined) {
        btn.appendChild(createEl('span', 'ghbs-tab-count', String(countVal)));
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

    row.appendChild(tabs);

    if (!compact && extraSummary) {
      row.appendChild(createEl('div', 'ghbs-toolbar-summary', extraSummary));
    }

    bar.appendChild(row);
    return bar;
  }

  /**
   * 创建极简细线分组标题（支持可选的折叠按钮）
   */
  function createSectionHeader(tagName, options) {
    const { kind, title, count, detail, compact, collapsible, collapsed, onToggleCollapse } = options;
    const el = createEl(tagName || 'li', `ghbs-section-header ghbs-section-header--${kind}`);
    if (compact) el.classList.add('ghbs-section-header--compact');
    el.dataset.ghbsOwned = 'true';
    el.dataset.ghbsHeader = kind;

    const left = createEl('div', 'ghbs-section-header-left');
    left.appendChild(createEl('span', 'ghbs-section-title', title));
    left.appendChild(createEl('span', 'ghbs-section-count', String(count)));
    el.appendChild(left);

    const right = createEl('div', 'ghbs-section-header-right');
    if (detail) {
      right.appendChild(createEl('span', 'ghbs-section-detail', detail));
    }
    if (collapsible && typeof onToggleCollapse === 'function') {
      const btn = createEl('button', 'ghbs-collapse-btn', collapsed ? '展开' : '收起');
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleCollapse();
      });
      right.appendChild(btn);
    }
    if (right.childNodes.length > 0) {
      el.appendChild(right);
    }

    return el;
  }

  /**
   * 创建极简单色行内身份标签（Bot / Agent / AI 辅助），支持悬停快速覆写
   */
  function createBadge(classification, options) {
    const opts = options || {};
    const wrap = createEl('span', 'ghbs-badge-wrap');
    wrap.dataset.ghbsOwned = 'true';

    if (classification.isBot || opts.forceKind) {
      const kind = opts.forceKind || classification.kind;
      const text = opts.label || (classification.kind === 'ai-agent' ? 'Agent' : classification.label);
      const badge = createEl('span', `ghbs-badge ghbs-badge--${kind}`, text);
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
        btn.title = `点击将 @${classification.display} 标记为 Bot / Agent`;
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
