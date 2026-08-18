window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  // Generic data-driven filter chip group. facetKey selects which Set in
  // state.activeFilters this group reads/writes (technology, category, sample, priceBand).
  // collapsedCount (optional): when options.length exceeds this, show only the
  // first N chips plus a "+N more" toggle — keeps large facets (e.g. 20 categories)
  // from dominating the page on first load. Expanded state lives on the container
  // node itself (container._expanded) so it survives re-renders triggered by clicks.
  // singleSelect (optional): radio-style instead of the default checkbox-style
  // toggle — picking a chip replaces whatever was active instead of adding to
  // it, and the underlying Set never holds more than one entry (still cleared
  // back to "All" by clicking the active chip again, or the "All" chip itself).
  function renderFilterGroup({ container, facetKey, options, onChange, collapsedCount, singleSelect }) {
    if (!container) return;
    const activeSet = state.activeFilters[facetKey];
    const isCollapsible = collapsedCount && options.length > collapsedCount;
    const expanded = container._expanded || !isCollapsible;
    container.innerHTML = "";

    const rerender = () => renderFilterGroup({ container, facetKey, options, onChange, collapsedCount, singleSelect });

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "rl-filter" + (activeSet.size === 0 ? " active" : "");
    allBtn.textContent = "All";
    allBtn.onclick = () => {
      activeSet.clear();
      state.currentPage = 1;
      rerender();
      onChange();
      AVM.utils.helpers.scrollResultsIntoView();
    };
    container.appendChild(allBtn);

    const visibleOptions = expanded ? options : options.slice(0, collapsedCount);
    visibleOptions.forEach(opt => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rl-filter" + (activeSet.has(opt.id) ? " active" : "");
      b.textContent = opt.label;
      b.onclick = () => {
        if (singleSelect) {
          const wasActive = activeSet.has(opt.id);
          activeSet.clear();
          if (!wasActive) activeSet.add(opt.id);
        } else {
          activeSet.has(opt.id) ? activeSet.delete(opt.id) : activeSet.add(opt.id);
        }
        state.currentPage = 1;
        rerender();
        onChange();
      };
      container.appendChild(b);
    });

    if (isCollapsible) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "rl-filter rl-filter--toggle";
      toggle.textContent = expanded ? "Show less" : `+${options.length - collapsedCount} more`;
      toggle.onclick = () => {
        container._expanded = !expanded;
        rerender();
      };
      container.appendChild(toggle);
    }
  }

  function clearAllFilters() {
    Object.values(state.activeFilters).forEach(set => set.clear());
    state.searchTerm = "";
    state.currentPage = 1;
  }

  AVM.modules.filters = { renderFilterGroup, clearAllFilters };
})();
