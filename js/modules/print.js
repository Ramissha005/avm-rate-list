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
    });
    // index.html sits at the project root; every page/* file sits one level down —
    // this project has no build step to resolve paths, so branch on where we are.
    const target = location.pathname.includes("/pages/") ? "print-profile.html" : "pages/print-profile.html";
    window.open(target, "_blank");
  }

  // Short human-friendly reference for the printed sheet — not a persisted ID,
  // just something to write on a physical requisition slip.
  function makeRef() {
    return "AVM-" + Date.now().toString(36).toUpperCase();
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
    tbody, dateEl, totalB2BEl, totalB2CEl, totalMarginEl,
    refEl, countEl, sumB2BEl, sumB2CEl, sumMarginEl, sumMarginPctEl,
    sumDiscountCardEl, sumDiscountLabelEl, sumDiscountEl,
    contentEl, emptyEl, sheetEl, titleEl, autoPrint,
  }, customerViewOverride) {
    const money = AVM.utils.formatters.money;
    const pluralize = AVM.utils.formatters.pluralize;

    if (!cachedItems) {
      const saved = AVM.utils.storage.readSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, []);
      const codes = Array.isArray(saved) ? saved : (saved.codes || []);
      await AVM.data.loadCatalog();
      const { byCode } = AVM.data.getCatalog();
      cachedItems = { items: codes.map(c => byCode[c]).filter(Boolean), customerView: Array.isArray(saved) ? false : !!saved.customerView };
    }
    const items = cachedItems.items;
    const customerView = customerViewOverride != null ? customerViewOverride : cachedItems.customerView;
    const sum = AVM.modules.calculations.totals(items);

    if (sheetEl) sheetEl.classList.toggle("customer-view", customerView);
    if (titleEl) titleEl.textContent = customerView ? "Custom Health Profile — Customer Copy" : "Custom Health Profile";

    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    if (refEl) refEl.textContent = makeRef();

    if (items.length === 0) {
      if (contentEl) contentEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    tbody.innerHTML = items.map((t, i) => `
      <tr>
        <td class="sr">${i + 1}</td>
        <td><span class="code">${t.code}</span></td>
        <td class="name">${t.name}</td>
        <td class="tech">${t.tech}</td>
        <td class="sample">${t.sample}</td>
        <td class="num c-b2b">${money(t.b2b)}</td>
        <td class="num">${money(t.b2c)}</td>
        <td class="num profit c-margin">+${money(t.b2c - t.b2b)}</td>
      </tr>
    `).join("");

    // The table's own rows list each test's raw B2B/margin, so its footer
    // total stays raw too (it's a plain sum of what's printed above it).
    // The bulk discount is a whole-profile figure, not a per-test one — it
    // surfaces in the summary cards below instead, alongside the partner's
    // real (post-discount) margin.
    totalB2BEl.textContent = money(sum.b2b);
    totalB2CEl.textContent = money(sum.b2c);
    totalMarginEl.textContent = "+" + money(sum.margin);
    if (countEl) countEl.textContent = pluralize(items.length, "test");

    if (sumB2BEl) sumB2BEl.textContent = money(sum.b2b);
    if (sumB2CEl) sumB2CEl.textContent = money(sum.b2c);
    if (sumMarginEl) sumMarginEl.textContent = "+" + money(sum.netMargin);
    if (sumMarginPctEl) sumMarginPctEl.textContent = "+" + Math.round(sum.netMarginPercentage) + "%";
    if (sumDiscountCardEl) {
      const applies = !customerView && sum.discountRate > 0;
      sumDiscountCardEl.hidden = !applies;
      if (applies) {
        if (sumDiscountLabelEl) sumDiscountLabelEl.textContent = `Bulk Discount (${Math.round(sum.discountRate * 100)}%)`;
        if (sumDiscountEl) sumDiscountEl.textContent = "−" + money(sum.discountAmount);
      }
    }

    if (autoPrint) afterFontsReady(() => setTimeout(() => window.print(), 150));
  }

  AVM.modules.print = { openPrintProfile, renderPrintPage };
})();
