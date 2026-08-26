window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  // Which tests' parameter breakdowns (see below) are expanded — starts
  // collapsed (heading + count only) so a test with a long panel like
  // CBC's 28 reportable results doesn't turn the drawer into one long
  // scroll by default; click to drop down and see them all. Keyed by
  // test code, mirrors panels-table.js's own `expanded` Set for "Tests
  // included" — not persisted, resets each session.
  const expandedParams = new Set();

  function renderTestDetail(container, test, onChange) {
    if (!container) return;
    if (!test) {
      container.innerHTML = `<div class="td-empty">Test not found.</div>`;
      return;
    }

    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { margin, marginPercentage } = AVM.modules.calculations;
    const { byCode } = AVM.data.getCatalog();
    // Part of a fixed-price profile bundle already in the cart (e.g. via
    // Vitamin Profile) — same blocked treatment as a conflicting test
    // rather than a "✓ Added to Profile" that would look freely removable
    // here but actually just quietly pull it out of that profile (see
    // profile.js's packageOwning/toggleTest).
    const owner = AVM.modules.profile.packageOwning(test.code);
    const isAdded = !owner && AVM.state.cart.has(test.code);
    const conflictCode = !isAdded && !owner ? AVM.modules.profile.conflictingCodeFor(test.code) : null;
    const conflictTest = conflictCode ? byCode[conflictCode] : null;

    let btnClass = "btn--teal";
    let btnLabel = "+ Add to Profile";
    let btnDisabled = "";
    let btnNote = "";
    if (owner) {
      btnClass = "btn--outline";
      btnLabel = "Blocked — already in " + esc(owner.name);
      btnDisabled = "disabled";
      btnNote = `<p class="td-note">Already included in ${esc(owner.name)}. Remove it from there to change it.</p>`;
    } else if (isAdded) {
      btnClass = "btn--outline";
      btnLabel = "✓ Added to Profile";
    } else if (conflictTest) {
      btnClass = "btn--outline";
      btnLabel = "Blocked — conflicts with " + esc(conflictTest.name);
      btnDisabled = "disabled";
      btnNote = `<p class="td-note">Already covered by ${esc(conflictTest.name)} in your profile. Remove it first to add this instead.</p>`;
    }

    // A test that's itself a bundled multi-analyte panel (e.g. CBC's 28
    // reportable results — see js/data.js's PARAMETERS/TEST_PARAMETERS)
    // carries a real named breakdown here; a single-analyte test falls
    // back to one implicit parameter (its own name, id: null — see
    // getParametersForTest), which isn't worth showing as its own section.
    const params = AVM.data.getParametersForTest(test.code);
    const hasBreakdown = params.length > 1 || (params[0] && params[0].id);
    const paramsOpen = expandedParams.has(test.code);
    const paramsSection = hasBreakdown ? `
      <div class="td-params">
        <button type="button" class="td-params__toggle" id="tdParamsToggle" aria-expanded="${paramsOpen}">
          ${paramsOpen ? "▴" : "▾"} ${params.length} parameter${params.length !== 1 ? "s" : ""} reported
        </button>
        ${paramsOpen ? `
        <ul class="td-params__list">
          ${params.map(p => `<li>${esc(p.name)}${p.unit ? `<span class="td-params__unit">${esc(p.unit)}</span>` : ""}</li>`).join("")}
        </ul>` : ""}
      </div>` : "";

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
        <div><dt>Processed At</dt><dd>LPL</dd></div>
      </dl>
      <div class="td-pricing">
        <div><span>B2B Cost</span><b>${money(test.b2b)}</b></div>
        <div><span>B2C Value</span><b>${money(test.b2c)}</b></div>
        <div class="is-profit"><span>Margin</span><b>+${money(margin(test))} <small>(${test.b2b ? `+${Math.round(marginPercentage(test.b2b, test.b2c))}%` : "—"})</small></b></div>
      </div>
      ${paramsSection}
      ${btnNote}
      <button type="button" class="btn ${btnClass} td-add-btn" id="tdAddBtn" ${btnDisabled}>${btnLabel}</button>
    `;

    const paramsToggle = container.querySelector("#tdParamsToggle");
    if (paramsToggle) {
      paramsToggle.onclick = () => {
        if (expandedParams.has(test.code)) expandedParams.delete(test.code);
        else expandedParams.add(test.code);
        renderTestDetail(container, test, onChange);
      };
    }

    container.querySelector("#tdAddBtn").onclick = () => {
      if (conflictTest || owner) return;
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
