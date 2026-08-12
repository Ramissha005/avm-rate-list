window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  function wireSort(select, { onChange }) {
    if (!select) return;
    select.addEventListener("change", (e) => {
      state.sortMode = e.target.value;
      state.currentPage = 1;
      onChange();
    });
  }

  AVM.modules.sorting = { wireSort };
})();
