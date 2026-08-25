window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;
  const CONFIG = AVM.CONFIG;

  function openPrintProfile() {
    if (state.cart.size === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    // Carries the cart's current Customer Copy setting over as the print
    // page's starting view — it can still be flipped again from the print
    // page's own toggle before actually printing.
    AVM.utils.storage.writeSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, {
      codes: [...state.cart],
      customerView: state.customerView,
      discountedPrice: state.discountedPrice,
      // Which common-panel each code was added as part of — carried over so
      // the print table can group them under a panel heading the same way
      // the cart drawer does (see renderPrintPage below).
      packageOf: Object.fromEntries(state.cartPackageOf),
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
    tbody, dateEl, sumB2BEl, sumB2CEl, sumMarginEl, sumMarginPctEl,
    sumB2CLabelEl, sumDiscountedCardEl, sumDiscountedPriceEl,
    contentEl, emptyEl, sheetEl, titleEl, autoPrint,
  }, customerViewOverride) {
    const money = AVM.utils.formatters.money;
    const esc = AVM.utils.formatters.escapeHtml;

    if (!cachedItems) {
      const saved = AVM.utils.storage.readSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, []);
      const codes = Array.isArray(saved) ? saved : (saved.codes || []);
      await AVM.data.loadCatalog();
      const { byCode } = AVM.data.getCatalog();
      // This page never adds/removes tests, but groupCartItems (see below)
      // reads AVM.state.cartPackageOf to know which panel each code came
      // from — seed it from the print payload so grouping works here the
      // same as it does in the cart drawer that sent us here.
      state.cartPackageOf = new Map(Object.entries(
        (!Array.isArray(saved) && saved.packageOf) || {}
      ));
      cachedItems = {
        items: codes.map(c => byCode[c]).filter(Boolean),
        customerView: Array.isArray(saved) ? false : !!saved.customerView,
        // Same "one-off B2C price, not a tiered rule" figure as the cart
        // drawer's price box — carried over via the print payload above so
        // it survives opening in a new tab/window.
        discountedPrice: Array.isArray(saved) || typeof saved.discountedPrice !== "number" ? null : saved.discountedPrice,
      };
    }
    const items = cachedItems.items;
    const customerView = customerViewOverride != null ? customerViewOverride : cachedItems.customerView;
    const sum = AVM.modules.calculations.totals(items);

    if (sheetEl) sheetEl.classList.toggle("customer-view", customerView);
    if (titleEl) titleEl.textContent = customerView ? "Custom Health Profile — Customer Copy" : "Custom Health Profile";

    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    if (items.length === 0) {
      if (contentEl) contentEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (tbody) {
      // Grouped the same way the cart drawer groups its own list (see
      // profile.js groupCartItems). A common panel prints as one compact
      // block — heading + total price, then its tests as a plain "included"
      // line — rather than a full priced row per test, since the panel
      // price already covers all of them. Tests added one at a time (no
      // package tag) still print as normal individually-priced rows, same
      // as before. Row numbering (#) only counts those individual rows.
      //
      // The heading's colspan matches the number of columns actually
      // visible (5 in customer view, 8 internally) rather than always 8 —
      // a colspan cell that spans a *hidden* column can make the browser's
      // table layout reserve width for that hidden column after all,
      // stretching the row wider than the rest of the table.
      const colCount = customerView ? 5 : 8;
      // A test's own name often already ends in "(CODE)" (e.g. "Blood Urea
      // Nitrogen (BUN)") — stripped here so the "tests included" line
      // reads as plain names, same as panels-table.js's own version does.
      const cleanName = name => name.replace(/\s*\([^)]*\)\s*$/, "").trim();
      // AVM Profile A/B/C and AVM Anemia A's `groups` (see below) list
      // codes, not resolved test objects — this page's own `byCode` was
      // scoped to the cache-population block above and out of reach down
      // here, so it's fetched again (loadCatalog() already resolved by
      // the time we get this far, so this is just a cheap lookup, not a
      // re-fetch).
      const { byCode } = AVM.data.getCatalog();

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
              <td class="c-code"><span class="code">${esc(t.code)}</span></td>
              <td class="name">${esc(t.name)}</td>
              <td class="tech c-tech">${esc(t.tech)}</td>
              <td class="sample">${esc(t.sample)}</td>
              <td class="num c-b2b">${money(t.b2b)}</td>
              <td class="num">${money(t.b2c)}</td>
              <td class="num profit c-margin">+${money(t.b2c - t.b2b)}</td>
            </tr>
          `;
          }).join("");
        }

        // The panel's own B2C total, same figure the cart drawer shows in
        // its group header — the one price that covers every test (and
        // calculated extra) listed below it.
        const groupB2C = AVM.modules.calculations.totals(group.items).b2c;
        // Escaped per-name, then rejoined with a styled separator span —
        // the dot needs its own markup (bold, blue) so it can't be part of
        // a plain joined-and-escaped string.
        const dot = `<span class="group-head__dot">·</span>`;
        // AVM Profile A/B/C and AVM Anemia A are built from several named
        // panels + a few standalone tests (see data.js's per-package
        // `groups`) — break their "included" line into one labeled
        // sub-block per panel, same as the site's own Profiles view
        // (panels-table.js), instead of one long flattened line of every
        // test. Packages without `groups` (the single system panels)
        // keep the original flat line.
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
              const count = AVM.modules.calculations.packageTestCount({ calculatedParams: g.calculatedParams }, resolved);
              const body = names.length === 1 ? "" : `<p class="group-head__tests">${names.map(esc).join(dot)}</p>`;
              return `
                <div class="group-head__group">
                  <span class="group-head__group-label">${esc(g.label)} (${count})</span>
                  ${body}
                </div>`;
            }).join("")}</div>`
          : `<p class="group-head__tests">${[
              ...group.items.map(t => cleanName(t.name)),
              ...(group.pkg.calculatedParams || []),
            ].map(esc).join(dot)}</p>`;

        return `
          <tr class="row-group-head">
            <td colspan="${colCount}">
              <div class="group-head">
                <span class="group-head__name">${esc(group.pkg.name)}</span>
                <span class="group-head__price">${money(groupB2C)}</span>
              </div>
              ${testsMarkup}
            </td>
          </tr>
        `;
      }).join("");
    }

    // The summary card below is the actual billable B2B cost: MSB-adjusted,
    // floored at ₹25 per sample type.
    if (sumB2BEl) sumB2BEl.textContent = money(sum.msbB2b);
    if (sumB2CEl) sumB2CEl.textContent = money(sum.b2c);
    if (sumMarginEl) sumMarginEl.textContent = "+" + money(sum.netMargin);
    if (sumMarginPctEl) sumMarginPctEl.textContent = "+" + Math.round(sum.netMarginPercentage) + "%";

    // The manually-entered customer-copy discount (see profile.js) — the
    // only discount a customer copy ever shows. Only takes effect when
    // it's actually lower than the B2C total; otherwise this prints
    // exactly like before (plain "B2C Value" card, no strike-through).
    const discountedPrice = cachedItems.discountedPrice;
    const hasCustomerDiscount = customerView && typeof discountedPrice === "number"
      && discountedPrice > 0 && discountedPrice < sum.b2c;
    if (sumB2CLabelEl) sumB2CLabelEl.textContent = hasCustomerDiscount ? "Original Price" : "B2C Value";
    if (sumB2CEl) sumB2CEl.classList.toggle("summary__card--struck", hasCustomerDiscount);
    if (sumDiscountedCardEl) {
      sumDiscountedCardEl.hidden = !hasCustomerDiscount;
      if (hasCustomerDiscount && sumDiscountedPriceEl) sumDiscountedPriceEl.textContent = money(discountedPrice);
    }

    if (autoPrint) afterFontsReady(() => setTimeout(() => window.print(), 150));
  }

  AVM.modules.print = { openPrintProfile, renderPrintPage };
})();
