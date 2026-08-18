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
    const { byCode } = AVM.data.getCatalog();
    const params = AVM.data.getParametersForTest(test.code);
    // A single param with id:null is just the fallback echo of the test's
    // own name (see data.js) — not a real breakdown, so don't show it.
    const hasParamBreakdown = !(params.length === 1 && params[0].id === null);
    const isAdded = AVM.state.cart.has(test.code);
    const conflictCode = !isAdded ? AVM.modules.profile.conflictingCodeFor(test.code) : null;
    const conflictTest = conflictCode ? byCode[conflictCode] : null;

    let btnClass = "btn--teal";
    let btnLabel = "+ Add to Profile";
    let btnDisabled = "";
    let btnNote = "";
    if (isAdded) {
      btnClass = "btn--outline";
      btnLabel = "✓ Added to Profile";
    } else if (conflictTest) {
      btnClass = "btn--outline";
      btnLabel = "Blocked — conflicts with " + conflictTest.name;
      btnDisabled = "disabled";
      btnNote = `<p class="td-note">Already covered by ${conflictTest.name} in your profile. Remove it first to add this instead.</p>`;
    }

    const fastingLabel = test.fastingRequired === true ? "Yes"
      : test.fastingRequired === false ? "No"
      : "Not specified";

    container.innerHTML = `
      <div class="td-head">
        <span class="cell-code">${test.code}</span>
        <h2>${test.name}</h2>
        <div class="td-tags">
          <span class="tech-pill">${test.tech}</span>
        </div>
      </div>
      <dl class="td-facts">
        <div><dt>Sample</dt><dd>${test.sample}</dd></div>
        <div><dt>Fasting required</dt><dd>${fastingLabel}</dd></div>
        <div><dt>Turnaround time</dt><dd>${test.tat || "To be confirmed"}</dd></div>
      </dl>
      <div class="td-pricing">
        <div><span>B2B Cost</span><b>${money(test.b2b)}</b></div>
        <div><span>B2C Value</span><b>${money(test.b2c)}</b></div>
        <div class="is-profit"><span>Margin</span><b>+${money(margin(test))} <small>(${multiplier(test)}×)</small></b></div>
      </div>
      ${hasParamBreakdown ? `
      <div class="td-params">
        <h3>Parameters</h3>
        <ul>${params.map(p => `<li>${p.name}${p.unit ? ` <small>${p.unit}</small>` : ""}</li>`).join("")}</ul>
      </div>` : ""}
      ${btnNote}
      <button type="button" class="btn ${btnClass} td-add-btn" id="tdAddBtn" ${btnDisabled}>${btnLabel}</button>
    `;

    container.querySelector("#tdAddBtn").onclick = () => {
      if (conflictTest) return;
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
