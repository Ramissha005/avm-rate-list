window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  // A "what you'd save" table for the Franchise page — every test's B2B
  // rate next to its Franchise rate and the % that saves, so a
  // prospective franchisee sees the pitch in real numbers instead of
  // taking "better rates" on faith. Same toolbar shape as the main rate
  // list (search, Filters, Sort, page size) — see franchise.html — but
  // its own Sort options (Savings/Name/B2B/Franchise rather than
  // rate-list.js's B2B/B2C/Margin, since B2C and Margin aren't columns
  // here) read straight off #franchiseRatesSort rather than going through
  // the shared state.sortMode + SORTERS rate-list.js owns. Page size and
  // current page *do* reuse the shared state.pageSize/currentPage (via
  // AVM.modules.pagination) and Technology filtering reuses
  // state.activeFilters.technology — safe since this page never has the
  // main rate list on screen at the same time. Includes the same Add to
  // Profile button as the main list too — a visitor can start building a
  // profile straight from this table, not just look at it.
  function savingsPercent(t) {
    if (t.franchise == null || t.b2b <= t.franchise) return 0;
    return ((t.b2b - t.franchise) / t.b2b) * 100;
  }

  const SORTERS = {
    "savings-desc": (a, b) => savingsPercent(b) - savingsPercent(a),
    "savings-asc": (a, b) => savingsPercent(a) - savingsPercent(b),
    name: (a, b) => a.name.localeCompare(b.name),
    "b2b-asc": (a, b) => a.b2b - b.b2b,
    "b2b-desc": (a, b) => b.b2b - a.b2b,
    "franchise-asc": (a, b) => (a.franchise ?? a.b2b) - (b.franchise ?? b.b2b),
    "franchise-desc": (a, b) => (b.franchise ?? b.b2b) - (a.franchise ?? a.b2b),
  };

  function renderFranchiseRates({ tests, elements, onChange }) {
    if (!elements || !elements.body) return;
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { activeFilters } = state;
    const { byCode } = AVM.data.getCatalog();

    const term = ((elements.searchInput && elements.searchInput.value) || "").trim().toLowerCase();
    const sortMode = (elements.sortSelect && elements.sortSelect.value) || "savings-desc";
    const filteredList = tests
      .filter(t => {
        if (activeFilters.technology.size && !activeFilters.technology.has(t.tech)) return false;
        if (term && !`${t.name} ${t.code}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort(SORTERS[sortMode] || SORTERS["savings-desc"]);

    const totalItems = filteredList.length;

    if (totalItems === 0) {
      elements.body.innerHTML = `<div class="fr-empty">No tests match that search/filter.</div>`;
      if (elements.count) elements.count.textContent = "";
      if (elements.paginationWrap) elements.paginationWrap.innerHTML = "";
      return;
    }

    // Paged the same way the main rate list is — state.currentPage/
    // pageSize are shared globals, safe here for the reason above.
    const start = (state.currentPage - 1) * state.pageSize;
    const list = filteredList.slice(start, start + state.pageSize);
    const filtered = term || activeFilters.technology.size;

    if (elements.count) {
      const rangeText = `${start + 1}–${start + list.length}`;
      elements.count.textContent = `Showing ${rangeText} of ${totalItems} tests${filtered ? "" : ` (${tests.length} total)`}`;
    }

    elements.body.innerHTML = list.map(t => {
      // Every test in the catalog carries a franchise rate at this point,
      // but this falls back to a plain "—" rather than a broken/negative
      // figure for any future test priced before its franchise rate is
      // set.
      const hasSaving = t.franchise != null && t.b2b > t.franchise;
      const savingsAmt = hasSaving ? t.b2b - t.franchise : 0;
      const pct = hasSaving ? Math.round((savingsAmt / t.b2b) * 100) : 0;
      // Same two-line badge shape as the main rate list's Margin column
      // (.cell-margin), but flipped: the % leads (big, bold) since that's
      // the headline number for a savings pitch, with the ₹ amount below
      // it in <small> instead of the other way around.
      const saveBadge = hasSaving
        ? `<span class="cell-margin is-franchise">${pct}%<small>${money(savingsAmt)}</small></span>`
        : `<span class="fr-save--none">—</span>`;

      // Same Add to Profile button, same states, as rate-list.js.
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
        <div class="fr-row">
          <div><span class="cell-code">${esc(t.code)}</span></div>
          <div class="cell-name">${esc(t.name)}</div>
          <div class="cell-price"><span class="mobile-label">B2B Rate</span>${money(t.b2b)}</div>
          <div class="cell-price is-franchise"><span class="mobile-label">Franchise Rate</span>${t.franchise != null ? money(t.franchise) : "—"}</div>
          <div><span class="mobile-label">You Save</span>${saveBadge}</div>
          <div class="cell-action">
            <button type="button" class="${btnClass}" ${btnAttrs}><span aria-hidden="true">${btnIcon}</span><span class="add-btn__label">${btnLabel}</span></button>
          </div>
        </div>`;
    }).join("");

    if (elements.paginationWrap) {
      AVM.modules.pagination.renderPagination({ container: elements.paginationWrap, totalItems, onChange });
    }

    elements.body.querySelectorAll(".add-btn").forEach(btn => {
      btn.onclick = () => {
        AVM.modules.profile.toggleTest(btn.dataset.code);
        if (onChange) onChange();
      };
    });
  }

  AVM.modules.franchiseRates = { renderFranchiseRates };
})();
