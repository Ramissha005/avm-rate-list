window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;
  const CONFIG = AVM.CONFIG;

  // Fixed-price profile bundles (e.g. Vitamin Profile) currently in the
  // cart — see state.cartPackages in data.js. Guard here too in case
  // profile.js ever loads before data.js sets the initial state shape.
  state.cartPackages = state.cartPackages || new Set();

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
      packages: [...state.cartPackages],
      discountedPrice: state.discountedPrice,
    });
  }

  function restoreCart() {
    const saved = AVM.utils.storage.readJSON(CONFIG.STORAGE_KEYS.PROFILE, []);
    // Backward-compatible with older storage shapes tried during development
    // (plain array of codes, or { codes, locks }) — take just the codes.
    const codes = Array.isArray(saved) ? saved : (saved && saved.codes) || [];
    state.cart = new Set(codes);
    // Older saved carts (from before profiles switched to fixed pricing)
    // have no `packages` field at all — that's fine, it just restores as
    // an empty bundle set; whatever codes that old cart added via a
    // package come back as plain individually-priced tests instead, which
    // is the correct graceful fallback since most of those old packages
    // no longer exist.
    const pkgIds = (saved && !Array.isArray(saved) && saved.packages) || [];
    state.cartPackages = new Set(pkgIds);
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
    const { byCode, packageById } = AVM.data.getCatalog();
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const bundlePkgs = [...state.cartPackages].map(id => packageById[id]).filter(Boolean);
    const original = AVM.modules.calculations.cartTotals(items, bundlePkgs).b2c;
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

  // The fixed-price profile bundle a test is covered by, if any active
  // bundle in the cart includes this code — its price already lives
  // entirely inside that bundle's own flat number (see data.js `pricing`),
  // so the test can't also be added/removed as a separately-priced line
  // while that bundle is active. Independent of state.cart — a bundle's
  // own tests are never added there (see addPackage below).
  function packageOwning(code) {
    const { packageById } = AVM.data.getCatalog();
    for (const pkgId of state.cartPackages) {
      const pkg = packageById[pkgId];
      if (pkg && pkg.codes.includes(code)) return pkg;
    }
    return null;
  }

  function toggleTest(code) {
    const { byCode } = AVM.data.getCatalog();
    const test = byCode[code];
    if (!test) return;

    // Covered by a fixed-price profile bundle already in the cart — its
    // price is already inside that bundle's own flat number, so it can't
    // also be added/removed here as its own line (see packageOwning).
    const owner = packageOwning(code);
    if (owner) {
      AVM.utils.helpers.showToast(`${test.name} is already included in ${owner.name} — remove that profile to change it`);
      return;
    }

    if (state.cart.has(code)) {
      state.cart.delete(code);
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

  // The other active bundle that shares ANY of pkg's own codes, if there
  // is one — not just a bundle that fully contains it. E.g. Total Thyroid
  // Profile (TT3, TT4, TSH) shares only its TSH with AVM 1 Profile (which
  // doesn't have TT3/TT4 at all), but that one shared test is still
  // enough to overlap — adding it too would re-bill that one shared test
  // a second time, even though the rest of the bundle would be genuinely
  // new. Never true for pkg itself (checked first), and only looks for a
  // single bundle that shares a code — not several bundles that only
  // collectively touch all of pkg's codes between them. This just reports
  // the overlap; addPackage decides separately whether it's an upgrade
  // (see isBiggerThan) or a block.
  function coveringPackage(pkg) {
    if (state.cartPackages.has(pkg.id) || !pkg.codes.length) return null;
    const { packageById } = AVM.data.getCatalog();
    for (const pkgId of state.cartPackages) {
      if (pkgId === pkg.id) continue;
      const other = packageById[pkgId];
      if (other && pkg.codes.some(code => other.codes.includes(code))) return other;
    }
    return null;
  }

  // True once `a` covers strictly more reportable tests than `b` — the
  // same weighted count (packageTestCount) the Profiles table's own "No
  // of Tests" column already shows, so "bigger" here always matches what
  // a partner can see on screen. A tie counts as false (neither wins) —
  // deliberately never a swap on equal size, only a genuine upgrade.
  function isBiggerThan(a, b) {
    const { byCode } = AVM.data.getCatalog();
    const { packageTestCount } = AVM.modules.calculations;
    const countOf = pkg => packageTestCount(pkg, pkg.codes.map(c => byCode[c]).filter(Boolean));
    return countOf(a) > countOf(b);
  }

  // Adds a fixed-price profile bundle to the cart as one atomic unit — its
  // price is its own flat number (see data.js `pricing`), not the sum of
  // its member tests, so unlike the old package model those tests are
  // never added to state.cart individually; only the package id itself
  // goes into state.cartPackages.
  //
  // If another active bundle already shares any of pkg's own tests (see
  // coveringPackage), the outcome depends on which one is actually
  // bigger (see isBiggerThan — by the same "No of Tests" count shown on
  // screen): adding a genuinely bigger profile over a smaller active one
  // auto-replaces the smaller one (an "upgrade" — e.g. Total Thyroid
  // Profile gets swapped out the moment AVM 1 Profile is added over it),
  // while adding a smaller/redundant profile over a bigger active one
  // stays blocked, same as adding one already sitting in the cart as
  // separately-added individual tests — both would otherwise bill some
  // of the same tests twice with nothing gained.
  function addPackage(pkg) {
    if (state.cartPackages.has(pkg.id)) {
      AVM.utils.helpers.showToast(`${pkg.name} is already in your profile`);
      return 0;
    }
    const covering = coveringPackage(pkg);
    if (covering) {
      if (isBiggerThan(pkg, covering)) {
        state.cartPackages.delete(covering.id);
        state.cartPackages.add(pkg.id);
        persistCart();
        AVM.utils.helpers.showToast(`${covering.name} was replaced by ${pkg.name}`);
        return 1;
      }
      AVM.utils.helpers.showToast(`${pkg.name} overlaps with ${covering.name} already in your profile — remove that first to add ${pkg.name} separately`);
      return 0;
    }
    const { byCode } = AVM.data.getCatalog();
    const alreadyIndividual = pkg.codes.filter(code => state.cart.has(code));
    if (alreadyIndividual.length) {
      const names = alreadyIndividual.map(c => (byCode[c] && byCode[c].name) || c).join(", ");
      AVM.utils.helpers.showToast(`Remove ${names} from your profile individually first to add ${pkg.name}`);
      return 0;
    }
    state.cartPackages.add(pkg.id);
    persistCart();
    AVM.utils.helpers.showToast(`Added ${pkg.name} to your profile`);
    return 1;
  }

  // The other active bundle that actually stops pkg from being added as
  // its own "+" — i.e. it overlaps with pkg (see coveringPackage) AND
  // isn't smaller than it (a smaller overlapping bundle gets auto-
  // replaced instead of blocking — see addPackage/isBiggerThan), so it
  // never really "blocks" the add. Used by panels-table.js to decide the
  // Blocked/⊘ state — a profile that would actually trigger an upgrade
  // on click shows its normal "+ Add to Profile" instead, since clicking
  // it does genuinely work.
  function blockingPackage(pkg) {
    const covering = coveringPackage(pkg);
    if (!covering) return null;
    return isBiggerThan(pkg, covering) ? null : covering;
  }

  // True once this profile bundle is in the cart — used to flip its
  // "✓ Added" state on the Profiles table and the cart-drawer group.
  // Doesn't count as "active" just because another bundle happens to
  // cover the same tests (see coveringPackage) — that's a separate,
  // blocked state, not this one.
  function isPackageActive(pkg) {
    return state.cartPackages.has(pkg.id);
  }

  // Removes a fixed-price profile bundle from the cart as one atomic unit
  // — the chip's "already added" counterpart to addPackage(). Doesn't
  // touch any individually-added tests, even ones that share a code with
  // this bundle (there shouldn't be any while the bundle is active — see
  // addPackage's own-test guard).
  function removePackage(pkg) {
    if (!state.cartPackages.has(pkg.id)) {
      const covering = coveringPackage(pkg);
      AVM.utils.helpers.showToast(
        covering ? `${pkg.name} overlaps with ${covering.name} — remove that first to free it up` : `${pkg.name} isn't in your profile`
      );
      return 0;
    }
    state.cartPackages.delete(pkg.id);
    persistCart();
    AVM.utils.helpers.showToast(`Removed ${pkg.name} from your profile`);
    return 1;
  }

  function removeFromProfile(code) {
    state.cart.delete(code);
    persistCart();
  }

  function clearProfile() {
    state.cart.clear();
    state.cartPackages.clear();
    state.discountedPrice = null;
    persistCart();
    AVM.utils.helpers.showToast("Profile cleared");
  }

  // Every section the cart drawer / print page render, in a stable order:
  // one section per fixed-price profile bundle currently in the cart
  // (each with its own flat price, not the sum of its listed tests — see
  // data.js `pricing`), then a final untitled section for whatever was
  // added one test at a time. `items` is the individually-added list
  // (state.cart resolved) — a bundle's own tests are never mixed into it
  // (see addPackage), so the two sources never overlap.
  function groupCartItems(items) {
    const { packageById, byCode } = AVM.data.getCatalog();
    const groups = [];
    [...state.cartPackages].forEach(pkgId => {
      const pkg = packageById[pkgId];
      if (!pkg) return;
      groups.push({ pkg, items: pkg.codes.map(c => byCode[c]).filter(Boolean) });
    });
    if (items.length) groups.push({ pkg: null, items });
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
    const { byCode, packageById } = AVM.data.getCatalog();
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    const bundlePkgs = [...state.cartPackages].map(id => packageById[id]).filter(Boolean);
    const customerView = state.customerView;

    // Individually-added tests (each weighted by its own paramCount, same
    // as everywhere else a test's result count matters — see
    // calculations.js) plus every fixed-price bundle's own weighted
    // packageTestCount() — the exact same figure its own group header
    // and the Profiles table's "No of Tests" column already show, so the
    // header badge and "N tests selected" line below always agree with
    // every other count on the page instead of a smaller raw-code-count
    // total that only counted priced lines, not calculated ones.
    const { packageTestCount } = AVM.modules.calculations;
    const totalCount = items.reduce((n, t) => n + (t.paramCount || 1), 0)
      + bundlePkgs.reduce((n, pkg) => n + packageTestCount(pkg, pkg.codes.map(c => byCode[c]).filter(Boolean)), 0);

    // A test (or a whole bundle) was just added (not removed, not the
    // first render) — pop the "Make My Profile" button so the count
    // updating isn't the only sign something landed in the profile.
    // Compared *before* lastCartCount is updated below, so this only ever
    // fires on a genuine increase.
    const justAdded = lastCartCount !== null && totalCount > lastCartCount;
    lastCartCount = totalCount;
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
    // Copy List / Export Excel / Print Profile are useful in both views —
    // a staff member might want the internal copy (with B2B/margin) for
    // their own records just as often as the customer-facing one, and
    // hiding them behind the Customer copy toggle made them undiscoverable
    // by default. Always shown now; copyProfileToClipboard/exportProfileCSV/
    // openPrintProfile each already branch on state.customerView
    // themselves to produce the right version either way.
    if (elements.cartActions) elements.cartActions.style.display = "";
    // Reset every render — shown again below only when actually in effect
    // (and never in customer view, alongside B2B/margin).
    if (elements.mpbRow) elements.mpbRow.style.display = "none";
    if (elements.mpbHint) elements.mpbHint.style.display = "none";

    elements.badge.textContent = totalCount;
    elements.sub.textContent = `${totalCount} test${totalCount !== 1 ? "s" : ""} selected`;

    if (totalCount === 0) {
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
      // A fixed-price profile bundle is billed as one flat number (see
      // data.js `pricing`), not assembled from what's inside it, so a
      // member test here carries no price/margin of its own and can't be
      // removed on its own — only the whole bundle can, via the group's
      // own ✕ (see cart-group__remove below). Same informational,
      // non-priced treatment calculatedParams rows already use.
      //
      // Customer copy never shows the internal test code — a customer
      // needs the test's name and what it costs, not "BUN".
      const rows = group.items.map(t => {
        if (inGroup) {
          return `
          <div class="cart-item cart-item--calc">
            <div class="cart-item__name">${esc(t.name)}<small>Included in the profile price</small></div>
          </div>
        `;
        }
        const detail = customerView
          ? `<small>${money(t.b2c)}</small>`
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
      // The bundle's own flat price, shown once in the header — see rows
      // above, which rely on this instead of a price on every line inside
      // the bundle. Not summed from group.items — a profile's price is
      // its own fixed number now (see data.js `pricing`), never assembled
      // from what it lists.
      const groupB2C = group.pkg.pricing.b2c;
      const calcRows = (group.pkg.calculatedParams || []).map(name => `
        <div class="cart-item cart-item--calc">
          <div class="cart-item__name">${AVM.utils.formatters.highlightAsterisk(esc(name))}<small>Calculated from the tests above</small></div>
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

    // Individually-added tests plus every fixed-price bundle's own flat
    // number, with the ₹100 Minimum Patient Billing floor applied to the
    // combined total — see calculations.js cartTotals().
    const sum = AVM.modules.calculations.cartTotals(items, bundlePkgs);
    // The headline B2B figure is the MPB-adjusted cost (the whole profile's
    // raw total, floored at ₹100), not a raw per-test sum — that's what the
    // partner is actually billed. Per-item rows below still show each
    // test's own raw price.
    elements.b2b.textContent = money(sum.netB2b);
    elements.b2c.textContent = money(sum.b2c);
    // The headline margin is the partner's real bottom line — after MPB,
    // and (if set) after a staff-entered customer discount too: what the
    // customer actually pays, minus the partner's own (MPB-adjusted) cost.
    // The discount only takes effect once it's genuinely lower than the
    // B2C total it would otherwise be based on.
    const discountedPrice = state.discountedPrice;
    const hasCustomerDiscount = discountedPrice != null && discountedPrice > 0 && discountedPrice < sum.b2c;
    const marginBase = hasCustomerDiscount ? discountedPrice : sum.b2c;
    const costBase = sum.netB2b;
    const finalMargin = marginBase - costBase;
    const finalMarginPct = AVM.modules.calculations.marginPercentage(costBase, marginBase);
    elements.margin.textContent = money(finalMargin);
    if (elements.marginPct) elements.marginPct.textContent = (finalMargin >= 0 ? "+" : "") + Math.round(finalMarginPct) + "%";
    if (elements.marginLabel) elements.marginLabel.textContent = hasCustomerDiscount ? "Your Margin (after discount)" : "Your Margin";
    if (elements.marginBox) elements.marginBox.classList.toggle("margin-box--loss", finalMargin < 0);
    updatePriceBox(elements, sum.b2c);
    updateDiscountEditor(elements, customerView, sum.b2c);

    // Minimum Patient Billing: surface it as its own line (not silently
    // folded into B2B Cost above) plus a hint telling the partner exactly
    // how much more this profile needs to clear the ₹100 floor — so adding
    // one more test visibly drops the MPB row instead of just quietly
    // changing the total. Only triggers once a Serum-sample test is in the
    // cart at all (see calculations.js netB2bWithMpb), but once it does, the
    // uplift covers the whole visit's combined total, not just the serum
    // tests' own subtotal.
    if (!customerView) {
      const uplift = sum.netB2b - sum.b2b;
      if (uplift > 0) {
        if (elements.mpbRow) {
          elements.mpbRow.style.display = "";
          if (elements.mpbAmt) elements.mpbAmt.textContent = "+" + money(uplift);
        }
        if (elements.mpbHint) {
          elements.mpbHint.style.display = "";
          elements.mpbHint.textContent = `Add ${money(uplift)} more to clear the ${money(sum.netB2b)} minimum patient billing (Only for Serum Samples)`;
        }
      }
    }
  }

  AVM.modules.profile = {
    persistCart, restoreCart, toggleTest, addPackage, removePackage, isPackageActive,
    removeFromProfile, clearProfile, renderCart, conflictingCodeFor, coveringPackage, blockingPackage, packageOwning,
    setDiscountedPrice, clearDiscountedPrice, groupCartItems,
  };
})();
