(function () {
  'use strict';

  const { storage, detector } = window.GHBS;

  const VIEW_LABELS = {
    contributorsGraph: 'Contributors 页面',
    repoSidebar: '仓库侧边栏 Contributors'
  };

  let state = storage.DEFAULT_SETTINGS;

  function $(id) {
    return document.getElementById(id);
  }

  function renderSettings() {
    $('opt-enabled').checked = Boolean(state.enabled);
    $('view-contributorsGraph').checked = Boolean(state.views.contributorsGraph);
    $('view-repoSidebar').checked = Boolean(state.views.repoSidebar);
    $('opt-distinguishAiAgent').checked = Boolean(state.distinguishAiAgent);
    $('opt-detectHeuristics').checked = Boolean(state.detectHeuristics);

    document.querySelectorAll('#mode-group .seg-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === state.defaultMode);
    });

    renderRuleChips();
  }

  function renderRuleChips() {
    const host = $('rule-chips');
    host.textContent = '';

    const items = [
      ...(state.customBots || []).map((val) => ({ type: 'bot', prefix: 'Bot:', val })),
      ...(state.customHumans || []).map((val) => ({ type: 'human', prefix: '人类:', val })),
      ...(state.customPatterns || []).map((val) => ({ type: 'pattern', prefix: '规则:', val }))
    ];

    for (const item of items) {
      const chip = document.createElement('span');
      chip.className = `chip chip--${item.type}`;
      chip.textContent = `${item.prefix} ${item.val}`;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-del';
      del.textContent = '×';
      del.title = '移除';
      del.addEventListener('click', async () => {
        if (item.type === 'bot') {
          state = await storage.updateSettings({
            customBots: state.customBots.filter((x) => x !== item.val)
          });
        } else if (item.type === 'human') {
          state = await storage.updateSettings({
            customHumans: state.customHumans.filter((x) => x !== item.val)
          });
        } else {
          state = await storage.updateSettings({
            customPatterns: state.customPatterns.filter((x) => x !== item.val)
          });
        }
        renderSettings();
      });

      chip.appendChild(del);
      host.appendChild(chip);
    }
  }

  function fetchLiveStats() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;

      chrome.tabs.sendMessage(tab.id, { type: 'GHBS_GET_STATS' }, (resp) => {
        if (chrome.runtime.lastError || !resp || !Array.isArray(resp.reports) || resp.reports.length === 0) {
          return;
        }

        const primary = resp.reports[0];
        const totals = resp.reports.reduce(
          (acc, r) => {
            acc.human += (r.counts && r.counts.human) || 0;
            acc.aiAgent += (r.counts && r.counts.aiAgent) || 0;
            acc.bot += (r.counts && r.counts.bot) || 0;
            acc.assisted += (r.counts && r.counts.assisted) || 0;
            return acc;
          },
          { human: 0, aiAgent: 0, bot: 0, assisted: 0 }
        );

        $('live-view-name').textContent = VIEW_LABELS[primary.view] || primary.view;
        $('stat-human').textContent = String(totals.human);
        $('stat-ai').textContent = String(totals.aiAgent);
        $('stat-bot').textContent = String(totals.bot);

        if (primary.commits && primary.commits.human + primary.commits.bot > 0) {
          const totalC = primary.commits.human + primary.commits.bot;
          const hPct = ((primary.commits.human / totalC) * 100).toFixed(1);
          const bPct = ((primary.commits.bot / totalC) * 100).toFixed(1);
          const scopeLabel = primary.isFullData ? '全仓库 Top 100' : '当前已加载';
          $('live-hint').textContent = `${scopeLabel}提交占比：人类 ${hPct}% · Bot/Agent ${bPct}%`;
        } else {
          $('live-hint').textContent = '已自动识别，可直接在页面工具栏切换视图。';
        }
      });
    });
  }

  function notifyActiveTabMode(mode) {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'GHBS_SET_MODE', mode }, () => {
        void chrome.runtime.lastError;
      });
    });
  }

  function bindEvents() {
    $('opt-enabled').addEventListener('change', async (e) => {
      state = await storage.updateSettings({ enabled: e.target.checked });
    });

    for (const key of ['contributorsGraph', 'repoSidebar']) {
      $(`view-${key}`).addEventListener('change', async (e) => {
        state = await storage.updateSettings({
          views: { [key]: e.target.checked }
        });
      });
    }

    $('opt-distinguishAiAgent').addEventListener('change', async (e) => {
      state = await storage.updateSettings({ distinguishAiAgent: e.target.checked });
    });

    $('opt-detectHeuristics').addEventListener('change', async (e) => {
      state = await storage.updateSettings({ detectHeuristics: e.target.checked });
    });

    document.querySelectorAll('#mode-group .seg-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode;
        state = await storage.updateSettings({ defaultMode: mode });
        renderSettings();
        notifyActiveTabMode(mode);
      });
    });

    $('rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputEl = $('rule-input');
      const type = $('rule-type').value;
      const raw = (inputEl.value || '').trim();
      if (!raw) return;

      if (type === 'pattern') {
        const next = Array.from(new Set([...(state.customPatterns || []), raw]));
        state = await storage.updateSettings({ customPatterns: next });
      } else {
        const base = detector.normalizeLogin(raw).baseLogin;
        if (!base) return;
        state = await storage.setAccountOverride(base, type === 'bot' ? 'bot' : 'human');
      }

      inputEl.value = '';
      renderSettings();
    });
  }

  async function init() {
    state = await storage.loadSettings();
    renderSettings();
    bindEvents();
    fetchLiveStats();
  }

  init();
})();
