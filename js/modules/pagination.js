window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  // Changing page swaps every row below the sticky search/filter/sort bar,
  // but the scroll position itself doesn't move — if you'd scrolled down to
  // the bottom of a long page to hit "Next", you land on a new page's rows
  // still scrolled to the bottom, with the new page's own start scrolled
  // out of view above. Scrolling the controls bar back into view puts the
  // new page's first row right underneath it, same as a fresh page load.
  function scrollToListTop() {
    const controls = document.querySelector(".rl-controls");
    if (controls) controls.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function getPageWindow(current, total, size) {
    if (total <= size + 2) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push("…");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("…");
    pages.push(total);
    return pages;
  }

  function renderPagination({ container, totalItems, onChange }) {
    if (!container) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    container.innerHTML = "";
    if (totalPages <= 1) return;

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "page-btn page-btn--nav";
    prevBtn.textContent = "Previous";
    prevBtn.disabled = state.currentPage === 1;
    prevBtn.onclick = () => { state.currentPage -= 1; onChange(); scrollToListTop(); };
    container.appendChild(prevBtn);

    getPageWindow(state.currentPage, totalPages, 5).forEach(p => {
      if (p === "…") {
        const span = document.createElement("span");
        span.className = "page-ellipsis";
        span.textContent = "…";
        container.appendChild(span);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-btn" + (p === state.currentPage ? " active" : "");
      btn.textContent = p;
      btn.onclick = () => { state.currentPage = p; onChange(); scrollToListTop(); };
      container.appendChild(btn);
    });

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "page-btn page-btn--nav";
    nextBtn.textContent = "Next";
    nextBtn.disabled = state.currentPage === totalPages;
    nextBtn.onclick = () => { state.currentPage += 1; onChange(); scrollToListTop(); };
    container.appendChild(nextBtn);
  }

  function wirePageSize(select, { onChange }) {
    if (!select) return;
    select.innerHTML = AVM.CONFIG.AVAILABLE_PAGE_SIZES.map(n =>
      `<option value="${n}" ${n === state.pageSize ? "selected" : ""}>${n} per page</option>`
    ).join("");
    select.addEventListener("change", (e) => {
      const parsed = parseInt(e.target.value, 10);
      // A NaN/zero pageSize would turn totalPages into NaN (renderPagination
      // above), which fails every numeric comparison silently — the clamp
      // never fires and getPageWindow ends up pushing NaN as a page button.
      state.pageSize = Number.isFinite(parsed) && parsed > 0 ? parsed : AVM.CONFIG.DEFAULT_PAGE_SIZE;
      state.currentPage = 1;
      onChange();
      scrollToListTop();
    });
  }

  AVM.modules.pagination = { renderPagination, wirePageSize };
})();
