window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  // A "what you'd save" table for the Franchise page, with two views a
  // visitor can switch between (see #franchiseViewToggle in franchise.
  // html): every individual test's B2B rate next to its Franchise rate,
  // or the same comparison rolled up per common panel (Kidney Profile,
  // Liver Profile, ...) so a whole-panel saving is just as easy to see as
  // a single test's. Both include the same Add to Profile button as the
  // main rate list — a visitor can start building a profile straight
  // from this table, not just look at it.
  //
  // Search is local to this table's own input, not the shared
  // state.searchTerm the main list uses. Technology filtering (Tests view
  // only — panels span mixed technologies, so it doesn't map cleanly)
  // reuses state.activeFilters.technology, and page size/current page
  // (Tests view only — the panel list is short enough to show in full)
  // reuse state.pageSize/currentPage via AVM.modules.pagination — all
  // safe since this page never has the main rate list on screen too.

  function savingsPercent(t) {
    if (t.franchise == null || t.b2b <= t.franchise) return 0;
    return ((t.b2b - t.franchise) / t.b2b) * 100;
  }

  const TEST_SORTERS = {
    "savings-desc": (a, b) => savingsPercent(b) - savingsPercent(a),
    "savings-asc": (a, b) => savingsPercent(a) - savingsPercent(b),
    name: (a, b) => a.name.localeCompare(b.name),
    "b2b-asc": (a, b) => a.b2b - b.b2b,
    "b2b-desc": (a, b) => b.b2b - a.b2b,
    "franchise-asc": (a, b) => (a.franchise ?? a.b2b) - (b.franchise ?? b.b2b),
    "franchise-desc": (a, b) => (b.franchise ?? b.b2b) - (a.franchise ?? a.b2b),
  };

  // Which view is active — read straight off which toggle button carries
  // .active, same "no shared state, read the DOM" pattern as search/sort.
  // Always starts on "tests" on a fresh page load, matching the toggle's
  // own default state in the markup.
  function currentView(elements) {
    if (!elements.viewToggle) return "tests";
    const active = elements.viewToggle.querySelector(".fr-view-toggle__btn.active");
    return (active && active.dataset.view) || "tests";
  }

  function renderTestsHead(elements) {
    if (!elements.head) return;
    elements.head.innerHTML = `<div>Code</div><div>Test</div><div>B2B Rate</div><div>Franchise Rate</div><div>You Save</div><div></div>`;
  }

  // Same two-line badge shape as the main rate list's Margin column
  // (.cell-margin), but flipped: the % leads (big, bold) since that's the
  // headline number for a savings pitch, with the ₹ amount below it in
  // <small> instead of the other way around.
  function saveBadge(pct, amount, money) {
    return pct > 0
      ? `<span class="cell-margin is-franchise">${Math.round(pct)}%<small>${money(amount)}</small></span>`
      : `<span class="fr-save--none">—</span>`;
  }

  function renderTests({ tests, elements, onChange }) {
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
      .sort(TEST_SORTERS[sortMode] || TEST_SORTERS["savings-desc"]);

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
      const pct = hasSaving ? (savingsAmt / t.b2b) * 100 : 0;

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
          <div><span class="mobile-label">You Save</span>${saveBadge(pct, savingsAmt, money)}</div>
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

  function renderFranchiseRates({ tests, packages, elements, onChange }) {
    if (!elements || !elements.body) return;
    const view = currentView(elements);

    // Filters/Sort/page size are Tests-only controls — hidden rather than
    // just inert while Panels is active, so it's clear they don't apply.
    if (elements.filtersToggleBtn) elements.filtersToggleBtn.style.display = view === "profiles" ? "none" : "";
    if (elements.sortWrap) elements.sortWrap.style.display = view === "profiles" ? "none" : "";

    if (view === "profiles") {
      // Shared with the homepage's own Panels view — see panels-table.js.
      AVM.modules.panelsTable.renderPanelsTable({ packages, elements, onChange, priceMode: "franchise" });
    } else {
      renderTestsHead(elements);
      renderTests({ tests, elements, onChange });
    }
  }

  AVM.modules.franchiseRates = { renderFranchiseRates };
})();
