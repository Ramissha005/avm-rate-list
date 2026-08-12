window.AVM = window.AVM || {};
AVM.utils = AVM.utils || {};

(function () {
  const $ = (id) => document.getElementById(id);

  let toastTimer;
  function showToast(msg) {
    const toast = $("toast");
    const text = $("toastText");
    if (!toast || !text) return;
    text.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function debounce(fn, wait = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  AVM.utils.helpers = { $, showToast, debounce };
})();
