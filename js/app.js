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

    if ($("statTests")) $("statTests").textContent = catalog.tests.length;
    if ($("statTech")) $("statTech").textContent = catalog.technologies.length;
    if ($("statPackages")) $("statPackages").textContent = catalog.packages.length;

    const hasRateList = !!$("rlBody");
    const tableElements = hasRateList ? {
      body: $("rlBody"),
      count: $("rlCount"),
      paginationWrap: $("paginationWrap"),
    } : null;

    const hasCart = !!$("cartBody");
    const cartElements = hasCart ? {
      body: $("cartBody"), badge: $("cartBadge"), sub: $("cartSub"),
      b2b: $("cartB2B"), b2c: $("cartB2C"), margin: $("cartMargin"), marginPct: $("cartMarginPct"),
      b2bRow: $("cartB2BRow"), marginBox: $("marginBox"),
      b2cRow: $("cartB2CRow"), priceBox: $("priceBox"), price: $("cartPrice"),
      discountRow: $("cartDiscountRow"), discountLabel: $("cartDiscountLabel"), discountAmt: $("cartDiscountAmt"),
      netB2bRow: $("cartNetB2BRow"), netB2b: $("cartNetB2B"),
      msbRow: $("cartMsbRow"), msbAmt: $("cartMsbAmt"), msbHint: $("cartMsbHint"),
      onChange: refreshAll,
    } : null;

    function refreshAll() {
      if (hasRateList) {
        AVM.modules.rateList.renderTable({ tests: catalog.tests, techColors: catalog.techColors, elements: tableElements, onChange: refreshAll });
      }
      if (hasCart) {
        AVM.modules.profile.renderCart(cartElements);
      }
      // Bundle chips flip to their "✓ in profile" state once fully added, so
      // they need to re-render on every cart change, not just once at init.
      if ($("bundleRow")) {
        AVM.modules.packages.renderPackages($("bundleRow"), catalog.packages, refreshAll);
      }
    }

    function renderFilterGroups() {
      if ($("filterTech")) {
        AVM.modules.filters.renderFilterGroup({
          container: $("filterTech"), facetKey: "technology",
          options: catalog.technologies.map(t => ({ id: t.label, label: t.label })),
          onChange: refreshAll,
        });
      }
      if ($("filterCategory")) {
        AVM.modules.filters.renderFilterGroup({
          container: $("filterCategory"), facetKey: "category",
          options: catalog.categories.map(c => ({ id: c.id, label: c.label })),
          onChange: refreshAll,
          collapsedCount: 8,
        });
      }
      if ($("filterSample")) {
        AVM.modules.filters.renderFilterGroup({
          container: $("filterSample"), facetKey: "sample",
          options: catalog.samples.map(s => ({ id: s.id, label: s.label })),
          onChange: refreshAll,
        });
      }
      if ($("filterPrice")) {
        AVM.modules.filters.renderFilterGroup({
          container: $("filterPrice"), facetKey: "priceBand",
          options: CONFIG.PRICE_BANDS.map(b => ({ id: b.id, label: b.label })),
          onChange: refreshAll,
        });
      }
    }
    renderFilterGroups();

    AVM.modules.search.wireSearch($("searchInput"), { onChange: refreshAll });
    AVM.modules.sorting.wireSort($("sortSelect"), { onChange: refreshAll });
    AVM.modules.pagination.wirePageSize($("pageSizeSelect"), { onChange: refreshAll });
    AVM.modules.testDetail.wireTestDetailDrawer();

    if ($("clearFilters")) {
      $("clearFilters").onclick = () => {
        AVM.modules.filters.clearAllFilters();
        if ($("searchInput")) $("searchInput").value = "";
        renderFilterGroups();
        refreshAll();
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
    if ($("copyList")) $("copyList").onclick = AVM.modules.exportProfile.copyProfileToClipboard;
    if ($("printList")) $("printList").onclick = AVM.modules.print.openPrintProfile;
    if ($("exportProfileCsv")) $("exportProfileCsv").onclick = AVM.modules.exportProfile.exportProfileCSV;
    if ($("exportRateListCsv")) {
      $("exportRateListCsv").onclick = () => AVM.modules.exportProfile.exportRateListCSV(AVM.modules.rateList.getFiltered(catalog.tests));
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
