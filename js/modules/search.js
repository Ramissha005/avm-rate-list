window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  function wireSearch(input, { onChange }) {
    if (!input) return;
    // Debounced so a fast typist doesn't trigger a full re-filter/re-render
    // (and a forced scroll-into-view) on every single keystroke — only
    // once typing actually pauses.
    const runSearch = AVM.utils.helpers.debounce((value) => {
      state.searchTerm = value;
      state.currentPage = 1;
      onChange();
      AVM.utils.helpers.scrollResultsIntoView();
    }, 200);
    input.addEventListener("input", (e) => runSearch(e.target.value));
  }

  AVM.modules.search = { wireSearch };
})();
