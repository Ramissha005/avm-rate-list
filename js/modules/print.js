window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;
  const CONFIG = AVM.CONFIG;

  function openPrintProfile() {
    if (state.cart.size === 0 && state.cartPackages.size === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    // This PDF/print-out goes straight to the customer, so the print page
    // (see renderPrintPage) always renders a customer-safe copy — test name
    // and price only, never B2B cost, margin, code, technology or sample —
    // with no way to switch it back to an internal view. It doesn't read
    // the cart's own admin/customer toggle at all.
    AVM.utils.storage.writeSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, {
      codes: [...state.cart],
      discountedPrice: state.discountedPrice,
      // Fixed-price profile bundles in the cart — carried over so the
      // print table can group their tests under a profile heading with
      // its own flat price, the same way the cart drawer does (see
      // renderPrintPage below and profile.js's groupCartItems).
      packages: [...state.cartPackages],
    });
    // index.html sits at the project root; every page/* file sits one level down —
    // this project has no build step to resolve paths, so branch on where we are.
    const target = location.pathname.includes("/pages/") ? "print-profile.html" : "pages/print-profile.html";
    // A popup blocker (or a browser that doesn't treat this click handler
    // as a "direct" user gesture) makes window.open() return null with no
    // error thrown — silently doing nothing otherwise, so the user just
    // sees the button appear broken with no explanation.
    const win = window.open(target, "_blank");
    if (!win) AVM.utils.helpers.showToast("Pop-up blocked — allow pop-ups to open the print view");
  }

  // window.print() renders whatever is on screen *right now* — if the Poppins
  // web font hasn't finished swapping in yet, Chrome prints the fallback font
  // instead. document.fonts.ready resolves once webfonts are actually usable;
  // fall back to a fixed delay for browsers/contexts where that API is missing.
  function afterFontsReady(cb) {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(cb).catch(cb);
    } else {
      setTimeout(cb, 300);
    }
  }

  let cachedItems = null;

  async function renderPrintPage({
    tbody, dateEl, sumTotalEl, sumTotalLabelEl, sumDiscountedCardEl, sumDiscountedPriceEl,
    fastingNoteEl, fastingNoteTextEl, contentEl, emptyEl, titleEl, autoPrint,
  }) {
    const money = AVM.utils.formatters.money;
    const esc = AVM.utils.formatters.escapeHtml;

    if (!cachedItems) {
      const saved = AVM.utils.storage.readSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, []);
      const codes = Array.isArray(saved) ? saved : (saved.codes || []);
      const pkgIds = Array.isArray(saved) ? [] : (saved.packages || []);
      await AVM.data.loadCatalog();
      const { byCode, packageById } = AVM.data.getCatalog();
      // This page never adds/removes tests, but groupCartItems (see below)
      // reads AVM.state.cartPackages to know which fixed-price profile
      // bundles are in the profile — seed it from the print payload so
      // grouping works here the same as it does in the cart drawer that
      // sent us here.
      state.cartPackages = new Set(pkgIds.filter(id => packageById[id]));
      cachedItems = {
        items: codes.map(c => byCode[c]).filter(Boolean),
        // Same "one-off B2C price, not a tiered rule" figure as the cart
        // drawer's price box — carried over via the print payload above so
        // it survives opening in a new tab/window.
        discountedPrice: Array.isArray(saved) || typeof saved.discountedPrice !== "number" ? null : saved.discountedPrice,
      };
    }
    const items = cachedItems.items;
    const { byCode, packageById } = AVM.data.getCatalog();
    const bundlePkgs = [...state.cartPackages].map(id => packageById[id]).filter(Boolean);
    const sum = AVM.modules.calculations.cartTotals(items, bundlePkgs);

    if (titleEl) titleEl.textContent = "Custom Health Profile";

    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    if (items.length === 0 && bundlePkgs.length === 0) {
      if (contentEl) contentEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    // Fasting advisory — a test needs it whether it landed here on its own
    // or nested inside a bundled package (e.g. Lipid Profile's own tests
    // still require it whether added standalone, via the flat Lipid
    // Profile package, or via an AVM 1-5 Profile bundle that includes it
    // as one of its groups) — so this scans every resolved test in the
    // profile, not just the individually-added ones `items` holds.
    if (fastingNoteEl) {
      const allResolvedTests = [
        ...items,
        ...bundlePkgs.flatMap(pkg => pkg.codes.map(c => byCode[c]).filter(Boolean)),
      ];
      const fastingWindows = [...new Set(allResolvedTests.map(t => t.fastingHours).filter(Boolean))];
      fastingNoteEl.hidden = fastingWindows.length === 0;
      if (fastingWindows.length && fastingNoteTextEl) {
        const windowText = w => `${w.replace(/-/g, "–")} Hours`;
        fastingNoteTextEl.textContent = fastingWindows.length === 1
          ? `${windowText(fastingWindows[0])} Fasting Required`
          : `Fasting Required: ${fastingWindows.map(windowText).join(" / ")}`;
      }
    }

    if (tbody) {
      // Grouped the same way the cart drawer groups its own list (see
      // profile.js groupCartItems). A common panel prints as one compact
      // block — heading + total price, then its tests as a plain "included"
      // line — rather than a full priced row per test, since the panel
      // price already covers all of them. Tests added one at a time (no
      // package tag) still print as normal individually-priced rows, same
      // as before. Row numbering (#) only counts those individual rows.
      const cleanName = name => name.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const { highlightAsterisk } = AVM.utils.formatters;

      const groups = AVM.modules.profile.groupCartItems(items);
      let rowNum = 0;
      tbody.innerHTML = groups.map(group => {
        // Individually added tests (no package tag) print as plain,
        // individually-priced rows — no heading, no change from before.
        if (!group.pkg) {
          return group.items.map(t => {
            rowNum++;
            return `
            <tr>
              <td class="sr">${rowNum}</td>
              <td class="name">${esc(t.name)}</td>
              <td class="num">${money(t.b2c)}</td>
            </tr>
          `;
          }).join("");
        }

        // The profile's own flat price, same figure the cart drawer shows
        // in its group header — not summed from group.items, since a
        // profile's price is its own fixed number now (see data.js
        // `pricing`), never assembled from what it lists.
        const groupB2C = group.pkg.pricing.b2c;
        // Escaped per-name, then rejoined with a styled separator span —
        // the dot needs its own markup (bold, blue) so it can't be part of
        // a plain joined-and-escaped string.
        const dot = `<span class="group-head__dot">·</span>`;
        // A profile built from several named sub-panels + a few standalone
        // tests can carry its own per-package `groups` (see data.js) —
        // break its "included" line into one labeled sub-block per panel,
        // same as the site's own Profiles view (panels-table.js), instead
        // of one long flattened line of every test. No current profile
        // uses this; packages without `groups` keep the plain flat line.
        const testsMarkup = group.pkg.groups && group.pkg.groups.length
          ? `<div class="group-head__groups">${group.pkg.groups.map(g => {
              const resolved = g.codes.map(c => byCode[c]).filter(Boolean);
              const names = [
                ...resolved.map(t => cleanName(t.name)),
                ...(g.calculatedParams || []),
              ];
              // Same weighted packageTestCount() math the profile's own
              // Test Count uses (see panels-table.js) — a code like CBC
              // reports more than one result on its own, so the heading's
              // count isn't just how many lines are listed below it.
              // Skipped for a genuine single-parameter group (count === 1)
              // — "(1)" next to a heading that's already just one test's
              // own name only repeats what's obvious.
              const count = AVM.modules.calculations.packageTestCount({ calculatedParams: g.calculatedParams }, resolved);
              const countLabel = count === 1 ? "" : ` (${count})`;
              const body = names.length === 1 ? "" : `<p class="group-head__tests">${names.map(n => highlightAsterisk(esc(n))).join(dot)}</p>`;
              return `
                <div class="group-head__group">
                  <span class="group-head__group-label">${esc(g.label)}${countLabel}</span>
                  ${body}
                </div>`;
            }).join("")}</div>`
          : `<p class="group-head__tests">${[
              ...group.items.map(t => cleanName(t.name)),
              ...(group.pkg.calculatedParams || []),
            ].map(n => highlightAsterisk(esc(n))).join(dot)}</p>`;

        return `
          <tr class="row-group-head">
            <td colspan="3">
              <div class="group-card">
                <div class="group-head">
                  <span class="group-head__name">${esc(group.pkg.name)}</span>
                  <span class="group-head__price">${money(groupB2C)}</span>
                </div>
                ${testsMarkup}
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // The manually-entered customer-copy discount (see profile.js) — the
    // only discount this copy ever shows. Only takes effect when it's
    // actually lower than the B2C total; otherwise this prints as a plain
    // "Total" line, no strike-through.
    const discountedPrice = cachedItems.discountedPrice;
    const hasCustomerDiscount = typeof discountedPrice === "number"
      && discountedPrice > 0 && discountedPrice < sum.b2c;
    if (sumTotalLabelEl) sumTotalLabelEl.textContent = hasCustomerDiscount ? "Original Price" : "Total";
    if (sumTotalEl) {
      sumTotalEl.textContent = money(sum.b2c);
      sumTotalEl.classList.toggle("total-card__value--struck", hasCustomerDiscount);
    }
    if (sumDiscountedCardEl) {
      sumDiscountedCardEl.hidden = !hasCustomerDiscount;
      if (hasCustomerDiscount && sumDiscountedPriceEl) sumDiscountedPriceEl.textContent = money(discountedPrice);
    }

    if (autoPrint) afterFontsReady(() => setTimeout(() => window.print(), 150));
  }

  AVM.modules.print = { openPrintProfile, renderPrintPage };
})();
