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

  // Volume discount on a profile's *combined* B2B cost. No single test's B2B
  // rate comes anywhere near these thresholds (the priciest test is under
  // ₹500), so this only ever triggers once several tests are bundled into
  // one profile/cart. It's a whole-total tier, not a bracketed/marginal one:
  // cross ₹2000 and the *entire* total gets 15% off, not just the slice past
  // ₹2000. Ordered highest-first so the first tier the total clears wins.
  const B2B_DISCOUNT_TIERS = [
    { over: 4000, rate: 0.20 },
    { over: 2000, rate: 0.15 },
    { over: 1000, rate: 0.10 },
  ];

  function b2bDiscountRate(b2bTotal) {
    const tier = B2B_DISCOUNT_TIERS.find(t => b2bTotal > t.over);
    return tier ? tier.rate : 0;
  }

  // Minimum Sample Billing: the lab draws/processes one sample per sample
  // type regardless of how many tests ride on it, so the ₹25 floor applies
  // once per sample type — never per test. Tests are grouped by sampleId,
  // their B2B prices summed per group, and only *that* group total is
  // floored at ₹25. A group with several tests whose combined price already
  // clears ₹25 is billed at its real (higher) total, not bumped to ₹25×N.
  const MSB_FLOOR = 25;

  // Map<sampleId, { sampleId, tests, rawB2b, billedB2b }>
  function sampleTypeBilling(items) {
    const groups = new Map();
    items.forEach(t => {
      const sampleId = t.sampleId || "unknown";
      if (!groups.has(sampleId)) {
        groups.set(sampleId, { sampleId, tests: [], rawB2b: 0, billedB2b: 0 });
      }
      const group = groups.get(sampleId);
      group.tests.push(t);
      group.rawB2b += t.b2b;
    });
    groups.forEach(group => {
      group.billedB2b = group.rawB2b < MSB_FLOOR ? MSB_FLOOR : group.rawB2b;
    });
    return groups;
  }

  function msbAdjustedB2b(items) {
    let total = 0;
    sampleTypeBilling(items).forEach(group => { total += group.billedB2b; });
    return total;
  }

  // `margin`/`marginPercentage`/`b2b` stay raw (pre-MSB, pre-discount) so
  // they still match a straight sum of each item's own numbers — callers
  // that render per-line-item figures alongside a total (Excel columns
  // summed by an actual SUM() formula, the print table's footer row) stay
  // internally consistent with what's printed above them.
  //
  // `msbB2b` is the actual billable B2B base: tests grouped by sample type,
  // each group floored at ₹25 (see `sampleTypeBilling`) — MSB applies once
  // per sample type, never per test. The volume discount tiers then apply
  // to *that* MSB-adjusted total, since that's the partner's real combined
  // cost. `netB2b`/`netMargin`/`netMarginPercentage` are the final
  // post-MSB, post-discount figures for callers that want the partner's
  // actual bottom line (cart drawer headline, print summary cards,
  // clipboard copy). Recompute by calling `totals` again after any
  // add/remove — nothing here is cached, so it always reflects the current
  // item list.
  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);
    const msbB2b = msbAdjustedB2b(items);
    const discountRate = b2bDiscountRate(msbB2b);
    const discountAmount = msbB2b * discountRate;
    const netB2b = msbB2b - discountAmount;
    return {
      b2b, b2c, msbB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      discountRate, discountAmount, netB2b,
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
    };
  }

  // A profile's real test count per the source rate card — its priced codes
  // plus whatever calculated/derived parameters ride along with them for
  // free (e.g. Kidney Profile is 4 priced codes + eGFR + BUN/Creatinine
  // Ratio = 6 "tests", even though only 4 are separately billed).
  function packageTestCount(pkg) {
    return pkg.codes.length + (pkg.calculatedParams ? pkg.calculatedParams.length : 0);
  }

  AVM.modules.calculations = {
    margin, multiplier, marginPercentage, totals, packageTestCount, b2bDiscountRate,
    sampleTypeBilling, msbAdjustedB2b,
  };
})();
