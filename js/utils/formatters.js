window.AVM = window.AVM || {};
AVM.utils = AVM.utils || {};

(function () {
  const CONFIG = AVM.CONFIG;

  // Every render path (rate list, cart, print, exports) builds its whole
  // markup in one .map().join("") and calls this per row — one bad/missing
  // price field used to throw mid-render and blank the entire table, not
  // just that row. "—" signals "no price on file" instead of pretending
  // it's free (₹0) or crashing. Negative amounts (e.g. a bad-data B2C <
  // B2B margin) get a leading "-" instead of "₹-500".
  function money(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    const sign = n < 0 ? "-" : "";
    return sign + CONFIG.CURRENCY_SYMBOL + Math.abs(n).toLocaleString(CONFIG.CURRENCY_LOCALE);
  }

  function pluralize(count, singular, plural = singular + "s") {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  // Every render path (rate list, cart, test detail, print) interpolates
  // catalog text — test names, categories, tech labels, aliases — straight
  // into innerHTML, including inside HTML attributes like aria-label/title
  // (e.g. `aria-label="Add ${t.name}"`). The catalog is hand-edited JSON
  // with no validation, so a stray `"` or `&` in a name/category breaks the
  // attribute (or the row markup) it lands in — this isn't primarily an
  // XSS defense (the catalog is staff-edited, not user-submitted), it's
  // making the render robust against ordinary special characters in real
  // data. Escape at the point of interpolation, not the data itself, so
  // catalog values stay natural (unescaped) everywhere else they're read.
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
  }

  AVM.utils.formatters = { money, pluralize, escapeHtml };
})();
