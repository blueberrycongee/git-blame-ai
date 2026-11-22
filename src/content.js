(function (root) {
  'use strict';

  const GHBS = root.GHBS || {};
  const { storage, views } = GHBS;

  let currentSettings = storage.DEFAULT_SETTINGS;
  let currentModeByView = {};
  let lastUrl = window.location.href;
  let isRendering = false;
  let debounceTimer = null;
  let latestReport = null;

  function getModeForView(viewName) {
    return currentModeByView[viewName] || currentSettings.defaultMode || 'split';
  }

  function handleModeChange(viewName, nextMode) {
    currentModeByView[viewName] = nextMode;
    scheduleRender(0);
  }

  async function handleToggleOverride(baseLogin, targetKind) {
    currentSettings = await storage.setAccountOverride(baseLogin, targetKind);
    scheduleRender(0);
  }

  function runAllViews() {
    if (isRendering) return;
    isRendering = true;

    try {
      const pathname = window.location.pathname;
      const reports = [];

      const viewEntries = [
        ['contributorsGraph', views.contributorsGraph],
        ['repoSidebar', views.repoSidebar],
        ['commits', views.commits],
        ['issuesPrs', views.issuesPrs]
      ];

      for (const [name, view] of viewEntries) {
        if (!view) continue;
        if (view.matches(pathname)) {
          const result = view.render({
            settings: currentSettings,
            mode: getModeForView(name),
            onModeChange: (nextMode) => handleModeChange(name, nextMode),
            onToggleOverride: handleToggleOverride
          });
          if (result) reports.push(result);
        } else {
          view.cleanup();
        }
      }

      latestReport = {
        url: window.location.href,
        pathname,
        enabled: currentSettings.enabled,
        reports
      };
    } catch (err) {
      // 保持静默，不影响 GitHub 页面正常运行
      console.debug('[GHBS] render error:', err);
    } finally {
      isRendering = false;
    }
  }

  function scheduleRender(delayMs) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runAllViews();
    }, typeof delayMs === 'number' ? delayMs : 120);
  }

  function isMutationOwnedByUs(mutations) {
    for (const m of mutations) {
      if (m.target && m.target.nodeType === 1) {
        if (m.target.dataset && m.target.dataset.ghbsOwned === 'true') continue;
        if (m.target.closest && m.target.closest('.ghbs-toolbar, [data-ghbs-owned="true"]')) continue;
      }
      if (m.type === 'childList') {
        const externalAdded = Array.from(m.addedNodes).some(
          (n) => n.nodeType === 1 && !(n.dataset && n.dataset.ghbsOwned === 'true') && !n.classList.contains('ghbs-toolbar')
        );
        const externalRemoved = Array.from(m.removedNodes).some(
          (n) => n.nodeType === 1 && !(n.dataset && n.dataset.ghbsOwned === 'true') && !n.classList.contains('ghbs-toolbar')
        );
        if (externalAdded || externalRemoved) return false;
      }
    }
    return true;
  }

  function setupObservers() {
    const observer = new MutationObserver((mutations) => {
      if (isRendering) return;

      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        currentModeByView = {};
        scheduleRender(100);
        return;
      }

      if (!isMutationOwnedByUs(mutations)) {
        scheduleRender(160);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // GitHub Turbo / PJAX 路由事件监听
    const onNav = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        currentModeByView = {};
      }
      scheduleRender(80);
    };

    document.addEventListener('turbo:load', onNav);
    document.addEventListener('turbo:render', onNav);
    document.addEventListener('pjax:end', onNav);
    window.addEventListener('popstate', onNav);
  }

  function setupMessageListener() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'GHBS_GET_STATS') {
        sendResponse(latestReport || { url: window.location.href, enabled: currentSettings.enabled, reports: [] });
      } else if (msg.type === 'GHBS_SET_MODE' && msg.mode) {
        currentModeByView = {
          contributorsGraph: msg.mode,
          repoSidebar: msg.mode,
          commits: msg.mode,
          issuesPrs: msg.mode
        };
        scheduleRender(0);
        sendResponse({ ok: true });
      }
    });
  }

  async function init() {
    currentSettings = await storage.loadSettings();
    storage.onSettingsChange((nextSettings) => {
      const prevDefault = currentSettings.defaultMode;
      currentSettings = nextSettings;
      if (prevDefault !== nextSettings.defaultMode) {
        currentModeByView = {};
      }
      scheduleRender(0);
    });

    setupObservers();
    setupMessageListener();
    runAllViews();
  }

  init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
