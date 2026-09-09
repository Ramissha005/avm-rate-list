window.AVM = window.AVM || {};
AVM.utils = AVM.utils || {};

(function () {
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable (private browsing, quota) — profile just won't persist across reloads
    }
  }

  function readSession(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeSession(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable — nothing we can do here
    }
  }

  AVM.utils.storage = { readJSON, writeJSON, readSession, writeSession };
})();
