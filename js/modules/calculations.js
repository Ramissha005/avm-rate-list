window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  function margin(test) {
    return test.b2c - test.b2b;
  }

  function marginPercentage(b2b, b2c) {
    if (!b2b) return 0;
    return ((b2c - b2b) / b2b) * 100;
  }

  // Rate list totals — summed across whatever set of tests the caller
  // passes (the whole catalog, or a filtered/exported subset). Used by
  // export.js's exportRateListCSV for the workbook's own totals footer.
  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);

    return {
      b2b, b2c,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
    };
  }

  AVM.modules.calculations = {
    margin, marginPercentage, totals,
  };
})();
