window.AVM = window.AVM || {};

(function () {
  const { $ } = AVM.utils.helpers;
  const CONFIG = AVM.CONFIG;

  // Shared by index.html and every page under /pages/ — each page only contains
  // a subset of the markup, so every lookup below is guarded and simply no-ops
  // on pages that don't have that element.
  async function init() {
    const catalog = await AVM.data.loadCatalog();

    if ($("statTests")) $("statTests").textContent = catalog.standaloneTests.length;
    if ($("statTech")) $("statTech").textContent = catalog.technologies.length;

    const hasRateList = !!$("rlBody");
    const tableElements = hasRateList ? {
      body: $("rlBody"),
      count: $("rlCount"),
      paginationWrap: $("paginationWrap"),
      searchInput: $("searchInput"),
      sortSelect: $("sortSelect"),
    } : null;

    function refreshAll() {
      if (hasRateList) {
        AVM.modules.rateList.renderTable({ tests: catalog.standaloneTests, techColors: catalog.techColors, elements: tableElements, onChange: refreshAll });
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

    // .fr-sticky-controls and .rl-head each stack below whatever's already
    // pinned above them (site header, then the search/filter/sort bar),
    // which position:sticky can only do with a real `top` pixel value, not
    // "right below the other sticky thing". Measuring both bars' actual
    // rendered height here — instead of hardcoding the offset in CSS —
    // keeps this from drifting out of sync every time either bar's own
    // content changes height (see layout.css's --fr-sticky-top/
    // --rl-head-top custom properties, and their fallback values for the
    // instant before this runs).
    function syncStickyOffsets() {
      const header = document.querySelector(".site-header");
      const controls = document.querySelector(".fr-sticky-controls");
      if (!header || !controls) return;
      const headerH = header.offsetHeight;
      const controlsH = controls.offsetHeight;
      document.documentElement.style.setProperty("--fr-sticky-top", `${headerH}px`);
      document.documentElement.style.setProperty("--rl-head-top", `${headerH + controlsH}px`);
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

    if (hasRateList) {
      syncStickyOffsets();
      // Fonts finishing their swap-in can nudge the header/controls a few
      // px taller right after first paint — one more measurement once
      // they're actually ready catches that; a no-op if the browser
      // doesn't support the Font Loading API.
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncStickyOffsets);
      let resizeTimer;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(syncStickyOffsets, 120);
      });
    }

    wireDrawer($("testDetailDrawer"), $("testDetailOverlay"), null, null);

    if ($("exportRateListCsv")) {
      $("exportRateListCsv").onclick = () => {
        AVM.modules.exportRateList.exportRateListCSV(AVM.modules.rateList.getFiltered(catalog.standaloneTests));
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
