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

  // Searching/sorting/filtering always resets to page 1 of the results —
  // but if the reader had scrolled down into page 3, or down to the
  // pagination controls, their *viewport* doesn't move with it. The table
  // re-renders correctly off-screen above them, so it looks like nothing
  // happened (or that it "jumped to the last page") until they manually
  // scroll back up. Call this after any change that reflows the results so
  // the match is actually visible without that manual scroll — but only
  // when the table's top has already been scrolled past, so it doesn't
  // yank someone who hasn't reached the table yet.
  function scrollResultsIntoView(selector) {
    const target = document.querySelector(selector || ".rl-table");
    if (!target) return;
    if (target.getBoundingClientRect().top < 0) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  AVM.utils.helpers = { $, showToast, debounce, scrollResultsIntoView };
})();
