window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  function renderTestDetail(container, test, onChange) {
    if (!container) return;
    if (!test) {
      container.innerHTML = `<div class="td-empty">Test not found.</div>`;
      return;
    }

    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { margin, marginPercentage } = AVM.modules.calculations;
    const { byCode } = AVM.data.getCatalog();
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
      btnLabel = "Blocked — conflicts with " + esc(conflictTest.name);
      btnDisabled = "disabled";
      btnNote = `<p class="td-note">Already covered by ${esc(conflictTest.name)} in your profile. Remove it first to add this instead.</p>`;
    }

    const fastingLabel = test.fastingRequired === true ? "Yes"
      : test.fastingRequired === false ? "No"
      : "Not specified";

    container.innerHTML = `
      <div class="td-head">
        <span class="cell-code">${esc(test.code)}</span>
        <h2>${esc(test.name)}</h2>
        ${test.aliases && test.aliases.length ? `<p class="td-aliases">(also known as ${esc(test.aliases.join(", "))})</p>` : ""}
        <div class="td-tags">
          <span class="tech-pill">${esc(test.tech)}</span>
        </div>
      </div>
      <dl class="td-facts">
        <div><dt>Sample</dt><dd>${esc(test.sample)}</dd></div>
        <div><dt>Fasting required</dt><dd>${fastingLabel}</dd></div>
        <div><dt>Turnaround time</dt><dd>${esc(test.tat) || "To be confirmed"}</dd></div>
      </dl>
      <div class="td-pricing">
        <div><span>B2B Cost</span><b>${money(test.b2b)}</b></div>
        <div><span>B2C Value</span><b>${money(test.b2c)}</b></div>
        <div class="is-profit"><span>Margin</span><b>+${money(margin(test))} <small>(${test.b2b ? `+${Math.round(marginPercentage(test.b2b, test.b2c))}%` : "—"})</small></b></div>
      </div>
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

  let escHandlerWired = false;
  function wireTestDetailDrawer() {
    const closeBtn = document.getElementById("closeTestDetail");
    const overlay = document.getElementById("testDetailOverlay");
    if (closeBtn) closeBtn.onclick = closeTestDetail;
    if (overlay) overlay.onclick = closeTestDetail;
    // Unlike the two `.onclick =` assignments above (idempotent by nature —
    // reassigning just replaces the handler), addEventListener stacks a new
    // listener on every call. Guard so a defensive/duplicate call to this
    // function can't make Escape close the drawer more than once per press.
    if (!escHandlerWired) {
      document.addEventListener("keydown", e => { if (e.key === "Escape") closeTestDetail(); });
      escHandlerWired = true;
    }
  }

  AVM.modules.testDetail = { renderTestDetail, openTestDetail, closeTestDetail, wireTestDetailDrawer };
})();
