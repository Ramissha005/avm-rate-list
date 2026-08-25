window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  // A "what you'd save" table for the Franchise page — every test's B2B
  // rate next to its Franchise rate and the % that saves, so a
  // prospective franchisee sees the pitch in real numbers instead of
  // taking "better rates" on faith. Includes the same Add to Profile
  // button as the main rate list (rate-list.js) — a visitor can start
  // building a profile straight from this table, not just look at it.
  //
  // Technology filtering reuses the same state.activeFilters.technology
  // Set (and the same #filterTech chip UI) as the main rate list — this
  // page never has that list on screen at the same time, so there's no
  // risk of the two stepping on each other, and it means the Filters
  // button just works here via app.js's existing generic wiring with no
  // extra plumbing. Search is local to this table's own input, not the
  // shared state.searchTerm the main list uses. Price filtering isn't
  // offered here — franchise savings track a test's own price either way,
  // not a band a customer would shop by.
  function renderFranchiseRates({ tests, elements, onChange }) {
    if (!elements || !elements.body) return;
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { activeFilters } = state;
    const { byCode } = AVM.data.getCatalog();

    const term = ((elements.searchInput && elements.searchInput.value) || "").trim().toLowerCase();
    const list = tests.filter(t => {
      if (activeFilters.technology.size && !activeFilters.technology.has(t.tech)) return false;
      if (term && !`${t.name} ${t.code}`.toLowerCase().includes(term)) return false;
      return true;
    });

    if (list.length === 0) {
      elements.body.innerHTML = `<div class="fr-empty">No tests match that search/filter.</div>`;
      if (elements.count) elements.count.textContent = "";
      return;
    }

    const filtered = term || activeFilters.technology.size;
    if (elements.count) {
      elements.count.textContent = filtered
        ? `Showing ${list.length} of ${tests.length} tests`
        : `${tests.length} tests`;
    }

    elements.body.innerHTML = list.map(t => {
      // Every test in the catalog carries a franchise rate at this point,
      // but this falls back to a plain "—" rather than a broken/negative
      // figure for any future test priced before its franchise rate is
      // set.
      const hasSaving = t.franchise != null && t.b2b > t.franchise;
      const savingsAmt = hasSaving ? t.b2b - t.franchise : 0;
      const pct = hasSaving ? Math.round((savingsAmt / t.b2b) * 100) : 0;
      // Same two-line badge as the main rate list's Margin column
      // (.cell-margin: amount on top, % below) — same design, just the
      // amber "franchise" accent instead of the profit-blue "margin" one.
      const saveBadge = hasSaving
        ? `<span class="cell-margin is-franchise">${money(savingsAmt)}<small>${pct}%</small></span>`
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

    elements.body.querySelectorAll(".add-btn").forEach(btn => {
      btn.onclick = () => {
        AVM.modules.profile.toggleTest(btn.dataset.code);
        if (onChange) onChange();
      };
    });
  }

  AVM.modules.franchiseRates = { renderFranchiseRates };
})();
