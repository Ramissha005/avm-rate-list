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
    AVM.utils.storage.writeSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, [...state.cart]);
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

  async function renderPrintPage({
    tbody, dateEl, totalB2BEl, totalB2CEl, totalMarginEl,
    refEl, countEl, sumB2BEl, sumB2CEl, sumMarginEl, sumMarginPctEl,
    contentEl, emptyEl,
  }) {
    const codes = AVM.utils.storage.readSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, []);
    const { money, pluralize } = AVM.utils.formatters;
    await AVM.data.loadCatalog();
    const { byCode } = AVM.data.getCatalog();
    const items = codes.map(c => byCode[c]).filter(Boolean);
    const sum = AVM.modules.calculations.totals(items);

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
        <td class="num">${money(t.b2b)}</td>
        <td class="num">${money(t.b2c)}</td>
        <td class="num profit">+${money(t.b2c - t.b2b)}</td>
      </tr>
    `).join("");

    totalB2BEl.textContent = money(sum.b2b);
    totalB2CEl.textContent = money(sum.b2c);
    totalMarginEl.textContent = "+" + money(sum.margin);
    if (countEl) countEl.textContent = pluralize(items.length, "test");

    if (sumB2BEl) sumB2BEl.textContent = money(sum.b2b);
    if (sumB2CEl) sumB2CEl.textContent = money(sum.b2c);
    if (sumMarginEl) sumMarginEl.textContent = "+" + money(sum.margin);
    if (sumMarginPctEl) sumMarginPctEl.textContent = "+" + Math.round(sum.marginPercentage) + "%";

    afterFontsReady(() => setTimeout(() => window.print(), 150));
  }

  AVM.modules.print = { openPrintProfile, renderPrintPage };
})();
