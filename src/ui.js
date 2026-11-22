(function (root) {
  'use strict';

  const MODE_META = {
    human: { key: 'human', label: '人类' },
    bot: { key: 'bot', label: 'Bot / Agent' },
    all: { key: 'all', label: '全部' }
  };

  const DEFAULT_MODE_ORDER = ['human', 'bot', 'all'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function createSvgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
      }
    }
    return el;
  }

  /**
   * 渲染极简单色控制栏（支持可选的全局占比条）
   */
  function renderToolbar(existingEl, options) {
    const {
      id,
      mode,
      modeOrder,
      counts,
      extraSummary,
      ratioBar,
      compact,
      onModeChange
    } = options;

    const bar = existingEl || createEl('div', 'ghbs-toolbar');
    bar.dataset.ghbsId = id || 'toolbar';
    bar.dataset.ghbsOwned = 'true';
    bar.classList.toggle('ghbs-toolbar--compact', Boolean(compact));
    bar.textContent = '';

    const row = createEl('div', 'ghbs-toolbar-row');

    const tabs = createEl('div', 'ghbs-tabs');
    tabs.setAttribute('role', 'tablist');

    const total = counts && counts.total !== undefined ? counts.total : null;
    const humanCount = counts && counts.human !== undefined ? counts.human : null;
    const botCount =
      counts && (counts.bot !== undefined || counts.aiAgent !== undefined || counts.totalBots !== undefined)
        ? counts.totalBots !== undefined
          ? counts.totalBots
          : (counts.bot || 0) + (counts.aiAgent || 0)
        : null;

    const countByMode = {
      human: humanCount,
      bot: botCount,
      all: total
    };

    const order = Array.isArray(modeOrder) && modeOrder.length > 0 ? modeOrder : DEFAULT_MODE_ORDER;

    for (const key of order) {
      const item = MODE_META[key];
      if (!item) continue;

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

    if (!compact && ratioBar && (ratioBar.humanPct > 0 || ratioBar.aiAgentPct > 0 || ratioBar.botPct > 0)) {
      const track = createEl('div', 'ghbs-ratio-track');
      track.setAttribute('aria-hidden', 'true');

      if (ratioBar.humanPct > 0) {
        const segH = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--human');
        segH.style.width = `${ratioBar.humanPct.toFixed(2)}%`;
        segH.title = `人类 ${ratioBar.humanPct.toFixed(1)}%`;
        track.appendChild(segH);
      }
      if (ratioBar.aiAgentPct > 0) {
        const segA = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--ai');
        segA.style.width = `${ratioBar.aiAgentPct.toFixed(2)}%`;
        segA.title = `AI Agent ${ratioBar.aiAgentPct.toFixed(1)}%`;
        track.appendChild(segA);
      }
      if (ratioBar.botPct > 0) {
        const segB = createEl('span', 'ghbs-ratio-seg ghbs-ratio-seg--bot');
        segB.style.width = `${ratioBar.botPct.toFixed(2)}%`;
        segB.title = `Bot ${ratioBar.botPct.toFixed(1)}%`;
        track.appendChild(segB);
      }

      bar.appendChild(track);
    }

    return bar;
  }

  /**
   * 格式化周时间戳为简洁日期标签（如 "Oct 19" 或 "2025-04"）
   */
  function formatWeekLabel(unixSeconds, spanDays) {
    if (!unixSeconds) return '';
    const d = new Date(unixSeconds * 1000);
    if (Number.isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (spanDays > 300) {
      return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }

  /**
   * 绘制与 GitHub Contributors 卡片视觉和谐的周贡献柱状图（SVG）
   */
  function createWeeklyChartSvg(bars) {
    const wrap = createEl('div', 'ghbs-bot-chart');
    if (!Array.isArray(bars) || bars.length === 0) {
      wrap.appendChild(createEl('div', 'ghbs-bot-chart-empty', '暂无周提交趋势数据'));
      return wrap;
    }

    const width = 420;
    const height = 84;
    const padTop = 6;
    const padBottom = 18;
    const chartH = height - padTop - padBottom;

    let maxCommits = 0;
    for (const b of bars) {
      if (b.commits > maxCommits) maxCommits = b.commits;
    }
    if (maxCommits === 0) maxCommits = 1;

    const svg = createSvgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'ghbs-bot-chart-svg',
      role: 'img',
      'aria-label': 'Weekly commits chart'
    });

    // 基线
    svg.appendChild(
      createSvgEl('line', {
        x1: 0,
        y1: padTop + chartH,
        x2: width,
        y2: padTop + chartH,
        class: 'ghbs-bot-chart-axis'
      })
    );

    const n = bars.length;
    const gap = n > 24 ? 1.5 : 3;
    const barW = Math.max(2, (width - gap * (n - 1)) / n);

    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const h = b.commits > 0 ? Math.max(2, (b.commits / maxCommits) * chartH) : 0;
      if (h <= 0) continue;

      const x = i * (barW + gap);
      const y = padTop + chartH - h;
      const rect = createSvgEl('rect', {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: barW.toFixed(1),
        height: h.toFixed(1),
        rx: 1.5,
        class: 'ghbs-bot-chart-bar'
      });

      const titleEl = createSvgEl('title');
      const startDate = b.start ? new Date(b.start * 1000).toISOString().slice(0, 10) : '';
      titleEl.textContent = `${startDate}: ${b.commits} commits (+${b.additions} / -${b.deletions})`;
      rect.appendChild(titleEl);
      svg.appendChild(rect);
    }

    // 底部起止与中点时间刻度（最多 3 个，绝不重叠）
    const firstTs = bars[0].start || 0;
    const lastTs = bars[n - 1].end || bars[n - 1].start || 0;
    const spanDays = Math.max(0, (lastTs - firstTs) / 86400);

    const addTick = (x, text, anchor) => {
      if (!text) return;
      const t = createSvgEl('text', {
        x,
        y: height - 3,
        'text-anchor': anchor,
        class: 'ghbs-bot-chart-tick'
      });
      t.textContent = text;
      svg.appendChild(t);
    };

    const startText = formatWeekLabel(firstTs, spanDays);
    const endText = formatWeekLabel(lastTs, spanDays);
    addTick(0, startText, 'start');
    if (n >= 4) {
      const midTs = bars[Math.floor(n / 2)].start || 0;
      const midText = formatWeekLabel(midTs, spanDays);
      if (midText && midText !== startText && midText !== endText) {
        addTick(width / 2, midText, 'middle');
      }
    }
    if (endText && endText !== startText) {
      addTick(width, endText, 'end');
    }

    wrap.appendChild(svg);
    return wrap;
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
    MODE_META,
    DEFAULT_MODE_ORDER,
    createEl,
    renderToolbar,
    createWeeklyChartSvg,
    createBadge
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GHBS = root.GHBS || {};
    root.GHBS.ui = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
