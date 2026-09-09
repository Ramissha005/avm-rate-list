window.AVM = window.AVM || {};

(function () {
  const { $ } = AVM.utils.helpers;
  const CONFIG = AVM.CONFIG;

  // Shared by index.html and every page under /pages/ — each page only contains
  // a subset of the markup, so every lookup below is guarded and simply no-ops
  // on pages that don't have that element.
  async function init() {
    const catalog = await AVM.data.loadCatalog();
    AVM.modules.profile.restoreCart();

    if ($("statTests")) $("statTests").textContent = catalog.standaloneTests.length;
    if ($("statTech")) $("statTech").textContent = catalog.technologies.length;
    if ($("statPackages")) $("statPackages").textContent = catalog.packages.length;

    const hasRateList = !!$("rlBody");
    const tableElements = hasRateList ? {
      body: $("rlBody"),
      count: $("rlCount"),
      paginationWrap: $("paginationWrap"),
      searchInput: $("searchInput"),
      sortSelect: $("sortSelect"),
    } : null;

    // Individual Tests / Profiles switch above the homepage rate list —
    // reads which button carries .active straight off the DOM.
    function rateListView() {
      const toggle = $("rateListViewToggle");
      if (!toggle) return "tests";
      const active = toggle.querySelector(".fr-view-toggle__btn.active");
      return (active && active.dataset.view) || "tests";
    }

    const hasCart = !!$("cartBody");
    const cartElements = hasCart ? {
      body: $("cartBody"), badge: $("cartBadge"), sub: $("cartSub"), cartBtn: $("openCart"),
      b2b: $("cartB2B"), b2c: $("cartB2C"), margin: $("cartMargin"), marginPct: $("cartMarginPct"),
      b2bRow: $("cartB2BRow"), marginBox: $("marginBox"),
      b2cRow: $("cartB2CRow"), priceBox: $("priceBox"), price: $("cartPrice"),
      priceLabel: $("priceLabel"), priceOriginalRow: $("priceOriginalRow"), priceOriginal: $("priceOriginal"),
      discountMarginRow: $("discountMarginRow"), discountEditor: $("discountEditor"),
      discountInput: $("discountedPriceInput"), discountClear: $("clearDiscountedPrice"), discountWarn: $("discountWarn"),
      discountedRow: $("cartDiscountedRow"), discountedAmt: $("cartDiscountedAmt"),
      marginLabel: $("cartMarginLabel"),
      cartActions: $("cartActions"),
      mpbRow: $("cartMpbRow"), mpbAmt: $("cartMpbAmt"), mpbHint: $("cartMpbHint"),
      onChange: refreshAll,
    } : null;

    function refreshAll() {
      if (hasRateList) {
        const view = rateListView();
        // Filters and page size are Tests-only — hidden while Panels is
        // active (Technology doesn't map cleanly to a panel that can span
        // mixed technologies, and the panel list is short enough to show
        // in full with no pagination), and the two header rows swap so a
        // panel's "Panel" + test-count columns show instead of a test's
        // Code/Technology/Sample ones. Sort stays available in both views —
        // the same options (Default/Name/B2B/B2C/Margin) apply just as well
        // to a panel's aggregate totals as to a single test's (see
        // panels-table.js's own sorter map).
        if ($("rlHeadTests")) $("rlHeadTests").style.display = view === "profiles" ? "none" : "";
        if ($("rlHeadPanels")) $("rlHeadPanels").style.display = view === "profiles" ? "" : "none";
        if ($("filtersToggleBtn")) $("filtersToggleBtn").style.display = view === "profiles" ? "none" : "";
        if ($("pageSizeWrap")) $("pageSizeWrap").style.display = view === "profiles" ? "none" : "";
        if (view === "profiles") {
          AVM.modules.panelsTable.renderPanelsTable({ packages: catalog.packages, elements: tableElements, onChange: refreshAll });
        } else {
          AVM.modules.rateList.renderTable({ tests: catalog.standaloneTests, techColors: catalog.techColors, elements: tableElements, onChange: refreshAll });
        }
      }
      if (hasCart) {
        AVM.modules.profile.renderCart(cartElements);
      }
      updateFiltersBadge();
    }

    // Little count badge on the Filters toggle button — how many chips are
    // active across every facet, so a partner can tell filters are applied
    // even while the panel itself is collapsed.
    function updateFiltersBadge() {
      const countEl = $("filtersActiveCount");
      if (!countEl) return;
      const count = Object.values(AVM.state.activeFilters).reduce((sum, set) => sum + set.size, 0);
      countEl.hidden = count === 0;
      countEl.textContent = count;
    }

    function renderFilterGroups() {
      if ($("filterTech")) {
        AVM.modules.filters.renderFilterGroup({
          container: $("filterTech"), facetKey: "technology",
          options: catalog.technologies.map(t => ({ id: t.label, label: t.label })),
          onChange: refreshAll,
        });
      }
      if ($("filterPrice")) {
        AVM.modules.filters.renderFilterGroup({
          container: $("filterPrice"), facetKey: "priceBand",
          options: CONFIG.PRICE_BANDS.map(b => ({ id: b.id, label: b.label })),
          onChange: refreshAll,
          singleSelect: true,
        });
      }
    }
    renderFilterGroups();

    AVM.modules.search.wireSearch($("searchInput"), { onChange: refreshAll });
    AVM.modules.sorting.wireSort($("sortSelect"), { onChange: refreshAll });
    AVM.modules.pagination.wirePageSize($("pageSizeSelect"), { onChange: refreshAll });
    // Individual Tests / Profiles switch — wired once here rather
    // than re-bound every render since the buttons themselves never
    // change, only which one carries .active (read straight back off the
    // DOM by whichever module owns that table's rendering — rate-list.js/
    // panels-table.js via rateListView() above).
    //
    // Switching to Profiles also resets the Technology filter and Sort
    // choice: the Technology filter chips (and the Filters button that
    // reveals them) are hidden entirely while Profiles is showing, so a
    // filter left active from Tests would otherwise keep silently
    // narrowing (or emptying) the Profiles list with no visible way to
    // see why or clear it. Sort resets alongside it for the same "each
    // tab starts from a clean, predictable state" reasoning, even though
    // the two tabs' sorters happen to share matching option values today.
    function wireViewToggle(id) {
      const toggle = $(id);
      if (!toggle) return;
      toggle.querySelectorAll(".fr-view-toggle__btn").forEach(btn => {
        btn.onclick = () => {
          toggle.querySelectorAll(".fr-view-toggle__btn").forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-pressed", "false");
          });
          btn.classList.add("active");
          btn.setAttribute("aria-pressed", "true");
          AVM.state.currentPage = 1;
          if (btn.dataset.view === "profiles") {
            AVM.state.activeFilters.technology.clear();
            renderFilterGroups();
            if ($("sortSelect")) {
              $("sortSelect").value = $("sortSelect").options[0] ? $("sortSelect").options[0].value : "";
              delete $("sortSelect").dataset.userSet;
            }
            AVM.state.sortMode = "sr";
          }
          refreshAll();
        };
      });
    }
    wireViewToggle("rateListViewToggle");
    AVM.modules.testDetail.wireTestDetailDrawer();

    if ($("clearFilters")) {
      $("clearFilters").onclick = () => {
        AVM.modules.filters.clearAllFilters();
        if ($("searchInput")) $("searchInput").value = "";
        renderFilterGroups();
        refreshAll();
      };
    }

    // Filters start collapsed (see the `hidden` attribute in index.html) so
    // the rate list opens straight into results, on mobile same as desktop
    // — the toggle button is what reveals Technology/Price.
    if ($("filtersToggleBtn") && $("filtersPanel")) {
      $("filtersToggleBtn").onclick = () => {
        const panel = $("filtersPanel");
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        $("filtersToggleBtn").setAttribute("aria-expanded", String(willOpen));
      };
    }

    refreshAll();
    AVM.app = AVM.app || {};
    AVM.app.refreshAll = refreshAll;

    // drawers (cart + test detail) share the same open/close pattern
    wireDrawer($("cartDrawer"), $("cartOverlay"), $("openCart"), $("closeCart"));
    wireDrawer($("testDetailDrawer"), $("testDetailOverlay"), null, null);

    if ($("clearCart")) $("clearCart").onclick = () => { AVM.modules.profile.clearProfile(); refreshAll(); };
    if ($("customerViewToggle")) {
      $("customerViewToggle").checked = AVM.state.customerView;
      if ($("customerViewLabel")) $("customerViewLabel").classList.toggle("customer-view-toggle--active", AVM.state.customerView);
      $("customerViewToggle").onchange = (e) => {
        AVM.state.customerView = e.target.checked;
        if ($("customerViewLabel")) $("customerViewLabel").classList.toggle("customer-view-toggle--active", e.target.checked);
        refreshAll();
      };
    }
    if ($("discountedPriceInput")) {
      $("discountedPriceInput").oninput = (e) => {
        const applied = AVM.modules.profile.setDiscountedPrice(e.target.value);
        // Typing past the profile's B2C total gets capped in state — snap
        // the field itself back to what was actually applied so it never
        // shows a number bigger than what's actually in effect.
        if (applied != null && Number(e.target.value) > applied) e.target.value = applied;
        refreshAll();
      };
      // The field defaults to showing the plain B2C total (see
      // updateDiscountEditor) rather than starting blank — without this,
      // clicking in and typing a new number *inserts* digits into that
      // pre-filled value instead of replacing it (e.g. "800" + typing "5"
      // -> "8005"), which gets clamped to exactly the B2C total and trips
      // the "should be lower" warning on what looked like a normal edit.
      // Selecting the existing text on focus makes a plain click-and-type
      // overwrite it, the way a pre-filled field is expected to behave.
      $("discountedPriceInput").onfocus = (e) => e.target.select();
    }
    if ($("clearDiscountedPrice")) {
      $("clearDiscountedPrice").onclick = () => {
        AVM.modules.profile.clearDiscountedPrice();
        refreshAll();
      };
    }
    if ($("copyList")) $("copyList").onclick = AVM.modules.exportProfile.copyProfileToClipboard;
    if ($("printList")) $("printList").onclick = AVM.modules.print.openPrintProfile;
    if ($("exportProfileCsv")) $("exportProfileCsv").onclick = AVM.modules.exportProfile.exportProfileCSV;
    // Exports whichever table is actually showing — Tests view exported
    // one row per test same as always, but Profiles view used to fall
    // through to this same tests export regardless (silently exporting
    // the Tests data, or "Nothing to export" if the current search/filter
    // happened to match no tests) since this button was hardwired to
    // exportRateListCSV. Routes to exportPanelsCSV instead when Profiles
    // is the active tab.
    if ($("exportRateListCsv")) {
      $("exportRateListCsv").onclick = () => {
        if (rateListView() === "profiles") {
          AVM.modules.exportProfile.exportPanelsCSV(AVM.modules.panelsTable.getFiltered(catalog.packages));
        } else {
          AVM.modules.exportProfile.exportRateListCSV(AVM.modules.rateList.getFiltered(catalog.standaloneTests));
        }
      };
    }

    // Close the mobile hamburger dropdown after tapping one of its links —
    // the CSS-only checkbox toggle has no way to react to in-page navigation
    // on its own, so without this the drawer stays open over the section
    // the anchor just scrolled to.
    const navToggle = $("navToggle");
    if (navToggle) {
      document.querySelectorAll(".nav__links a").forEach(a => {
        a.addEventListener("click", () => { navToggle.checked = false; });
      });
    }

    // hero requisition-slip reveal (index.html only)
    if ($("heroSlip")) {
      window.addEventListener("load", () => {
        setTimeout(() => {
          document.querySelectorAll("#heroSlip .slip__rows li").forEach(li => li.classList.add("is-live"));
        }, 300);
      });
    }
  }

  function wireDrawer(drawer, overlay, openBtn, closeBtn) {
    if (!drawer || !overlay) return;
    const open = () => { drawer.classList.add("open"); overlay.classList.add("open"); };
    const close = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); };
    if (openBtn) openBtn.onclick = open;
    if (closeBtn) closeBtn.onclick = close;
    overlay.onclick = close;
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  }

  init();
})();
