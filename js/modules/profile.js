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

  function renderCart(elements) {
    const { byCode } = AVM.data.getCatalog();
    const { money } = AVM.utils.formatters;
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

    elements.badge.textContent = items.length;
    elements.sub.textContent = `${items.length} test${items.length !== 1 ? "s" : ""} selected`;

    if (items.length === 0) {
      elements.body.innerHTML = `<p class="cart-empty">Your profile is empty. Add tests from the rate list or start from a panel.</p>`;
      elements.b2b.textContent = money(0);
      elements.b2c.textContent = money(0);
      elements.margin.textContent = money(0);
      if (elements.marginPct) elements.marginPct.textContent = "+0%";
      if (elements.price) elements.price.textContent = money(0);
      return;
    }

    const groups = groupCartItems(items);
    const multiGroup = groups.length > 1 || (groups.length === 1 && groups[0].pkg);

    elements.body.innerHTML = groups.map(group => {
      const groupKey = group.pkg ? group.pkg.id : "individual";
      const collapsed = multiGroup && !state.expandedGroups.has(groupKey);

      const rows = group.items.map(t => `
        <div class="cart-item">
          <div class="cart-item__name">${t.name}<small>${t.code}${customerView ? ` · Price ${money(t.b2c)}` : ` · B2B ${money(t.b2b)} · B2C ${money(t.b2c)}`}</small></div>
          ${customerView ? "" : `<div class="cart-item__margin">+${money(t.b2c - t.b2b)}</div>`}
          <button type="button" class="cart-item__remove" data-code="${t.code}" aria-label="Remove ${t.name}">✕</button>
        </div>
      `).join("");

      const calcRows = (group.pkg && group.pkg.calculatedParams || []).map(name => `
        <div class="cart-item cart-item--calc">
          <div class="cart-item__name">${name}<small>Calculated from the tests above</small></div>
        </div>
      `).join("");

      if (!multiGroup) return rows; // plain flat list — no need for a heading when it's all individual picks

      const groupName = group.pkg ? group.pkg.name : "Individually added";
      const testCount = group.pkg ? AVM.modules.calculations.packageTestCount(group.pkg) : group.items.length;

      return `
        <div class="cart-group ${collapsed ? "is-collapsed" : ""}">
          <button type="button" class="cart-group__title" data-toggle-group="${groupKey}" aria-expanded="${!collapsed}">
            <span class="cart-group__chevron" aria-hidden="true">▾</span>
            <span class="cart-group__title-text">${groupName}</span>
            <span class="cart-group__meta">${testCount} test${testCount !== 1 ? "s" : ""}</span>
          </button>
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
    if (elements.price) elements.price.textContent = money(sum.b2c);

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
  }

  AVM.modules.profile = {
    persistCart, restoreCart, toggleTest, addPackage, removePackage, isPackageActive,
    removeFromProfile, clearProfile, renderCart, conflictingCodeFor,
  };
})();
