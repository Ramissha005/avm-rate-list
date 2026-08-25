window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;
  const CONFIG = AVM.CONFIG;

  // Maps a test code -> the package id it was added as part of, purely so
  // the cart can group "Kidney Profile" together under its own heading.
  // This is NOT a lock — every test stays freely removable one at a time
  // regardless of how it got into the profile; removing it just clears the
  // tag along with it.
  state.cartPackageOf = state.cartPackageOf || new Map();

  // Which cart groups (by package id, or "individual" for the untitled
  // group) have been expanded past just their heading — every group starts
  // collapsed (heading + test count only) so adding a big panel like Liver
  // Profile doesn't turn the whole drawer into one long scroll; click a
  // heading to drop down and see its tests. Not persisted; resets each
  // session.
  state.expandedGroups = state.expandedGroups || new Set();

  // Tracks the cart size across renders purely to detect "a test was just
  // added" (see renderCart's popAnimate call below) — not persisted, and
  // deliberately module-local rather than on `state` since nothing else
  // needs it. Starts null so the very first render (page load, restoring
  // a saved cart) never triggers a pop for tests that were already there.
  let lastCartCount = null;

  // Restarts a CSS animation reliably even if it's already mid-play from a
  // previous add (e.g. two tests added in quick succession) — remove the
  // class, force a reflow, then re-add it. Cleans itself up once the
  // animation finishes so the class doesn't linger on the element.
  function popAnimate(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth; // force reflow — restarts the animation on re-add
    el.classList.add(className);
    el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
  }

  function persistCart() {
    AVM.utils.storage.writeJSON(CONFIG.STORAGE_KEYS.PROFILE, {
      codes: [...state.cart],
      packageOf: Object.fromEntries(state.cartPackageOf),
      discountedPrice: state.discountedPrice,
    });
  }

  function restoreCart() {
    const saved = AVM.utils.storage.readJSON(CONFIG.STORAGE_KEYS.PROFILE, []);
    // Backward-compatible with older storage shapes tried during development
    // (plain array of codes, or { codes, locks }) — take just the codes.
    const codes = Array.isArray(saved) ? saved : (saved && saved.codes) || [];
    state.cart = new Set(codes);
    const packageOf = (saved && !Array.isArray(saved) && saved.packageOf) || {};
    state.cartPackageOf = new Map(Object.entries(packageOf));
    // Deliberately NOT restored from storage, even though persistCart() still
    // writes it — a discount typed for one client shouldn't silently reapply
    // to whatever's in the cart the next time this device opens My Profile
    // (a different client, a rebuilt profile, days later). Every fresh
    // session starts at the plain B2C price (see updateDiscountEditor's
    // fallback below); staff types a lower number only when *this* client
    // actually needs one.
    state.discountedPrice = null;
  }

  // `value` comes straight from the discount input's raw string on every
  // keystroke. Blank clears the discount; anything that doesn't parse to a
  // finite, non-negative number is ignored rather than wiping out what was
  // typed so far (e.g. a bare "-" mid-edit) — the field keeps showing what
  // the user typed (see renderCart's focus guard) even though state hasn't
  // caught up to it yet. A discount can't exceed the profile's own B2C
  // total — it's a discount, not a markup — so anything higher is capped
  // at that total; the caller uses the returned value to snap the input's
  // displayed text back down to what was actually applied.
  function setDiscountedPrice(value) {
    const trimmed = String(value == null ? "" : value).trim();
    if (trimmed === "") {
      state.discountedPrice = null;
      persistCart();
      return null;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) return state.discountedPrice;
    const { byCode } = AVM.data.getCatalog();
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const original = AVM.modules.calculations.totals(items).b2c;
    state.discountedPrice = original > 0 ? Math.min(num, original) : num;
    persistCart();
    return state.discountedPrice;
  }

  function clearDiscountedPrice() {
    state.discountedPrice = null;
    persistCart();
  }

  // The test already occupying the same conflict-group "slot" as `code`, if
  // any of its group-mates is currently in the profile — else null. Used to
  // stop genuinely redundant picks (e.g. Fasting + Random Blood Sugar).
  function conflictingCodeFor(code) {
    const { conflictGroupByCode } = AVM.data.getCatalog();
    const group = conflictGroupByCode[code];
    if (!group) return null;
    return group.codes.find(c => c !== code && state.cart.has(c)) || null;
  }

  function toggleTest(code) {
    const { byCode } = AVM.data.getCatalog();
    const test = byCode[code];
    if (!test) return;

    if (state.cart.has(code)) {
      state.cart.delete(code);
      state.cartPackageOf.delete(code);
      AVM.utils.helpers.showToast(`Removed ${test.name} from your profile`);
    } else {
      const conflictCode = conflictingCodeFor(code);
      if (conflictCode) {
        const other = byCode[conflictCode];
        AVM.utils.helpers.showToast(`You already have ${other ? other.name : conflictCode} selected — remove it first to add ${test.name}`);
        return;
      }
      state.cart.add(code);
      AVM.utils.helpers.showToast(`Added ${test.name} to your profile`);
    }
    persistCart();
  }

  // Adds every test in the package that isn't already in the profile, and
  // tags all of them (new or already-present) as belonging to this package
  // so the cart can group them under one heading. Codes that would conflict
  // with something already selected are skipped rather than blocking the
  // rest of the panel. Every test stays freely removable afterwards.
  function addPackage(pkg) {
    const { byCode } = AVM.data.getCatalog();
    let added = 0;
    let skipped = 0;
    pkg.codes.forEach(code => {
      if (!byCode[code]) return;
      if (!state.cart.has(code)) {
        if (conflictingCodeFor(code)) { skipped++; return; }
        state.cart.add(code);
        added++;
      }
      state.cartPackageOf.set(code, pkg.id);
    });
    persistCart();
    if (added > 0) {
      AVM.utils.helpers.showToast(
        `Added ${pkg.name} (${added} test${added > 1 ? "s" : ""}) to your profile` +
        (skipped > 0 ? ` — ${skipped} skipped due to a conflicting test already selected` : "")
      );
    } else if (skipped > 0) {
      AVM.utils.helpers.showToast(`${pkg.name} tests conflict with what's already in your profile`);
    } else {
      AVM.utils.helpers.showToast(`${pkg.name} is already in your profile`);
    }
    return added;
  }

  // True once every test in the package is present in the profile — used
  // only to flip the bundle chip to its "✓ remove panel" state. This is a
  // pure display check, not a lock: it's still true (and the chip still
  // offers to remove the whole panel) even if some of those tests got there
  // one at a time rather than through this package.
  function isPackageActive(pkg) {
    return pkg.codes.every(code => state.cart.has(code));
  }

  // Removes every test in the package from the profile — the chip's
  // "already added" counterpart to addPackage(). Doesn't touch anything
  // that isn't part of this package.
  function removePackage(pkg) {
    let removed = 0;
    pkg.codes.forEach(code => {
      // A code shared by two overlapping packages (e.g. UTSH in both Total
      // Thyroid and Free Thyroid) gets re-tagged to whichever was added
      // most recently (see addPackage) — so it's currently displayed under
      // *that* package's group, not this one. If it's now tagged to a
      // different package, leave it alone; removing this panel shouldn't
      // silently pull a test out from under a different, still-active
      // group. Untagged codes (added individually) and codes still tagged
      // to this package are removed as normal.
      const taggedTo = state.cartPackageOf.get(code);
      if (taggedTo && taggedTo !== pkg.id) return;
      if (state.cart.delete(code)) removed++;
      state.cartPackageOf.delete(code);
    });
    persistCart();
    if (removed > 0) AVM.utils.helpers.showToast(`Removed ${pkg.name} from your profile`);
    return removed;
  }

  function removeFromProfile(code) {
    state.cart.delete(code);
    state.cartPackageOf.delete(code);
    persistCart();
  }

  function clearProfile() {
    state.cart.clear();
    state.cartPackageOf.clear();
    state.discountedPrice = null;
    persistCart();
    AVM.utils.helpers.showToast("Profile cleared");
  }

  // Groups the profile's items by the package they were added from — each
  // group becomes its own "<Profile Name>" section in the cart; anything
  // added one at a time (no package tag) falls into a final untitled group.
  function groupCartItems(items) {
    const { packageById } = AVM.data.getCatalog();
    const groups = [];
    const groupByPkgId = {};
    const individual = [];
    items.forEach(t => {
      const pkgId = state.cartPackageOf.get(t.code);
      const pkg = pkgId ? packageById[pkgId] : null;
      if (!pkg) { individual.push(t); return; }
      if (!groupByPkgId[pkg.id]) {
        groupByPkgId[pkg.id] = { pkg, items: [] };
        groups.push(groupByPkgId[pkg.id]);
      }
      groupByPkgId[pkg.id].items.push(t);
    });
    if (individual.length) groups.push({ pkg: null, items: individual });
    return groups;
  }

  // The customer-copy price box: plain "Price" (= B2C total) normally, or —
  // once a discounted price is entered — "Original Price" (struck through)
  // above a highlighted "Discounted Price". Read-only display only, no
  // editing controls — the customer copy is what gets handed over, not
  // where the discount gets typed in (see updateDiscountEditor below).
  // `original` is 0 for an empty cart.
  //
  // `hasStoredDiscount` (a value exists) and `hasValidDiscount` (that value
  // is still lower than `original`) are deliberately separate: a discount
  // typed against a bigger cart stays in state even after tests are
  // removed and the total shrinks under it (removeFromProfile/toggleTest/
  // removePackage don't touch state.discountedPrice — see there). Gating
  // the *display* on validity, same as renderCart's margin calc and the
  // export/print paths already do, means a stale discount quietly falls
  // back to showing the plain (correct) total instead of presenting an
  // out-of-date — and possibly now-higher-than-original — number as if it
  // were still active.
  function updatePriceBox(elements, original) {
    if (!elements.priceBox) return;
    const { money } = AVM.utils.formatters;
    const discounted = state.discountedPrice;
    const hasValidDiscount = discounted != null && discounted > 0 && discounted < original;

    if (elements.priceOriginalRow) elements.priceOriginalRow.style.display = hasValidDiscount ? "" : "none";
    if (elements.priceOriginal) elements.priceOriginal.textContent = money(original);
    if (elements.priceLabel) elements.priceLabel.textContent = hasValidDiscount ? "Discounted Price" : "Price";
    if (elements.price) elements.price.textContent = money(hasValidDiscount ? discounted : original);
  }

  // The staff-facing side of the same discount: the input itself, the
  // "Discounted Price" row under B2C Value, and the over-limit warning —
  // all live in the internal view only (never Customer copy), right next
  // to B2B/B2C/Margin so whoever types a discount can immediately see what
  // it does to their margin below (see renderCart's margin block).
  function updateDiscountEditor(elements, customerView, original) {
    const { money } = AVM.utils.formatters;
    const discounted = state.discountedPrice;
    const hasStoredDiscount = discounted != null && discounted > 0;
    const hasValidDiscount = hasStoredDiscount && discounted < original;

    if (elements.discountEditor) elements.discountEditor.style.display = customerView ? "none" : "";

    // Don't stomp on what's being typed — resetting `.value` mid-keystroke
    // (every render goes through here) would fight the user's cursor. `max`
    // is safe to keep in sync regardless of focus — it doesn't touch the
    // typed text, just the native up/down-arrow ceiling and validity state.
    // The input always echoes the raw stored value (valid or not) so
    // there's something to see and correct; validity only gates the
    // read-only displays below.
    //
    // No discount typed yet -> default the field to the plain B2C total
    // rather than leaving it blank. Staff edits it *down* from there for a
    // client who actually needs a lower price; state.discountedPrice stays
    // null (no discount actually applied) until they do — this is just what
    // the field starts showing, not a discount someone has to explicitly
    // clear before it "goes back" to B2C.
    if (elements.discountInput) {
      elements.discountInput.max = original > 0 ? original : "";
      if (document.activeElement !== elements.discountInput) {
        elements.discountInput.value = discounted != null ? discounted : (original > 0 ? original : "");
      }
    }
    if (elements.discountClear) elements.discountClear.hidden = discounted == null;
    if (elements.discountWarn) {
      // Covers both "just typed a value that isn't lower" and "the cart
      // shrank under a discount that used to be valid" — either way, a
      // stored value that isn't currently < original gets flagged here.
      const showWarn = hasStoredDiscount && discounted >= original;
      elements.discountWarn.style.display = showWarn ? "" : "none";
    }

    if (elements.discountedRow) {
      const showRow = !customerView && hasValidDiscount;
      elements.discountedRow.style.display = showRow ? "" : "none";
      if (showRow && elements.discountedAmt) elements.discountedAmt.textContent = money(discounted);
    }
    // Struck through above the new "Discounted Price" row once it's showing,
    // same treatment the customer-copy price box gives it.
    if (elements.b2c) elements.b2c.classList.toggle("ct-amount--struck", !customerView && hasValidDiscount);
  }

  function renderCart(elements) {
    const { byCode } = AVM.data.getCatalog();
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const customerView = state.customerView;

    // A test was just added (not removed, not the first render) — pop the
    // "Make My Profile" button so the count updating isn't the only sign
    // something landed in the profile. Compared *before* lastCartCount is
    // updated below, so this only ever fires on a genuine increase.
    const justAdded = lastCartCount !== null && items.length > lastCartCount;
    lastCartCount = items.length;
    if (justAdded && elements.cartBtn) popAnimate(elements.cartBtn, "cart-btn--pop");

    // Set inline `style.display` rather than the `hidden` attribute — `.ct-row`
    // and other component rules declare their own `display`, which (being an
    // author rule vs. the UA's `[hidden]{display:none}`) wins the cascade and
    // silently keeps the row visible if we only toggle `hidden`.
    if (elements.b2bRow) elements.b2bRow.style.display = customerView ? "none" : "";
    if (elements.b2cRow) elements.b2cRow.style.display = customerView ? "none" : "";
    if (elements.marginBox) elements.marginBox.style.display = customerView ? "none" : "";
    // The row wrapping the discount editor + margin box side by side —
    // hidden as a whole in customer view (both children would be empty
    // anyway) rather than leaving a blank flex row behind.
    if (elements.discountMarginRow) elements.discountMarginRow.style.display = customerView ? "none" : "";
    if (elements.priceBox) elements.priceBox.style.display = customerView ? "" : "none";
    // Copy List / Export Excel / Print Profile are customer-handoff
    // actions — only relevant once there's a customer copy to hand off.
    if (elements.cartActions) elements.cartActions.style.display = customerView ? "" : "none";
    // Reset every render — shown again below only when actually in effect
    // (and never in customer view, alongside B2B/margin).
    if (elements.msbRow) elements.msbRow.style.display = "none";
    if (elements.msbHint) elements.msbHint.style.display = "none";
    if (elements.franchiseRow) elements.franchiseRow.style.display = "none";
    if (elements.b2b) elements.b2b.classList.remove("ct-amount--struck");

    elements.badge.textContent = items.length;
    elements.sub.textContent = `${items.length} test${items.length !== 1 ? "s" : ""} selected`;

    if (items.length === 0) {
      elements.body.innerHTML = `<p class="cart-empty">Your profile is empty. Add tests from the rate list or start from a profile.</p>`;
      elements.b2b.textContent = money(0);
      elements.b2c.textContent = money(0);
      elements.margin.textContent = money(0);
      if (elements.marginPct) elements.marginPct.textContent = "+0%";
      if (elements.marginLabel) elements.marginLabel.textContent = "Your Margin";
      updatePriceBox(elements, 0);
      updateDiscountEditor(elements, customerView, 0);
      return;
    }

    const groups = groupCartItems(items);

    elements.body.innerHTML = groups.map(group => {
      const inGroup = !!group.pkg;
      // Customer copy never shows the internal test code — a customer
      // needs the test's name and what it costs, not "BUN". Once a test is
      // part of a labeled panel, its price is shown once at the panel
      // level instead (see cart-group__meta below), so grouped rows carry
      // no per-item detail line at all in customer view.
      const rows = group.items.map(t => {
        const detail = customerView
          ? (inGroup ? "" : `<small>${money(t.b2c)}</small>`)
          : `<small>${esc(t.code)} · B2B ${money(t.b2b)} · B2C ${money(t.b2c)}</small>`;
        return `
        <div class="cart-item">
          <div class="cart-item__name">${esc(t.name)}${detail}</div>
          ${customerView ? "" : `<div class="cart-item__margin">+${money(t.b2c - t.b2b)}</div>`}
          <button type="button" class="cart-item__remove" data-code="${esc(t.code)}" aria-label="Remove ${esc(t.name)}">✕</button>
        </div>
      `;
      }).join("");

      // Individually added tests (no package tag) are never grouped under a
      // heading — they're just plain rows, added and removed one at a time.
      if (!group.pkg) return rows;

      const groupKey = group.pkg.id;
      const collapsed = !state.expandedGroups.has(groupKey);
      const testCount = AVM.modules.calculations.packageTestCount(group.pkg, group.items);
      // The panel's own B2C total, shown once in the header — see rows
      // above, which rely on this instead of repeating a price on every
      // line inside the panel.
      const groupB2C = AVM.modules.calculations.totals(group.items).b2c;
      const calcRows = (group.pkg.calculatedParams || []).map(name => `
        <div class="cart-item cart-item--calc">
          <div class="cart-item__name">${esc(name)}<small>Calculated from the tests above</small></div>
        </div>
      `).join("");

      return `
        <div class="cart-group ${collapsed ? "is-collapsed" : ""}">
          <div class="cart-group__header">
            <button type="button" class="cart-group__title" data-toggle-group="${esc(groupKey)}" aria-expanded="${!collapsed}">
              <span class="cart-group__chevron" aria-hidden="true">▾</span>
              <span class="cart-group__title-text">${esc(group.pkg.name)}</span>
              <span class="cart-group__meta">${testCount} test${testCount !== 1 ? "s" : ""} · ${money(groupB2C)}</span>
            </button>
            <button type="button" class="cart-group__remove" data-remove-pkg="${esc(group.pkg.id)}" aria-label="Remove ${esc(group.pkg.name)}">✕</button>
          </div>
          <div class="cart-group__items" ${collapsed ? "hidden" : ""}>${rows}${calcRows}</div>
        </div>`;
    }).join("");

    elements.body.querySelectorAll(".cart-item__remove").forEach(btn => {
      btn.onclick = () => {
        removeFromProfile(btn.dataset.code);
        elements.onChange();
      };
    });

    elements.body.querySelectorAll("[data-toggle-group]").forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.toggleGroup;
        if (state.expandedGroups.has(key)) state.expandedGroups.delete(key);
        else state.expandedGroups.add(key);
        elements.onChange();
      };
    });

    elements.body.querySelectorAll("[data-remove-pkg]").forEach(btn => {
      btn.onclick = () => {
        const { packageById } = AVM.data.getCatalog();
        const pkg = packageById[btn.dataset.removePkg];
        if (pkg) removePackage(pkg);
        elements.onChange();
      };
    });

    const sum = AVM.modules.calculations.totals(items);
    // The headline B2B figure is the MSB-adjusted cost (grouped by sample
    // type, floored at ₹25/sample type), not a raw per-test sum — that's
    // what the partner is actually billed. Per-item rows below still show
    // each test's own raw price.
    elements.b2b.textContent = money(sum.msbB2b);
    elements.b2c.textContent = money(sum.b2c);
    // The headline margin is the partner's real bottom line — after MSB,
    // and (if set) after a staff-entered customer discount too: what the
    // customer actually pays, minus the partner's own (MSB-adjusted) cost.
    // The discount only takes effect once it's genuinely lower than the
    // B2C total it would otherwise be based on.
    //
    // On the Franchise page (elements.useFranchiseMargin — see app.js,
    // true only when the page's own #cartFranchiseHint exists), that cost
    // is the Franchise rate instead of B2B: a visitor there is weighing
    // life as a franchisee, so their margin should read against what
    // they'd actually pay as one, not the regular B2B rate.
    const discountedPrice = state.discountedPrice;
    const hasCustomerDiscount = discountedPrice != null && discountedPrice > 0 && discountedPrice < sum.b2c;
    const marginBase = hasCustomerDiscount ? discountedPrice : sum.b2c;
    const costBase = elements.useFranchiseMargin ? sum.msbFranchise : sum.netB2b;
    const finalMargin = marginBase - costBase;
    const finalMarginPct = AVM.modules.calculations.marginPercentage(costBase, marginBase);
    elements.margin.textContent = money(finalMargin);
    if (elements.marginPct) elements.marginPct.textContent = (finalMargin >= 0 ? "+" : "") + Math.round(finalMarginPct) + "%";
    if (elements.marginLabel) elements.marginLabel.textContent = hasCustomerDiscount ? "Your Margin (after discount)" : "Your Margin";
    if (elements.marginBox) elements.marginBox.classList.toggle("margin-box--loss", finalMargin < 0);
    updatePriceBox(elements, sum.b2c);
    updateDiscountEditor(elements, customerView, sum.b2c);

    // Minimum Sample Billing: surface it as its own line (not silently
    // folded into B2B Cost above) plus a hint telling the partner exactly
    // how much more of that same sample type would clear the ₹25 floor —
    // so adding one more test in it visibly drops the MSB row instead of
    // just quietly changing the total.
    if (!customerView) {
      const shortfalls = AVM.modules.calculations.msbShortfalls(items);
      if (shortfalls.length > 0) {
        const totalUplift = shortfalls.reduce((s, g) => s + g.uplift, 0);
        if (elements.msbRow) {
          elements.msbRow.style.display = "";
          if (elements.msbAmt) elements.msbAmt.textContent = "+" + money(totalUplift);
        }
        if (elements.msbHint) {
          elements.msbHint.style.display = "";
          elements.msbHint.textContent = shortfalls.length === 1
            ? `Add ${money(shortfalls[0].remaining)} more in ${shortfalls[0].label} to clear the ₹25 minimum`
            : shortfalls.map(g => `${g.label}: add ${money(g.remaining)}`).join(" · ") + " to clear the ₹25 minimum per sample type";
        }
      }
    }

    // Franchise upsell: what this exact profile would cost at the Franchise
    // rate vs. what's actually being paid today (Net B2B Payable) — see
    // calculations.js totals() for the math. Same callout treatment as the
    // margin box (colored panel, left accent bar, label + live pill, big
    // bold amount) — see .franchise-box. Only shown once there's a genuine
    // saving to point at (a stray rounding-equal profile shows nothing
    // rather than a "Save 0%" box). Internal view only — this is a
    // partner-facing upsell nudge, not something to hand a customer.
    if (!customerView && sum.franchiseSavings > 0 && elements.franchiseRow) {
      elements.franchiseRow.style.display = "";
      if (elements.franchiseAmt) elements.franchiseAmt.textContent = money(sum.msbFranchise);
      const pct = Math.round(sum.franchiseSavingsPercentage);
      // "Saving X%" on the Franchise page (elements.useFranchiseMargin)
      // to match the hint sentence right below it ("You're saving X%
      // as an AVMLabs Franchisee") — "Save X%" everywhere else, where
      // it's a plain upsell nudge rather than something addressed at a
      // visitor already weighing life as a franchisee.
      if (elements.franchisePct) {
        elements.franchisePct.textContent = elements.useFranchiseMargin ? `Saving ${pct}%` : `Save ${pct}%`;
      }
      // Franchise page only (see franchise.html) — spells out the "you're
      // a franchisee" framing, since a visitor there is specifically
      // weighing that decision rather than just glancing at a nudge.
      if (elements.franchiseHint) {
        elements.franchiseHint.textContent = `You're saving ${pct}% as an AVMLabs Franchisee.`;
      }
      // Franchise page only (elements.useFranchiseMargin) — strikes
      // through B2B Cost so it reads as the "before" price the
      // Franchise Rate box above it replaces, not a second, unrelated
      // figure a visitor has to compare on their own.
      if (elements.useFranchiseMargin && elements.b2b) {
        elements.b2b.classList.add("ct-amount--struck");
      }
    }
  }

  AVM.modules.profile = {
    persistCart, restoreCart, toggleTest, addPackage, removePackage, isPackageActive,
    removeFromProfile, clearProfile, renderCart, conflictingCodeFor,
    setDiscountedPrice, clearDiscountedPrice, groupCartItems,
  };
})();
