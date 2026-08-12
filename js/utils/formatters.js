window.AVM = window.AVM || {};
AVM.utils = AVM.utils || {};

(function () {
  const CONFIG = AVM.CONFIG;

  function money(n) {
    return CONFIG.CURRENCY_SYMBOL + n.toLocaleString(CONFIG.CURRENCY_LOCALE);
  }

  function pluralize(count, singular, plural = singular + "s") {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  AVM.utils.formatters = { money, pluralize };
})();
