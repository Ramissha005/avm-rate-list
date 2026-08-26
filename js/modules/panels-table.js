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
  // Both come from each profile's own flat, hand-set price (see data.js
  // `pricing` and calculations.js packagePricing()) — NOT summed from its
  // listed tests' own B2B/B2C prices the way every profile used to be
  // priced.
  //
  // Sort reuses each page's existing Sort control (elements.sortSelect —
  // #sortSelect on the homepage, #franchiseRatesSort on the Franchise
  // page) rather than a separate dropdown just for panels: the same
  // options (Default/Name/B2B/B2C/Margin, or Savings/Name/B2B/Franchise)
  // read just as naturally against a panel's own price as they do against
  // a single test's — see the two sorter maps below, keyed by the exact
  // same option values each <select>'s markup already uses.
  const expanded = new Set();

  const MARGIN_SORTERS = {
    name: (a, b) => a.pkg.name.localeCompare(b.pkg.name),
    "b2b-asc": (a, b) => a.pricing.b2b - b.pricing.b2b,
    "b2b-desc": (a, b) => b.pricing.b2b - a.pricing.b2b,
    "b2c-asc": (a, b) => a.pricing.b2c - b.pricing.b2c,
    "b2c-desc": (a, b) => b.pricing.b2c - a.pricing.b2c,
    "margin-desc": (a, b) => b.pricing.margin - a.pricing.margin,
    "margin-asc": (a, b) => a.pricing.margin - b.pricing.margin,
  };

  const FRANCHISE_SORTERS = {
    "savings-desc": (a, b) => b.pricing.franchiseSavingsPercentage - a.pricing.franchiseSavingsPercentage,
    "savings-asc": (a, b) => a.pricing.franchiseSavingsPercentage - b.pricing.franchiseSavingsPercentage,
    name: (a, b) => a.pkg.name.localeCompare(b.pkg.name),
    "b2b-asc": (a, b) => a.pricing.b2b - b.pricing.b2b,
    "b2b-desc": (a, b) => b.pricing.b2b - a.pricing.b2b,
    "franchise-asc": (a, b) => a.pricing.franchise - b.pricing.franchise,
    "franchise-desc": (a, b) => b.pricing.franchise - a.pricing.franchise,
  };

  function cleanTestName(name) {
    return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  function dotJoin(names, esc) {
    const { highlightAsterisk } = AVM.utils.formatters;
    return names.map(n => highlightAsterisk(esc(n))).join(`<span class="fr-panel-details__dot">•</span>`);
  }

  // A profile built from several named sub-panels + a few extra tests can
  // carry its own `groups` breakdown (see data.js) so the expanded "Tests
  // included" list reads as "Kidney Profile: ..." / "Iron Profile: ..."
  // instead of one long flattened line. No current profile uses this (the
  // fixed-price model rebuild started from just one — see PACKAGES in
  // data.js) but the rendering support stays here for when a bigger,
  // multi-panel profile gets added back. Packages without `groups` fall
  // back to the plain flat line instead.
  function renderTestDetails(pkg, items, byCode, esc) {
    const { packageTestCount } = AVM.modules.calculations;
    if (pkg.groups && pkg.groups.length) {
      // Each group carries its own calculatedParams (the same ratios its
      // matching standalone panel already lists — see data.js), folded
      // onto that group's own line rather than pulled out into a
      // separate "Calculated Parameters" section, so e.g. eGFR reads
      // under Kidney Profile the same way it does on the Kidney Profile
      // package itself.
      //
      // A group that's just one standalone test and nothing else (the
      // Calcium/CRP/TSH-style entries split out of what used to be one
      // "Additional Tests" bucket) gets the exact same block treatment
      // as Kidney Profile or Liver Profile — same heading style, same
      // left rail — just without a body line, since a one-item line
      // would only repeat the heading's own name.
      return pkg.groups.map(g => {
        const resolved = g.codes.map(c => byCode[c]).filter(Boolean);
        const names = [...resolved.map(t => cleanTestName(t.name)), ...(g.calculatedParams || [])];
        // The count in the heading is the same weighted packageTestCount()
        // math the profile's own Test Count uses (a code like CBC reports
        // more than one result on its own — see data.js's paramCount) —
        // not just how many lines are listed below, which for CBC would
        // undercount it as 1 instead of the real 21.
        const count = packageTestCount({ calculatedParams: g.calculatedParams }, resolved);
        const body = names.length === 1 ? "" : `<p>${dotJoin(names, esc)}</p>`;
        return `
          <div class="fr-panel-details__group">
            <span class="fr-panel-details__group-label">${esc(g.label)} (${count})</span>
            ${body}
          </div>`;
      }).join("");
    }
    const names = [...items.map(t => cleanTestName(t.name)), ...(pkg.calculatedParams || [])];
    return `<p>${dotJoin(names, esc)}</p>`;
  }

  function renderPanelsTable({ packages, elements, onChange, priceMode }) {
    if (!elements || !elements.body) return;
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { byCode } = AVM.data.getCatalog();
    const { packageTestCount } = AVM.modules.calculations;

    if (elements.head) {
      elements.head.className = "fr-head fr-panels-head";
      elements.head.innerHTML = priceMode === "franchise"
        ? `<div>Profile</div><div>No of Tests</div><div>B2B Rate</div><div>Franchise Rate</div><div>You Save</div><div></div>`
        : `<div>Profile</div><div>No of Tests</div><div>B2B</div><div>B2C</div><div>Margin</div><div></div>`;
    }

    const term = ((elements.searchInput && elements.searchInput.value) || "").trim().toLowerCase();
    const activeTech = AVM.state.activeFilters.technology;
    const rows = (packages || [])
      .filter(pkg => pkg.active !== false)
      .map(pkg => {
        const items = pkg.codes.map(c => byCode[c]).filter(Boolean);
        return { pkg, items, pricing: AVM.modules.calculations.packagePricing(pkg) };
      })
      .filter(({ pkg, items }) => {
        if (activeTech.size && !items.some(t => activeTech.has(t.tech))) return false;
        if (term && !pkg.name.toLowerCase().includes(term)) return false;
        return true;
      });

    // No sort selected (homepage's "Sort: Default", or no #sortSelect at
    // all) leaves rows in catalog order — same as every other panel
    // listing on the site (the old bundle-chip row included), so AVM
    // Profile A/B/C/Infertility A/Anemia A show first here exactly like
    // they do on the homepage's own Profiles view.
    //
    // The Franchise page's Individual Tests view defaults to "Savings:
    // High to Low" (its <select>'s first <option>, and a deliberate
    // earlier choice for that view specifically) — but that same
    // <select> is shared with this Profiles view too, so left alone its
    // untouched default would silently re-sort Profiles by savings as
    // well, before the visitor ever picked anything, and scramble AVM
    // Profile A out of first place. dataset.userSet (set once the
    // dropdown actually fires a change event — see app.js) tells "still
    // the pristine default" apart from "the visitor genuinely chose
    // Savings High to Low again" — only the latter should sort Profiles
    // by it.
    const sortTouched = !elements.sortSelect || elements.sortSelect.dataset.userSet === "1";
    const sortMode = priceMode === "franchise" && !sortTouched
      ? ""
      : (elements.sortSelect && elements.sortSelect.value) || "";
    const sorters = priceMode === "franchise" ? FRANCHISE_SORTERS : MARGIN_SORTERS;
    if (sorters[sortMode]) rows.sort(sorters[sortMode]);

    if (elements.paginationWrap) elements.paginationWrap.innerHTML = "";

    if (rows.length === 0) {
      elements.body.innerHTML = `<div class="fr-empty">No profiles match that search/filter.</div>`;
      if (elements.count) elements.count.textContent = "";
      return;
    }

    if (elements.count) {
      const filtered = term || activeTech.size;
      elements.count.textContent = filtered
        ? `Showing ${rows.length} of ${packages.length} profiles`
        : `${rows.length} profile${rows.length !== 1 ? "s" : ""}`;
    }

    elements.body.innerHTML = rows.map(({ pkg, items, pricing }) => {
      const isAdded = AVM.modules.profile.isPackageActive(pkg);
      // Every one of this profile's tests can be "active" without this
      // profile ever having been added itself — a bigger profile that
      // includes it (e.g. AVM Profile A already covers Kidney Profile
      // whole) tagged them all first. Same blocked/⊘ treatment as a
      // conflicting individual test (see rate-list.js) rather than a
      // misleading "✓ Added" that would look removable but actually do
      // nothing when clicked.
      const covering = isAdded ? AVM.modules.profile.coveringPackage(pkg) : null;
      let btnClass = "add-btn";
      let btnLabel = "Add to Profile";
      let btnIcon = "+";
      let btnAttrs = `data-pkg="${esc(pkg.id)}" aria-label="Add ${esc(pkg.name)}"`;
      if (covering) {
        btnClass += " blocked";
        btnLabel = "Blocked";
        btnIcon = "⊘";
        btnAttrs = `data-pkg="${esc(pkg.id)}" data-conflict="1" aria-label="${esc(pkg.name)} is already covered by ${esc(covering.name)} in your profile" title="Already covered by ${esc(covering.name)} in your profile"`;
      } else if (isAdded) {
        btnClass += " added";
        btnLabel = "Added";
        btnIcon = "✓";
        btnAttrs = `data-pkg="${esc(pkg.id)}" aria-label="Remove ${esc(pkg.name)}"`;
      }
      const isOpen = expanded.has(pkg.id);
      // Same real test count the cart drawer's own "N tests" badge shows
      // once this profile is added (see calculations.js) — a code that
      // itself reports more than one result (CBC's 28, CUA's 22) and any
      // calculated/derived parameters (eGFR, ABG, ...) both count here
      // too, not just pkg.codes.length.
      const testCount = packageTestCount(pkg, items);

      const priceCells = priceMode === "franchise"
        ? `
          <div class="cell-price"><span class="mobile-label">B2B Rate</span>${money(pricing.b2b)}</div>
          <div class="cell-price is-franchise"><span class="mobile-label">Franchise Rate</span>${money(pricing.franchise)}</div>
          <div><span class="mobile-label">You Save</span>${pricing.franchiseSavingsPercentage > 0
            ? `<span class="cell-margin is-franchise">${Math.round(pricing.franchiseSavingsPercentage)}%<small>${money(pricing.franchiseSavings)}</small></span>`
            : `<span class="fr-save--none">—</span>`}</div>`
        : `
          <div class="cell-price"><span class="mobile-label">B2B</span>${money(pricing.b2b)}</div>
          <div class="cell-price is-b2c"><span class="mobile-label">B2C</span>${money(pricing.b2c)}</div>
          <div><span class="mobile-label">Margin</span><span class="cell-margin">+${money(pricing.margin)}<small>+${Math.round(pricing.marginPercentage)}%</small></span></div>`;

      return `
        <div class="fr-row fr-panels-row">
          <div class="cell-name">
            ${esc(pkg.name)}
            <button type="button" class="fr-panel-toggle" data-toggle-pkg="${esc(pkg.id)}" aria-expanded="${isOpen}">${isOpen ? "▴" : "▾"} Tests included</button>
          </div>
          <div class="cell-testcount"><span class="mobile-label">Tests</span>${testCount}</div>
          ${priceCells}
          <div class="cell-action">
            <button type="button" class="${btnClass}" ${btnAttrs}><span aria-hidden="true">${btnIcon}</span><span class="add-btn__label">${btnLabel}</span></button>
          </div>
        </div>
        ${isOpen ? `
        <div class="fr-panel-details">
          <span class="fr-panel-details__label">Tests included</span>
          ${renderTestDetails(pkg, items, byCode, esc)}
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
