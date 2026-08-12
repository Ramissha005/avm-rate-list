window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  function renderTestDetail(container, test, onChange) {
    if (!container) return;
    if (!test) {
      container.innerHTML = `<div class="td-empty">Test not found.</div>`;
      return;
    }

    const { money } = AVM.utils.formatters;
    const { margin, multiplier } = AVM.modules.calculations;
    const params = AVM.data.getParametersForTest(test.code);
    const isAdded = AVM.state.cart.has(test.code);

    const fastingLabel = test.fastingRequired === true ? "Yes"
      : test.fastingRequired === false ? "No"
      : "Not specified";

    container.innerHTML = `
      <div class="td-head">
        <span class="cell-code">${test.code}</span>
        <h2>${test.name}</h2>
        <div class="td-tags">
          <span class="tech-pill">${test.tech}</span>
          ${test.category ? `<span class="tech-pill">${test.category}</span>` : ""}
        </div>
      </div>
      <dl class="td-facts">
        <div><dt>Sample</dt><dd>${test.sample}</dd></div>
        <div><dt>Department</dt><dd>${test.department || "—"}</dd></div>
        <div><dt>Fasting required</dt><dd>${fastingLabel}</dd></div>
        <div><dt>Home collection</dt><dd>${test.homeCollection ? "Available on request" : "—"}</dd></div>
        <div><dt>Report type</dt><dd>${test.reportType || "—"}</dd></div>
        <div><dt>Turnaround time</dt><dd>${test.tat || "To be confirmed"}</dd></div>
      </dl>
      <div class="td-pricing">
        <div><span>B2B Cost</span><b>${money(test.b2b)}</b></div>
        <div><span>B2C Value</span><b>${money(test.b2c)}</b></div>
        <div class="is-profit"><span>Margin</span><b>+${money(margin(test))} <small>(${multiplier(test)}×)</small></b></div>
      </div>
      <div class="td-params">
        <h3>Parameters</h3>
        <ul>${params.map(p => `<li>${p.name}${p.unit ? ` <small>${p.unit}</small>` : ""}</li>`).join("")}</ul>
      </div>
      <button type="button" class="btn ${isAdded ? "btn--outline" : "btn--teal"} td-add-btn" id="tdAddBtn">${isAdded ? "✓ Added to Profile" : "+ Add to Profile"}</button>
    `;

    container.querySelector("#tdAddBtn").onclick = () => {
      AVM.modules.profile.toggleTest(test.code);
      if (onChange) onChange();
      renderTestDetail(container, AVM.data.getTestByCode(test.code), onChange);
    };
  }

  function openTestDetail(code, onChange) {
    const test = AVM.data.getTestByCode(code);
    const drawer = document.getElementById("testDetailDrawer");
    const overlay = document.getElementById("testDetailOverlay");
    const body = document.getElementById("testDetailBody");
    if (!drawer || !overlay || !body) return;
    renderTestDetail(body, test, onChange);
    drawer.classList.add("open");
    overlay.classList.add("open");
  }

  function closeTestDetail() {
    const drawer = document.getElementById("testDetailDrawer");
    const overlay = document.getElementById("testDetailOverlay");
    if (drawer) drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
  }

  function wireTestDetailDrawer() {
    const closeBtn = document.getElementById("closeTestDetail");
    const overlay = document.getElementById("testDetailOverlay");
    if (closeBtn) closeBtn.onclick = closeTestDetail;
    if (overlay) overlay.onclick = closeTestDetail;
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeTestDetail(); });
  }

  AVM.modules.testDetail = { renderTestDetail, openTestDetail, closeTestDetail, wireTestDetailDrawer };
})();
