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
    const { byCode, categoryById, techColors } = AVM.data.getCatalog();
    const { money } = AVM.utils.formatters;

    // One panel is called out as the "main" card — the most comprehensive
    // (most tests) one — so the grid isn't a wall of identical boxes and a
    // shopper has an obvious default to reach for.
    const featuredId = packages.reduce((best, p) => (!best || p.codes.length > best.codes.length ? p : best), null)?.id;

    container.innerHTML = packages.map(pkg => {
      const items = pkg.codes.map(c => byCode[c]).filter(Boolean);
      const categoryLabel = pkg.categoryId && categoryById[pkg.categoryId] ? categoryById[pkg.categoryId].label : "";
      const sum = AVM.modules.calculations.totals(items);
      const isFeatured = pkg.id === featuredId;

      const chips = items.map(t => {
        const col = techColors[t.tech] || { fg: "#101C27", bd: "#D2D5D9", bg: "#EFF0F2" };
        const style = isFeatured
          ? `color:#fff;border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.12)`
          : `color:${col.fg};border-color:${col.bd};background:${col.bg}`;
        return `<li title="${t.name}" style="${style}">${t.code}</li>`;
      }).join("");

      return `
        <div class="package-card${isFeatured ? " package-card--featured" : ""}" data-pkg="${pkg.id}">
          ${isFeatured ? `<span class="package-card__badge">★ Most Comprehensive</span>` : ""}
          <div>
            <p class="package-card__meta">${categoryLabel}</p>
            <h3>${pkg.name}</h3>
          </div>
          <p class="package-card__desc">${pkg.description || ""}</p>
          <ul class="package-card__tests">${chips}</ul>
          <p class="package-card__count">${items.length} test${items.length !== 1 ? "s" : ""} in this panel</p>
          <div class="package-card__price">
            <div><span>B2B</span><b>${money(sum.b2b)}</b></div>
            <div><span>B2C</span><b>${money(sum.b2c)}</b></div>
            <div class="is-profit"><span>Margin</span><b>+${money(sum.margin)}</b></div>
          </div>
          <div class="package-card__actions">
            <button type="button" class="btn ${isFeatured ? "btn--amber" : "btn--teal"} btn--sm" data-add="${pkg.id}">Add All to Profile</button>
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
