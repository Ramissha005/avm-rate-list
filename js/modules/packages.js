window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  // A test's own name often already ends in "(CODE)" (e.g. "Blood Urea
  // Nitrogen (BUN)"); strip that off so the panel breakdown doesn't repeat
  // the code once as its own column and again inside the name.
  function cleanName(test) {
    return test.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  // Compact bundle-chip row — the "start from a common panel" quick-add row
  // on index.html. Each chip toggles: click to add every test in the panel
  // that isn't already in the profile (skipping anything blocked by a
  // conflict); once the whole panel is in, the chip flips to a "✓" state and
  // clicking it again removes the whole panel. Every test inside still stays
  // freely removable one at a time from the cart itself, regardless of this
  // chip's state — this is just a convenient add/remove-all shortcut, not a
  // lock. Hovering (or focusing) a chip shows its full test breakdown.
  function renderPackages(container, packages, onChange) {
    if (!container) return;
    const { byCode } = AVM.data.getCatalog();
    const { money, escapeHtml: esc } = AVM.utils.formatters;
    container.innerHTML = "";
    packages.forEach(pkg => {
      const items = pkg.codes.map(c => byCode[c]).filter(Boolean);
      const sum = AVM.modules.calculations.totals(items);
      const testCount = AVM.modules.calculations.packageTestCount(pkg);
      const isActive = AVM.modules.profile.isPackageActive(pkg);

      const testLines = items.map(t => `<li><span class="bundle-tip__code">${esc(t.code)}</span>${esc(cleanName(t))}<span class="bundle-tip__price">${money(t.b2c)}</span></li>`).join("");
      const calcLines = (pkg.calculatedParams || []).map(name => `<li class="bundle-tip__calc"><em>${esc(name)}</em><span class="bundle-tip__price">included</span></li>`).join("");

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "bundle-chip" + (isActive ? " bundle-chip--active" : "");
      chip.innerHTML = `
        <span class="plus">${isActive ? "✓" : "+"}</span><span class="bundle-chip__name">${esc(pkg.name)}</span><span class="count">${testCount} tests</span>
        <span class="bundle-tip" role="tooltip">
          <span class="bundle-tip__title">${esc(pkg.name)} <span class="bundle-tip__total">B2B ${money(sum.msbB2b)} · B2C ${money(sum.b2c)}</span></span>
          <ul>${testLines}${calcLines}</ul>
        </span>`;
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
      chip.setAttribute("aria-label", `${isActive ? "Remove" : "Add"} ${pkg.name} panel (${testCount} tests)`);
      chip.onclick = () => {
        if (AVM.modules.profile.isPackageActive(pkg)) {
          AVM.modules.profile.removePackage(pkg);
        } else {
          AVM.modules.profile.addPackage(pkg);
        }
        onChange();
      };
      container.appendChild(chip);
    });
  }

  AVM.modules.packages = { renderPackages };
})();
