window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;
  const CONFIG = AVM.CONFIG;

  function persistCart() {
    AVM.utils.storage.writeJSON(CONFIG.STORAGE_KEYS.PROFILE, [...state.cart]);
  }

  function restoreCart() {
    const saved = AVM.utils.storage.readJSON(CONFIG.STORAGE_KEYS.PROFILE, []);
    state.cart = new Set(saved);
  }

  function toggleTest(code) {
    const { byCode } = AVM.data.getCatalog();
    const test = byCode[code];
    if (!test) return;
    if (state.cart.has(code)) {
      state.cart.delete(code);
      AVM.utils.helpers.showToast(`Removed ${test.name} from your profile`);
    } else {
      state.cart.add(code);
      AVM.utils.helpers.showToast(`Added ${test.name} to your profile`);
    }
    persistCart();
  }

  function addPackage(pkg) {
    const { byCode } = AVM.data.getCatalog();
    let added = 0;
    pkg.codes.forEach(code => {
      if (byCode[code] && !state.cart.has(code)) {
        state.cart.add(code);
        added++;
      }
    });
    persistCart();
    AVM.utils.helpers.showToast(added > 0
      ? `Added ${pkg.name} (${added} test${added > 1 ? "s" : ""}) to your profile`
      : `${pkg.name} is already in your profile`);
    return added;
  }

  function removeFromProfile(code) {
    state.cart.delete(code);
    persistCart();
  }

  function clearProfile() {
    state.cart.clear();
    persistCart();
    AVM.utils.helpers.showToast("Profile cleared");
  }

  function renderCart(elements) {
    const { byCode } = AVM.data.getCatalog();
    const { money } = AVM.utils.formatters;
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);

    elements.badge.textContent = items.length;
    elements.sub.textContent = `${items.length} test${items.length !== 1 ? "s" : ""} selected`;

    if (items.length === 0) {
      elements.body.innerHTML = `<p class="cart-empty">Your profile is empty. Add tests from the rate list or start from a panel.</p>`;
      elements.b2b.textContent = money(0);
      elements.b2c.textContent = money(0);
      elements.margin.textContent = money(0);
      return;
    }

    elements.body.innerHTML = items.map(t => `
      <div class="cart-item">
        <div class="cart-item__name">${t.name}<small>${t.code} · B2B ${money(t.b2b)} · B2C ${money(t.b2c)}</small></div>
        <div class="cart-item__margin">+${money(t.b2c - t.b2b)}</div>
        <button class="cart-item__remove" data-code="${t.code}" aria-label="Remove ${t.name}">✕</button>
      </div>
    `).join("");

    elements.body.querySelectorAll(".cart-item__remove").forEach(btn => {
      btn.onclick = () => {
        removeFromProfile(btn.dataset.code);
        elements.onChange();
      };
    });

    const sum = AVM.modules.calculations.totals(items);
    elements.b2b.textContent = money(sum.b2b);
    elements.b2c.textContent = money(sum.b2c);
    elements.margin.textContent = money(sum.margin);
  }

  AVM.modules.profile = { persistCart, restoreCart, toggleTest, addPackage, removeFromProfile, clearProfile, renderCart };
})();
