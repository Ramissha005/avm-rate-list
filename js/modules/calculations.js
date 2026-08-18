window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  function margin(test) {
    return test.b2c - test.b2b;
  }

  function multiplier(test) {
    return (test.b2c / test.b2b).toFixed(1);
  }

  function marginPercentage(b2b, b2c) {
    if (!b2b) return 0;
    return ((b2c - b2b) / b2b) * 100;
  }

  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);
    return { b2b, b2c, margin: b2c - b2b, marginPercentage: marginPercentage(b2b, b2c) };
  }

  // A profile's real test count per the source rate card — its priced codes
  // plus whatever calculated/derived parameters ride along with them for
  // free (e.g. Kidney Profile is 4 priced codes + eGFR + BUN/Creatinine
  // Ratio = 6 "tests", even though only 4 are separately billed).
  function packageTestCount(pkg) {
    return pkg.codes.length + (pkg.calculatedParams ? pkg.calculatedParams.length : 0);
  }

  AVM.modules.calculations = { margin, multiplier, marginPercentage, totals, packageTestCount };
})();
