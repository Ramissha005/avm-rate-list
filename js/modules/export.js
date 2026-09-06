window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  function today() {
    return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function copyProfileToClipboard() {
    const { byCode, packageById } = AVM.data.getCatalog();
    const { money } = AVM.utils.formatters;
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const bundlePkgs = [...state.cartPackages].map(id => packageById[id]).filter(Boolean);
    if (items.length === 0 && bundlePkgs.length === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    const customerView = state.customerView;

    // Customer copy drops the internal test code (BUN, SCRE, …) — a
    // customer needs the test's name and price, not its internal shorthand.
    // A fixed-price profile bundle is billed as one flat number (see
    // data.js `pricing`), not per test — one line for the whole profile,
    // naming what it includes, rather than a priced line per test inside.
    const bundleLines = bundlePkgs.map(pkg => {
      const names = pkg.codes.map(c => (byCode[c] && byCode[c].name) || c).join(", ");
      return customerView
        ? `${pkg.name} (${names}) — B2C ${money(pkg.pricing.b2c)}`
        : `${pkg.name} (${names}) — B2B ${money(pkg.pricing.b2b)} · B2C ${money(pkg.pricing.b2c)} · Margin +${money(pkg.pricing.b2c - pkg.pricing.b2b)}`;
    });
    const individualLines = items.map(t => customerView
      ? `${t.name} — B2C ${money(t.b2c)}`
      : `${t.name} (${t.code}) — B2B ${money(t.b2b)} · B2C ${money(t.b2c)} · Margin +${money(t.b2c - t.b2b)}`);
    const lines = [...bundleLines, ...individualLines];
    const sum = AVM.modules.calculations.cartTotals(items, bundlePkgs);
    // The manually-entered customer-copy discount (see profile.js) — only
    // surfaces here in customer view, and only when it's actually lower
    // than the B2C total.
    const discountedPrice = state.discountedPrice;
    const hasCustomerDiscount = customerView && typeof discountedPrice === "number"
      && discountedPrice > 0 && discountedPrice < sum.b2c;
    const b2cLine = hasCustomerDiscount
      ? `Original Price: ${money(sum.b2c)}\nDiscounted Price: ${money(discountedPrice)}`
      : `B2C Value: ${money(sum.b2c)}`;
    // B2B Cost is the MPB-adjusted figure (the whole profile's raw total,
    // floored at ₹100), not a raw per-test sum.
    const text = `AVMLabs — My Profile\n\n` + lines.join("\n") +
      (customerView ? `\n\n${b2cLine}` : `\n\nB2B Cost: ${money(sum.netB2b)}\nB2C Value: ${money(sum.b2c)}\nMargin: ${money(sum.netMargin)}`);

    navigator.clipboard?.writeText(text)
      .then(() => AVM.utils.helpers.showToast(customerView ? "Customer copy copied to clipboard" : "Profile copied to clipboard"))
      .catch(() => AVM.utils.helpers.showToast("Couldn't copy — select and copy manually"));
  }

  function exportProfileCSV() {
    const { byCode, packageById } = AVM.data.getCatalog();
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const bundlePkgs = [...state.cartPackages].map(id => packageById[id]).filter(Boolean);
    if (items.length === 0 && bundlePkgs.length === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    const customerView = state.customerView;
    const sum = AVM.modules.calculations.cartTotals(items, bundlePkgs);
    // Same weighted count the cart drawer's own header badge and every
    // bundle's own group meta line use (see profile.js's renderCart) —
    // each test's own paramCount, plus each bundle's full
    // packageTestCount() (priced codes + calculated params), so this
    // subtitle always agrees with what's shown on screen.
    const { packageTestCount } = AVM.modules.calculations;
    const totalCount = items.reduce((n, t) => n + (t.paramCount || 1), 0)
      + bundlePkgs.reduce((n, pkg) => n + packageTestCount(pkg, pkg.codes.map(c => byCode[c]).filter(Boolean)), 0);
    const pricingColumns = customerView
      ? [{ header: "B2C", key: "b2c", type: "currency", width: 12 }]
      : [
          { header: "B2B", key: "b2b", type: "currency", width: 12 },
          { header: "B2C", key: "b2c", type: "currency", width: 12 },
          { header: "Margin", key: "margin", type: "margin", width: 12 },
        ];
    // The B2B/Margin columns below stay raw (each row summed by an actual
    // Excel formula), so an MPB-adjusted total can't be dropped into those
    // footer cells without them disagreeing with their own SUM() once Excel
    // recalculates. The MPB adjustment goes in the subtitle instead, as a
    // plain note alongside the raw column totals.
    const mpbNote = !customerView && sum.netB2b !== sum.b2b
      ? ` · Min. Patient Billing → B2B ${AVM.utils.formatters.money(sum.netB2b)}`
      : "";
    // The manually-entered customer-copy discount (see profile.js) — only
    // in customer view, and only when it's actually lower than the B2C
    // total. The B2C column itself stays a raw per-row figure (same reason
    // B2B/Margin do above) so it still matches its own SUM() footer; this
    // note is where the discounted price surfaces instead.
    const discountedPrice = state.discountedPrice;
    const hasCustomerDiscount = customerView && typeof discountedPrice === "number"
      && discountedPrice > 0 && discountedPrice < sum.b2c;
    const customerDiscountNote = hasCustomerDiscount
      ? ` · Discounted Price ${AVM.utils.formatters.money(discountedPrice)} (Original ${AVM.utils.formatters.money(sum.b2c)})`
      : "";
    AVM.utils.xlsx.downloadWorkbook({
      filename: customerView ? "avmlabs-profile-customer-copy.xlsx" : "avmlabs-profile.xlsx",
      sheetName: "My Profile",
      title: customerView ? "AVMLabs — My Profile (Customer Copy)" : "AVMLabs — My Profile",
      subtitle: `Generated ${today()} · ${totalCount} test${totalCount === 1 ? "" : "s"}${mpbNote}${customerDiscountNote}`,
      // Code is internal shorthand (BUN, SCRE, …) — left out of the
      // customer copy's columns entirely, same as Copy List and Print.
      columns: [
        ...(customerView ? [] : [{ header: "Code", key: "code", type: "text", width: 12 }]),
        { header: "Test", key: "name", type: "text", width: 36 },
        { header: "Technology", key: "tech", type: "text", width: 20 },
        { header: "Sample", key: "sample", type: "text", width: 12 },
        ...pricingColumns,
      ],
      // A fixed-price profile bundle is billed as one flat number (see
      // data.js `pricing`), not per test — one row for the whole profile
      // (naming what it includes in the Test column), not a priced row
      // per test inside it. Listed before the individually-added tests,
      // same order the cart drawer's own groups render in.
      rows: [
        ...bundlePkgs.map(pkg => ({
          code: "", name: `${pkg.name} (${pkg.codes.map(c => (byCode[c] && byCode[c].name) || c).join(", ")})`,
          tech: "", sample: "", b2b: pkg.pricing.b2b, b2c: pkg.pricing.b2c, margin: pkg.pricing.b2c - pkg.pricing.b2b,
        })),
        ...items.map(t => ({ code: t.code, name: t.name, tech: t.tech, sample: t.sample, b2b: t.b2b, b2c: t.b2c, margin: t.b2c - t.b2b })),
      ],
      totals: customerView ? { b2c: sum.b2c } : { b2b: sum.b2b, b2c: sum.b2c, margin: sum.margin },
    });
    AVM.utils.helpers.showToast(customerView ? "Customer copy exported to Excel" : "Profile exported to Excel");
  }

  function exportRateListCSV(tests) {
    if (!tests || tests.length === 0) {
      AVM.utils.helpers.showToast("Nothing to export");
      return;
    }
    const sum = AVM.modules.calculations.totals(tests);
    AVM.utils.xlsx.downloadWorkbook({
      filename: "avmlabs-rate-list.xlsx",
      sheetName: "Rate List",
      title: "AVMLabs — Rate List",
      subtitle: `Generated ${today()} · ${tests.length} test${tests.length === 1 ? "" : "s"}`,
      columns: [
        { header: "Code", key: "code", type: "text", width: 12 },
        { header: "Test", key: "name", type: "text", width: 36 },
        { header: "Category", key: "category", type: "text", width: 18 },
        { header: "Technology", key: "tech", type: "text", width: 20 },
        { header: "Sample", key: "sample", type: "text", width: 12 },
        { header: "B2B", key: "b2b", type: "currency", width: 12 },
        { header: "B2C", key: "b2c", type: "currency", width: 12 },
        { header: "Margin", key: "margin", type: "margin", width: 12 },
      ],
      rows: tests.map(t => ({ code: t.code, name: t.name, category: t.category || "", tech: t.tech, sample: t.sample, b2b: t.b2b, b2c: t.b2c, margin: t.b2c - t.b2b })),
      totals: { b2b: sum.b2b, b2c: sum.b2c, margin: sum.margin },
    });
    AVM.utils.helpers.showToast("Rate list exported to Excel");
  }

  // The Profiles tab's "Export Excel" — one row per ready-made panel
  // (Kidney Profile, Liver Profile, ...) with its own flat price, same
  // shape as the on-screen Profiles table (see panels-table.js), rather
  // than exportRateListCSV's one-row-per-individual-test shape. Takes the
  // same { pkg, items, pricing } rows panels-table.js's getFiltered()
  // already produces so the exported file matches whatever's currently
  // filtered/sorted on screen.
  function exportPanelsCSV(panelRows) {
    if (!panelRows || panelRows.length === 0) {
      AVM.utils.helpers.showToast("Nothing to export");
      return;
    }
    const { packageTestCount } = AVM.modules.calculations;
    const { categories, categoryById } = AVM.data.getCatalog();
    const b2b = panelRows.reduce((n, r) => n + r.pricing.b2b, 0);
    const b2c = panelRows.reduce((n, r) => n + r.pricing.b2c, 0);

    const toRow = ({ pkg, items, pricing }, groupLabel) => ({
      ...(groupLabel ? { __group: groupLabel } : {}),
      name: pkg.name, testsIncluded: AVM.modules.panelsTable.testsIncludedText(pkg, items), testCount: packageTestCount(pkg, items),
      b2b: pricing.b2b, b2c: pricing.b2c, margin: pricing.margin,
    });

    // Grouped by category (General Biochemistry, Vitamins, Kidney
    // Function, ...) with a section-banner row ahead of each group's
    // first profile (see xlsx.js's `__group` handling) — in CATEGORIES'
    // own declared order (same order every other category-driven listing
    // on the site follows), filtered down to only the categories actually
    // present among panelRows so an empty category never gets a banner
    // with nothing under it. Each group keeps whatever sort
    // panelsTable.getFiltered() already applied (Default/Name/B2B/B2C/
    // Margin) as its own internal order.
    const seen = new Set();
    const rows = [];
    categories.map(c => c.id).forEach(catId => {
      const group = panelRows.filter(r => r.pkg.categoryId === catId);
      if (!group.length) return;
      const label = (categoryById[catId] && categoryById[catId].label) || catId;
      group.forEach((r, i) => { seen.add(r.pkg.id); rows.push(toRow(r, i === 0 ? label : null)); });
    });
    // A profile whose categoryId doesn't resolve to any known category
    // (shouldn't happen — every PACKAGES entry's categoryId matches one
    // in CATEGORIES today — but a future typo'd id would otherwise vanish
    // from the export silently) falls into its own trailing group instead.
    const leftover = panelRows.filter(r => !seen.has(r.pkg.id));
    leftover.forEach((r, i) => rows.push(toRow(r, i === 0 ? "Other" : null)));

    AVM.utils.xlsx.downloadWorkbook({
      filename: "avmlabs-profiles.xlsx",
      sheetName: "Profiles",
      title: "AVMLabs — Profiles",
      subtitle: `Generated ${today()} · ${panelRows.length} profile${panelRows.length === 1 ? "" : "s"}`,
      itemNoun: "profile",
      columns: [
        { header: "Profile", key: "name", type: "text", width: 36 },
        // Same group-aware breakdown the on-screen "Tests included"
        // expander shows (see panels-table.js's testsIncludedText), flattened
        // to plain text for the cell.
        { header: "Tests Included", key: "testsIncluded", type: "text", width: 60 },
        // "text", not "currency" — xlsx.js's only two numeric-cell styles
        // both apply the ₹ currency format (see stylesXml's numFmtId 164),
        // which would print this plain test count as "₹28".
        { header: "No of Tests", key: "testCount", type: "text", width: 12 },
        { header: "B2B", key: "b2b", type: "currency", width: 12 },
        { header: "B2C", key: "b2c", type: "currency", width: 12 },
        { header: "Margin", key: "margin", type: "margin", width: 12 },
      ],
      rows,
      totals: { b2b, b2c, margin: b2c - b2b },
    });
    AVM.utils.helpers.showToast("Profiles exported to Excel");
  }

  AVM.modules.exportProfile = { copyProfileToClipboard, exportProfileCSV, exportRateListCSV, exportPanelsCSV };
})();
