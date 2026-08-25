window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  // Shared by the homepage rate list and the Franchise page's "Your
  // Savings" table (see app.js and franchise-rates.js) — one common panel
  // (Kidney Profile, Liver Profile, ...) per row instead of one test per
  // row, reusing the same .fr-row/.fr-head grid shell either page already
  // has loaded. Each row can expand to a "tests included" line (every
  // test, and any calculated extra, that panel bundles in) — collapsed by
  // default so a page with several panels doesn't turn into one long list
  // of test names.
  //
  // The Technology filter (state.activeFilters.technology, same chips as
  // the Tests view) applies here too — a panel matches if *any* of its
  // tests use one of the selected technologies, not only if every test
  // does, so picking a technology never hides a panel that's genuinely
  // relevant to it just because one other test inside happens to use a
  // different one.
  //
  // priceMode picks which two rate columns sit next to the third
  // (badge) column:
  //   'margin'    -> B2B / B2C / Margin (the site's normal pricing —
  //                  homepage)
  //   'franchise' -> B2B / Franchise Rate / Save % (Franchise page)
  // Both totals come from the same calculations.js totals() the cart
  // drawer's own Franchise box and Margin box are built on, so a panel's
  // numbers here match what it'd actually cost added to a profile.
  //
  // Sort reuses each page's existing Sort control (elements.sortSelect —
  // #sortSelect on the homepage, #franchiseRatesSort on the Franchise
  // page) rather than a separate dropdown just for panels: the same
  // options (Default/Name/B2B/B2C/Margin, or Savings/Name/B2B/Franchise)
  // read just as naturally against a panel's aggregate totals as they do
  // against a single test's — see the two sorter maps below, keyed by the
  // exact same option values each <select>'s markup already uses.
  const expanded = new Set();

  const MARGIN_SORTERS = {
    name: (a, b) => a.pkg.name.localeCompare(b.pkg.name),
    "b2b-asc": (a, b) => a.sum.msbB2b - b.sum.msbB2b,
    "b2b-desc": (a, b) => b.sum.msbB2b - a.sum.msbB2b,
    "b2c-asc": (a, b) => a.sum.b2c - b.sum.b2c,
    "b2c-desc": (a, b) => b.sum.b2c - a.sum.b2c,
    "margin-desc": (a, b) => (b.sum.b2c - b.sum.msbB2b) - (a.sum.b2c - a.sum.msbB2b),
    "margin-asc": (a, b) => (a.sum.b2c - a.sum.msbB2b) - (b.sum.b2c - b.sum.msbB2b),
  };

  const FRANCHISE_SORTERS = {
    "savings-desc": (a, b) => b.sum.franchiseSavingsPercentage - a.sum.franchiseSavingsPercentage,
    "savings-asc": (a, b) => a.sum.franchiseSavingsPercentage - b.sum.franchiseSavingsPercentage,
    name: (a, b) => a.pkg.name.localeCompare(b.pkg.name),
    "b2b-asc": (a, b) => a.sum.msbB2b - b.sum.msbB2b,
    "b2b-desc": (a, b) => b.sum.msbB2b - a.sum.msbB2b,
    "franchise-asc": (a, b) => a.sum.msbFranchise - b.sum.msbFranchise,
    "franchise-desc": (a, b) => b.sum.msbFranchise - a.sum.msbFranchise,
  };

  function testNamesLine(pkg, items, esc) {
    const cleanName = name => name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const names = [...items.map(t => cleanName(t.name)), ...(pkg.calculatedParams || [])];
    return names.map(esc).join(`<span class="fr-panel-details__dot">•</span>`);
  }

  function renderPanelsTable({ packages, elements, onChange, priceMode }) {
    if (!elements || !elements.body) return;
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { byCode } = AVM.data.getCatalog();
    const { marginPercentage } = AVM.modules.calculations;

    if (elements.head) {
      elements.head.innerHTML = priceMode === "franchise"
        ? `<div>Tests</div><div>Panel</div><div>B2B Rate</div><div>Franchise Rate</div><div>You Save</div><div></div>`
        : `<div>Tests</div><div>Panel</div><div>B2B</div><div>B2C</div><div>Margin</div><div></div>`;
    }

    const term = ((elements.searchInput && elements.searchInput.value) || "").trim().toLowerCase();
    const activeTech = AVM.state.activeFilters.technology;
    const rows = (packages || [])
      .filter(pkg => pkg.active !== false)
      .map(pkg => {
        const items = pkg.codes.map(c => byCode[c]).filter(Boolean);
        return { pkg, items, sum: AVM.modules.calculations.totals(items) };
      })
      .filter(({ pkg, items }) => {
        if (activeTech.size && !items.some(t => activeTech.has(t.tech))) return false;
        if (term && !pkg.name.toLowerCase().includes(term)) return false;
        return true;
      });

    // No sort selected (homepage's "Sort: Default", or no #sortSelect at
    // all) leaves rows in catalog order — same as every other panel
    // listing on the site (the old bundle-chip row included). The
    // Franchise page's own default ("Savings: High to Low") comes from
    // its <select>'s own default-selected option, same as any other
    // choice there.
    const sortMode = (elements.sortSelect && elements.sortSelect.value) || "";
    const sorters = priceMode === "franchise" ? FRANCHISE_SORTERS : MARGIN_SORTERS;
    if (sorters[sortMode]) rows.sort(sorters[sortMode]);

    if (elements.paginationWrap) elements.paginationWrap.innerHTML = "";

    if (rows.length === 0) {
      elements.body.innerHTML = `<div class="fr-empty">No panels match that search/filter.</div>`;
      if (elements.count) elements.count.textContent = "";
      return;
    }

    if (elements.count) {
      const filtered = term || activeTech.size;
      elements.count.textContent = filtered
        ? `Showing ${rows.length} of ${packages.length} panels`
        : `${rows.length} panel${rows.length !== 1 ? "s" : ""}`;
    }

    elements.body.innerHTML = rows.map(({ pkg, items, sum }) => {
      const testCount = AVM.modules.calculations.packageTestCount(pkg);
      const isAdded = AVM.modules.profile.isPackageActive(pkg);
      const btnClass = "add-btn" + (isAdded ? " added" : "");
      const btnLabel = isAdded ? "Added" : "Add to Profile";
      const btnIcon = isAdded ? "✓" : "+";
      const btnAttrs = `data-pkg="${esc(pkg.id)}" aria-label="${isAdded ? "Remove" : "Add"} ${esc(pkg.name)} panel"`;
      const isOpen = expanded.has(pkg.id);

      const priceCells = priceMode === "franchise"
        ? `
          <div class="cell-price"><span class="mobile-label">B2B Rate</span>${money(sum.msbB2b)}</div>
          <div class="cell-price is-franchise"><span class="mobile-label">Franchise Rate</span>${money(sum.msbFranchise)}</div>
          <div><span class="mobile-label">You Save</span>${sum.franchiseSavingsPercentage > 0
            ? `<span class="cell-margin is-franchise">${Math.round(sum.franchiseSavingsPercentage)}%<small>${money(sum.franchiseSavings)}</small></span>`
            : `<span class="fr-save--none">—</span>`}</div>`
        : `
          <div class="cell-price"><span class="mobile-label">B2B</span>${money(sum.msbB2b)}</div>
          <div class="cell-price is-b2c"><span class="mobile-label">B2C</span>${money(sum.b2c)}</div>
          <div><span class="mobile-label">Margin</span><span class="cell-margin">+${money(sum.b2c - sum.msbB2b)}<small>+${Math.round(marginPercentage(sum.msbB2b, sum.b2c))}%</small></span></div>`;

      return `
        <div class="fr-row">
          <div><span class="cell-code">${testCount}</span></div>
          <div class="cell-name">
            ${esc(pkg.name)}
            <button type="button" class="fr-panel-toggle" data-toggle-pkg="${esc(pkg.id)}" aria-expanded="${isOpen}">${isOpen ? "▴ Hide" : "▾ Show"} tests included</button>
          </div>
          ${priceCells}
          <div class="cell-action">
            <button type="button" class="${btnClass}" ${btnAttrs}><span aria-hidden="true">${btnIcon}</span><span class="add-btn__label">${btnLabel}</span></button>
          </div>
        </div>
        ${isOpen ? `
        <div class="fr-panel-details">
          <span class="fr-panel-details__label">Tests included</span>
          <p>${testNamesLine(pkg, items, esc)}</p>
        </div>` : ""}`;
    }).join("");

    elements.body.querySelectorAll(".fr-panel-toggle").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.togglePkg;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        // Only this table needs to re-render — no cart/count change, so a
        // plain re-render (not the full onChange chain) keeps a toggle
        // click from re-scrolling or re-computing anything else on the
        // page.
        renderPanelsTable({ packages, elements, onChange, priceMode });
      };
    });

    elements.body.querySelectorAll(".add-btn").forEach(btn => {
      btn.onclick = () => {
        const { packageById } = AVM.data.getCatalog();
        const pkg = packageById[btn.dataset.pkg];
        if (!pkg) return;
        if (AVM.modules.profile.isPackageActive(pkg)) AVM.modules.profile.removePackage(pkg);
        else AVM.modules.profile.addPackage(pkg);
        if (onChange) onChange();
      };
    });
  }

  AVM.modules.panelsTable = { renderPanelsTable };
})();
