window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  function wireSearch(input, { onChange }) {
    if (!input) return;
    input.addEventListener("input", (e) => {
      state.searchTerm = e.target.value;
      state.currentPage = 1;
      onChange();
      AVM.utils.helpers.scrollResultsIntoView();
    });
  }

  AVM.modules.search = { wireSearch };
})();
