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

  async function renderPrintPage({ tbody, dateEl, totalB2BEl, totalB2CEl, totalMarginEl }) {
    const codes = AVM.utils.storage.readSession(CONFIG.STORAGE_KEYS.PRINT_PAYLOAD, []);
    const { money } = AVM.utils.formatters;
    await AVM.data.loadCatalog();
    const { byCode } = AVM.data.getCatalog();
    const items = codes.map(c => byCode[c]).filter(Boolean);
    const sum = AVM.modules.calculations.totals(items);

    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-IN");

    tbody.innerHTML = items.map(t => `
      <tr>
        <td>${t.code}</td><td>${t.name}</td><td>${t.tech}</td>
        <td>${money(t.b2b)}</td><td>${money(t.b2c)}</td>
        <td class="profit">+${money(t.b2c - t.b2b)}</td>
      </tr>
    `).join("");

    totalB2BEl.textContent = money(sum.b2b);
    totalB2CEl.textContent = money(sum.b2c);
    totalMarginEl.textContent = "+" + money(sum.margin);

    if (items.length > 0) {
      setTimeout(() => window.print(), 300);
    }
  }

  AVM.modules.print = { openPrintProfile, renderPrintPage };
})();
