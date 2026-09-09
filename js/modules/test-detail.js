window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  // Which tests' parameter breakdowns (see below) are expanded — starts
  // collapsed (heading + count only) so a test with a long panel like
  // CBC's 28 reportable results doesn't turn the drawer into one long
  // scroll by default; click to drop down and see them all. Keyed by
  // test code — not persisted, resets each session.
  const expandedParams = new Set();

  function renderTestDetail(container, test) {
    if (!container) return;
    if (!test) {
      container.innerHTML = `<div class="td-empty">Test not found.</div>`;
      return;
    }

    const { money, escapeHtml: esc } = AVM.utils.formatters;
    const { margin, marginPercentage } = AVM.modules.calculations;

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
        ${test.analyzer ? `<div><dt>Analyzer</dt><dd>${esc(test.analyzer)}</dd></div>` : ""}
      </dl>
      <div class="td-pricing">
        <div><span>A Rates Cost</span><b>${money(test.b2b)}</b></div>
        <div><span>B2C Value</span><b>${money(test.b2c)}</b></div>
        <div class="is-profit"><span>Margin</span><b>+${money(margin(test))} <small>(${test.b2b ? `+${Math.round(marginPercentage(test.b2b, test.b2c))}%` : "—"})</small></b></div>
      </div>
      ${paramsSection}
    `;

    const paramsToggle = container.querySelector("#tdParamsToggle");
    if (paramsToggle) {
      paramsToggle.onclick = () => {
        if (expandedParams.has(test.code)) expandedParams.delete(test.code);
        else expandedParams.add(test.code);
        renderTestDetail(container, test);
      };
    }
  }

  function openTestDetail(code) {
    const test = AVM.data.getTestByCode(code);
    const drawer = document.getElementById("testDetailDrawer");
    const overlay = document.getElementById("testDetailOverlay");
    const body = document.getElementById("testDetailBody");
    if (!drawer || !overlay || !body) return;
    renderTestDetail(body, test);
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
