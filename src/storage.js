(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    enabled: true,
    defaultMode: 'split', // 'split' | 'human' | 'bot' | 'all'
    views: {
      contributorsGraph: true,
      repoSidebar: true,
      commits: true,
      issuesPrs: true
    },
    detectHeuristics: true,
    distinguishAiAgent: true,
    assistedPolicy: 'human', // 'human' (人驱动 AI 仍算人类贡献) | 'assisted' | 'bot'
    customBots: [],
    customHumans: [],
    customPatterns: []
  };

  const STORAGE_KEY = 'ghbs_settings_v1';

  function mergeSettings(saved) {
    const src = saved && typeof saved === 'object' ? saved : {};
    return {
      ...DEFAULT_SETTINGS,
      ...src,
      views: {
        ...DEFAULT_SETTINGS.views,
        ...(src.views && typeof src.views === 'object' ? src.views : {})
      },
      customBots: Array.isArray(src.customBots) ? src.customBots : [],
      customHumans: Array.isArray(src.customHumans) ? src.customHumans : [],
      customPatterns: Array.isArray(src.customPatterns) ? src.customPatterns : []
    };
  }

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  }

  function loadSettings() {
    if (!hasChromeStorage()) {
      return Promise.resolve(mergeSettings({}));
    }
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get([STORAGE_KEY], (res) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(mergeSettings({}));
            return;
          }
          resolve(mergeSettings(res && res[STORAGE_KEY]));
        });
      } catch (_) {
        resolve(mergeSettings({}));
      }
    });
  }

  function saveSettings(next) {
    const merged = mergeSettings(next);
    if (!hasChromeStorage()) {
      return Promise.resolve(merged);
    }
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set({ [STORAGE_KEY]: merged }, () => {
          resolve(merged);
        });
      } catch (_) {
        resolve(merged);
      }
    });
  }

  async function updateSettings(patch) {
    const current = await loadSettings();
    const merged = mergeSettings({
      ...current,
      ...patch,
      views: {
        ...current.views,
        ...(patch && patch.views ? patch.views : {})
      }
    });
    return saveSettings(merged);
  }

  /**
   * 手动切换某个账号的分类覆盖
   * @param {string} rawLogin
   * @param {'bot'|'human'|'auto'} target
   */
  async function setAccountOverride(rawLogin, target) {
    const detector = root.GHBS && root.GHBS.detector;
    const base = detector ? detector.normalizeLogin(rawLogin).baseLogin : String(rawLogin || '').trim().toLowerCase();
    if (!base) return loadSettings();

    const current = await loadSettings();
    const bots = current.customBots.filter((x) => x !== base);
    const humans = current.customHumans.filter((x) => x !== base);

    if (target === 'bot') {
      bots.push(base);
    } else if (target === 'human') {
      humans.push(base);
    }

    return saveSettings({
      ...current,
      customBots: bots,
      customHumans: humans
    });
  }

  function onSettingsChange(callback) {
    if (!hasChromeStorage() || !chrome.storage.onChanged) return () => {};
    const listener = (changes, areaName) => {
      if (areaName !== 'sync' || !changes[STORAGE_KEY]) return;
      callback(mergeSettings(changes[STORAGE_KEY].newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  const api = {
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    mergeSettings,
    loadSettings,
    saveSettings,
    updateSettings,
    setAccountOverride,
    onSettingsChange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GHBS = root.GHBS || {};
    root.GHBS.storage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
