window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  // Compact bundle-chip row — used on index.html and profile-builder.html
  function renderPackages(container, packages, onChange) {
    if (!container) return;
    container.innerHTML = "";
    packages.forEach(pkg => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "bundle-chip";
      chip.innerHTML = `<span class="plus">+</span>${pkg.name}<span class="count">${pkg.codes.length} tests</span>`;
      chip.onclick = () => {
        AVM.modules.profile.addPackage(pkg);
        onChange();
      };
      container.appendChild(chip);
    });
  }

  // Full package gallery cards — used on pages/packages.html
  function renderPackageCards(container, packages, onChange) {
    if (!container) return;
    const { byCode, categoryById } = AVM.data.getCatalog();

    container.innerHTML = packages.map(pkg => {
      const items = pkg.codes.map(c => byCode[c]).filter(Boolean);
      const categoryLabel = pkg.categoryId && categoryById[pkg.categoryId] ? categoryById[pkg.categoryId].label : "";
      return `
        <div class="package-card" data-pkg="${pkg.id}">
          <div>
            <p class="package-card__meta">${categoryLabel}</p>
            <h3>${pkg.name}</h3>
          </div>
          <p class="package-card__desc">${pkg.description || ""}</p>
          <ul class="package-card__tests">${items.map(t => `<li>${t.name} <small>${t.code}</small></li>`).join("")}</ul>
          <p class="package-card__meta">${items.length} test${items.length !== 1 ? "s" : ""}</p>
          <div class="package-card__actions">
            <button type="button" class="btn btn--outline btn--sm" data-add="${pkg.id}">Add All to Profile</button>
          </div>
        </div>`;
    }).join("");

    container.querySelectorAll("[data-add]").forEach(btn => {
      btn.onclick = () => {
        const pkg = packages.find(p => p.id === btn.dataset.add);
        if (pkg) {
          AVM.modules.profile.addPackage(pkg);
          onChange();
        }
      };
    });
  }

  AVM.modules.packages = { renderPackages, renderPackageCards };
})();
