window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  // A lightweight, read-only "what you'd save" table for the Franchise
  // page — every test's B2B rate next to its Franchise rate and the %
  // that saves, so a prospective franchisee sees the pitch in real
  // numbers instead of taking "better rates" on faith. Deliberately
  // simple: a name/code search is the only control (no sort/filter/
  // pagination), and there's no Add to Profile action — that's what the
  // real rate list (rate-list.js) is for; this one just makes the case.
  function renderFranchiseRates({ tests, elements }) {
    if (!elements || !elements.body) return;
    const { money, escapeHtml: esc } = AVM.utils.formatters;

    const term = ((elements.searchInput && elements.searchInput.value) || "").trim().toLowerCase();
    const list = term
      ? tests.filter(t => `${t.name} ${t.code}`.toLowerCase().includes(term))
      : tests;

    if (list.length === 0) {
      elements.body.innerHTML = `<div class="fr-empty">No tests match that search.</div>`;
      if (elements.count) elements.count.textContent = "";
      return;
    }

    if (elements.count) {
      elements.count.textContent = term
        ? `Showing ${list.length} of ${tests.length} tests`
        : `${tests.length} tests`;
    }

    elements.body.innerHTML = list.map(t => {
      // Every test in the catalog carries a franchise rate at this point,
      // but this falls back to a plain "—" rather than a broken/negative
      // figure for any future test priced before its franchise rate is
      // set.
      const hasSaving = t.franchise != null && t.b2b > t.franchise;
      const pct = hasSaving ? Math.round(((t.b2b - t.franchise) / t.b2b) * 100) : 0;
      return `
        <div class="fr-row">
          <div><span class="cell-code">${esc(t.code)}</span></div>
          <div class="cell-name">${esc(t.name)}</div>
          <div class="cell-price"><span class="mobile-label">B2B Rate</span>${money(t.b2b)}</div>
          <div class="cell-price is-franchise"><span class="mobile-label">Franchise Rate</span>${t.franchise != null ? money(t.franchise) : "—"}</div>
          <div><span class="mobile-label">You Save</span>${hasSaving ? `<span class="fr-save">Save ${pct}%</span>` : `<span class="fr-save fr-save--none">—</span>`}</div>
        </div>`;
    }).join("");
  }

  AVM.modules.franchiseRates = { renderFranchiseRates };
})();
