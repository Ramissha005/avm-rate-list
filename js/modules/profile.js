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
    const discountedPrice = saved && !Array.isArray(saved) && typeof saved.discountedPrice === "number"
      ? saved.discountedPrice : null;
    state.discountedPrice = discountedPrice;
  }

  // `value` comes straight from the discount input's raw string on every
  // keystroke. Blank clears the discount; anything that doesn't parse to a
  // finite, non-negative number is ignored rather than wiping out what was
  // typed so far (e.g. a bare "-" mid-edit) — the field keeps showing what
  // the user typed (see renderCart's focus guard) even though state hasn't
  // caught up to it yet.
  function setDiscountedPrice(value) {
    const trimmed = String(value == null ? "" : value).trim();
    if (trimmed === "") {
      state.discountedPrice = null;
      persistCart();
      return;
    }
    const num = Number(trimmed);
    if (Number.isFinite(num) && num >= 0) {
      state.discountedPrice = num;
      persistCart();
    }
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
    if (removed > 0) AVM.utils.helpers.showToast(`Removed ${pkg.name} panel from your profile`);
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
  // above a highlighted "Discounted Price". B2C never gets the B2B bulk
  // discount (see calculations.js), so this manual figure is the only
  // discount a customer copy can show. `original` is 0 for an empty cart.
  // Only touches the price-box elements; caller still fills the plain B2C
  // row above it.
  function updatePriceBox(elements, customerView, original) {
    if (!elements.priceBox) return;
    const { money } = AVM.utils.formatters;
    const discounted = state.discountedPrice;
    const hasDiscount = discounted != null && discounted > 0;

    if (elements.priceOriginalRow) elements.priceOriginalRow.style.display = hasDiscount ? "" : "none";
    if (elements.priceOriginal) elements.priceOriginal.textContent = money(original);
    if (elements.priceLabel) elements.priceLabel.textContent = hasDiscount ? "Discounted Price" : "Price";
    if (elements.price) elements.price.textContent = money(hasDiscount ? discounted : original);

    // Don't stomp on what's being typed — resetting `.value` mid-keystroke
    // (every render goes through here) would fight the user's cursor.
    if (elements.discountInput && document.activeElement !== elements.discountInput) {
      elements.discountInput.value = discounted != null ? discounted : "";
    }
    if (elements.discountClear) elements.discountClear.hidden = discounted == null;
    if (elements.discountWarn) {
      const showWarn = hasDiscount && discounted >= original;
      elements.discountWarn.style.display = showWarn ? "" : "none";
    }
  }

  function renderCart(elements) {
    const { byCode } = AVM.data.getCatalog();
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const customerView = state.customerView;

    // Set inline `style.display` rather than the `hidden` attribute — `.ct-row`
    // and other component rules declare their own `display`, which (being an
    // author rule vs. the UA's `[hidden]{display:none}`) wins the cascade and
    // silently keeps the row visible if we only toggle `hidden`.
    if (elements.b2bRow) elements.b2bRow.style.display = customerView ? "none" : "";
    if (elements.b2cRow) elements.b2cRow.style.display = customerView ? "none" : "";
    if (elements.marginBox) elements.marginBox.style.display = customerView ? "none" : "";
    if (elements.priceBox) elements.priceBox.style.display = customerView ? "" : "none";
    // Reset every render — shown again below only when a bulk discount is
    // actually in effect (and never in customer view, alongside B2B/margin).
    if (elements.discountRow) elements.discountRow.style.display = "none";
    if (elements.netB2bRow) elements.netB2bRow.style.display = "none";
    if (elements.discountHint) elements.discountHint.style.display = "none";
    if (elements.msbRow) elements.msbRow.style.display = "none";
    if (elements.msbHint) elements.msbHint.style.display = "none";

    elements.badge.textContent = items.length;
    elements.sub.textContent = `${items.length} test${items.length !== 1 ? "s" : ""} selected`;

    if (items.length === 0) {
      elements.body.innerHTML = `<p class="cart-empty">Your profile is empty. Add tests from the rate list or start from a panel.</p>`;
      elements.b2b.textContent = money(0);
      elements.b2c.textContent = money(0);
      elements.margin.textContent = money(0);
      if (elements.marginPct) elements.marginPct.textContent = "+0%";
      updatePriceBox(elements, customerView, 0);
      return;
    }

    const groups = groupCartItems(items);

    elements.body.innerHTML = groups.map(group => {
      const rows = group.items.map(t => `
        <div class="cart-item">
          <div class="cart-item__name">${esc(t.name)}<small>${esc(t.code)}${customerView ? ` · Price ${money(t.b2c)}` : ` · B2B ${money(t.b2b)} · B2C ${money(t.b2c)}`}</small></div>
          ${customerView ? "" : `<div class="cart-item__margin">+${money(t.b2c - t.b2b)}</div>`}
          <button type="button" class="cart-item__remove" data-code="${esc(t.code)}" aria-label="Remove ${esc(t.name)}">✕</button>
        </div>
      `).join("");

      // Individually added tests (no package tag) are never grouped under a
      // heading — they're just plain rows, added and removed one at a time.
      if (!group.pkg) return rows;

      const groupKey = group.pkg.id;
      const collapsed = !state.expandedGroups.has(groupKey);
      const testCount = AVM.modules.calculations.packageTestCount(group.pkg);
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
              <span class="cart-group__meta">${testCount} test${testCount !== 1 ? "s" : ""}</span>
            </button>
            <button type="button" class="cart-group__remove" data-remove-pkg="${esc(group.pkg.id)}" aria-label="Remove ${esc(group.pkg.name)} panel">✕</button>
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
    // The headline margin is the partner's real bottom line — after the
    // bulk B2B discount below, not before it.
    elements.margin.textContent = money(sum.netMargin);
    if (elements.marginPct) elements.marginPct.textContent = "+" + Math.round(sum.netMarginPercentage) + "%";
    updatePriceBox(elements, customerView, sum.b2c);

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

    if (!customerView && sum.discountRate > 0) {
      if (elements.discountRow) {
        elements.discountRow.style.display = "";
        if (elements.discountLabel) elements.discountLabel.textContent = `Bulk Discount (${Math.round(sum.discountRate * 100)}%)`;
        if (elements.discountAmt) elements.discountAmt.textContent = "−" + money(sum.discountAmount);
      }
      if (elements.netB2bRow) {
        elements.netB2bRow.style.display = "";
        if (elements.netB2b) elements.netB2b.textContent = money(sum.netB2b);
      }
    }

    // "Add ₹X more to unlock a bigger Bulk Discount" — points at the next
    // tier above the current MSB-adjusted B2B total (the same base the
    // discount itself is computed on), whether or not a discount already
    // applies today. Nothing shown once the top tier (20%) is reached.
    if (!customerView && elements.discountHint) {
      const next = AVM.modules.calculations.nextDiscountTier(sum.msbB2b);
      if (next) {
        elements.discountHint.style.display = "";
        elements.discountHint.textContent =
          `Add ${money(next.remaining)} more to unlock a ${Math.round(next.rate * 100)}% Bulk Discount (over ${money(next.over)})`;
      }
    }
  }

  AVM.modules.profile = {
    persistCart, restoreCart, toggleTest, addPackage, removePackage, isPackageActive,
    removeFromProfile, clearProfile, renderCart, conflictingCodeFor,
    setDiscountedPrice, clearDiscountedPrice,
  };
})();
