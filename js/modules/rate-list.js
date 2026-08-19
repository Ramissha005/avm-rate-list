window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  const SORTERS = {
    name: (a, b) => a.name.localeCompare(b.name),
    "b2b-asc": (a, b) => a.b2b - b.b2b,
    "b2b-desc": (a, b) => b.b2b - a.b2b,
    "b2c-asc": (a, b) => a.b2c - b.b2c,
    "b2c-desc": (a, b) => b.b2c - a.b2c,
    "margin-asc": (a, b) => AVM.modules.calculations.margin(a) - AVM.modules.calculations.margin(b),
    "margin-desc": (a, b) => AVM.modules.calculations.margin(b) - AVM.modules.calculations.margin(a),
    sr: (a, b) => a.sr - b.sr,
  };

  function inPriceBand(t, bandIds) {
    return [...bandIds].some(bandId => {
      const band = AVM.CONFIG.PRICE_BANDS.find(b => b.id === bandId);
      if (!band) return false;
      if (band.min != null && t.b2c < band.min) return false;
      if (band.max != null && t.b2c > band.max) return false;
      return true;
    });
  }

  function getFiltered(tests) {
    const { activeFilters, searchTerm } = state;
    const list = tests.filter(t => {
      if (activeFilters.technology.size && !activeFilters.technology.has(t.tech)) return false;
      if (activeFilters.category.size && !activeFilters.category.has(t.categoryId)) return false;
      if (activeFilters.sample.size && !activeFilters.sample.has(t.sampleId)) return false;
      if (activeFilters.priceBand.size && !inPriceBand(t, activeFilters.priceBand)) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        // Aliases (e.g. "Complete Blood Count" for CBC) are never displayed
        // in the table itself — they only widen what a search term can
        // match, so a partner searching the full/expanded name still finds
        // the test even though the row only shows its short display name.
        const haystack = [t.name, t.code, t.category, t.tech, t.department, ...(t.aliases || [])].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
    return [...list].sort(SORTERS[state.sortMode] || SORTERS.sr);
  }

  function hasActiveFilters() {
    return state.searchTerm || Object.values(state.activeFilters).some(set => set.size > 0);
  }

  function renderTable({ tests, techColors, elements, onChange }) {
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { margin, multiplier } = AVM.modules.calculations;
    const list = getFiltered(tests);
    const totalItems = list.length;
    const start = (state.currentPage - 1) * state.pageSize;
    const shown = list.slice(start, start + state.pageSize);

    const rangeText = shown.length ? `${start + 1}–${start + shown.length}` : "0";
    elements.count.textContent = `Showing ${rangeText} of ${totalItems} matching tests${hasActiveFilters() ? "" : ` (${tests.length} total)`} · B2B cost, B2C price & your margin`;

    if (list.length === 0) {
      elements.body.innerHTML = `<div class="rl-empty">No tests match that search. Try a different name, code, or filter.</div>`;
      if (elements.paginationWrap) elements.paginationWrap.innerHTML = "";
      return;
    }

    const { byCode } = AVM.data.getCatalog();

    elements.body.innerHTML = shown.map(t => {
      const col = techColors[t.tech] || { fg: "#101C27", bd: "#D2D5D9", bg: "#EFF0F2" };
      const isAdded = state.cart.has(t.code);
      const conflictCode = !isAdded ? AVM.modules.profile.conflictingCodeFor(t.code) : null;
      const conflictTest = conflictCode ? byCode[conflictCode] : null;

      let btnClass = "add-btn";
      let btnLabel = "Add to Profile";
      let btnIcon = "+";
      let btnAttrs = `data-code="${esc(t.code)}" aria-label="Add ${esc(t.name)}"`;
      if (isAdded) {
        btnClass += " added";
        btnLabel = "Added";
        btnIcon = "✓";
        btnAttrs = `data-code="${esc(t.code)}" aria-label="Remove ${esc(t.name)}"`;
      } else if (conflictTest) {
        btnClass += " blocked";
        btnLabel = "Blocked";
        btnIcon = "⊘";
        btnAttrs = `data-code="${esc(t.code)}" data-conflict="1" aria-label="${esc(t.name)} conflicts with ${esc(conflictTest.name)}, already in your profile" title="Already covered by ${esc(conflictTest.name)} in your profile"`;
      }

      return `
        <div class="rl-row ${isAdded ? "is-added" : ""}" data-code="${esc(t.code)}">
          <div><span class="cell-code">${esc(t.code)}</span></div>
          <div class="cell-name cell-name--clickable" data-code="${esc(t.code)}">${esc(t.name)}${t.category ? `<small>${esc(t.category)}</small>` : ""}</div>
          <div><span class="cell-tech" style="color:${col.fg};border-color:${col.bd};background:${col.bg}">${esc(t.tech)}</span></div>
          <div class="cell-sample">${esc(t.sample)}</div>
          <div class="cell-price"><span class="mobile-label">B2B</span>${money(t.b2b)}</div>
          <div class="cell-price is-b2c"><span class="mobile-label">B2C</span>${money(t.b2c)}</div>
          <div><span class="cell-margin">+${money(margin(t))}<small>${multiplier(t)}x</small></span></div>
          <div class="cell-action">
            <button type="button" class="${btnClass}" ${btnAttrs}><span aria-hidden="true">${btnIcon}</span><span class="add-btn__label">${btnLabel}</span></button>
          </div>
        </div>`;
    }).join("");

    if (elements.paginationWrap) {
      AVM.modules.pagination.renderPagination({ container: elements.paginationWrap, totalItems, onChange });
    }

    elements.body.querySelectorAll(".add-btn").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        AVM.modules.profile.toggleTest(btn.dataset.code);
        onChange();
      };
    });

    elements.body.querySelectorAll(".cell-name--clickable").forEach(el => {
      el.onclick = () => AVM.modules.testDetail.openTestDetail(el.dataset.code, onChange);
    });
  }

  AVM.modules.rateList = { getFiltered, renderTable, hasActiveFilters };
})();
