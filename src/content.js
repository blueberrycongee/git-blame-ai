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
  let activeObserver = null;

  function getModeForView(viewName) {
    if (currentModeByView[viewName]) {
      return currentModeByView[viewName];
    }
    const configured = currentSettings.defaultMode || 'human';
    if (configured === 'human' || configured === 'bot' || configured === 'all') {
      return configured;
    }
    return 'human';
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
        ['repoSidebar', views.repoSidebar]
      ];

      for (const [name, view] of viewEntries) {
        if (!view) continue;
        if (view.matches(pathname)) {
          const result = view.render({
            settings: currentSettings,
            mode: getModeForView(name),
            onModeChange: (nextMode) => handleModeChange(name, nextMode),
            onToggleOverride: handleToggleOverride,
            onRequestRerender: () => scheduleRender(0)
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
      if (activeObserver) activeObserver.takeRecords();
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

  function isMutationRelevant(mutations) {
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        return true;
      }
    }
    return false;
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

      if (isMutationRelevant(mutations)) {
        scheduleRender(160);
      }
    });

    activeObserver = observer;
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
          repoSidebar: msg.mode
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
