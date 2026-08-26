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

  // Same ₹25-per-sample-type minimum billing floor as sampleTypeBilling
  // above, but priced at the Franchise rate instead of B2B — this is what
  // this exact profile would cost billed as a franchisee rather than a
  // regular B2B partner. Falls back to a test's own B2B price when it has
  // no `franchise` rate on file yet, so a not-yet-priced test never
  // invents a saving that isn't backed by real franchise data.
  function sampleTypeBillingFranchise(items) {
    const groups = new Map();
    items.forEach(t => {
      const sampleId = t.sampleId || "unknown";
      if (!groups.has(sampleId)) {
        groups.set(sampleId, { sampleId, tests: [], rawFranchise: 0, billedFranchise: 0 });
      }
      const group = groups.get(sampleId);
      group.tests.push(t);
      group.rawFranchise += (t.franchise != null ? t.franchise : t.b2b);
    });
    groups.forEach(group => {
      group.billedFranchise = group.rawFranchise < MSB_FLOOR ? MSB_FLOOR : group.rawFranchise;
    });
    return groups;
  }

  function msbAdjustedFranchise(items) {
    let total = 0;
    sampleTypeBillingFranchise(items).forEach(group => { total += group.billedFranchise; });
    return total;
  }

  // Which sample-type groups are currently under the ₹25 floor, and how
  // much more B2B value in that same sample type would clear it — the data
  // behind a "add ₹5 more Serum tests to clear the ₹25 minimum" nudge.
  // Groups already at/above ₹25 (no MSB uplift) are omitted entirely.
  function msbShortfalls(items) {
    const shortfalls = [];
    sampleTypeBilling(items).forEach(group => {
      if (group.rawB2b >= MSB_FLOOR) return;
      shortfalls.push({
        sampleId: group.sampleId,
        label: (group.tests[0] && group.tests[0].sample) || group.sampleId,
        rawB2b: group.rawB2b,
        billedB2b: group.billedB2b,
        uplift: group.billedB2b - group.rawB2b,
        remaining: MSB_FLOOR - group.rawB2b,
      });
    });
    return shortfalls;
  }

  // `margin`/`marginPercentage`/`b2b` stay raw (pre-MSB) so they still
  // match a straight sum of each item's own numbers — callers that render
  // per-line-item figures alongside a total (Excel columns summed by an
  // actual SUM() formula, the print table's footer row) stay internally
  // consistent with what's printed above them.
  //
  // `msbB2b` is the actual billable B2B base: tests grouped by sample type,
  // each group floored at ₹25 (see `sampleTypeBilling`) — MSB applies once
  // per sample type, never per test. `netB2b`/`netMargin`/
  // `netMarginPercentage` are that same post-MSB figure for callers that
  // want the partner's actual bottom line (cart drawer headline, print
  // summary cards, clipboard copy) — there's no further bulk-volume
  // discount layered on top of it. Recompute by calling `totals` again
  // after any add/remove — nothing here is cached, so it always reflects
  // the current item list.
  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);
    const msbB2b = msbAdjustedB2b(items);
    const netB2b = msbB2b;

    // What this same profile costs at the Franchise rate (same MSB floor)
    // vs. `netB2b` above, which is what a B2B partner actually pays today.
    // The difference is the real, apples-to-apples "you'd save this much
    // as a franchise" figure for the profile currently in the cart.
    // Floored at 0 so a data gap (a test priced the same or cheaper at B2B
    // than franchise) can never show a negative/nonsense saving.
    const msbFranchise = msbAdjustedFranchise(items);
    const franchiseSavings = Math.max(0, netB2b - msbFranchise);
    const franchiseSavingsPercentage = netB2b > 0 ? (franchiseSavings / netB2b) * 100 : 0;

    return {
      b2b, b2c, msbB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      netB2b,
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
      msbFranchise, franchiseSavings, franchiseSavingsPercentage,
    };
  }

  // A profile's real test count per the source rate card — its priced codes
  // plus whatever calculated/derived parameters ride along with them for
  // free (e.g. Kidney Profile is 4 priced codes + eGFR + BUN/Creatinine
  // Ratio = 6 "tests", even though only 4 are separately billed). A single
  // priced code can itself report more than one result (CBC's one
  // "Hemogram - 6 Part (Diff)" line is 28 reportable parameters, CUA's
  // "Complete Urine Analysis" is 22) — see each test's own paramCount
  // in data.js; tests without one count as 1.
  // Needs the resolved test objects (not just pkg.codes) to read that
  // field, so the caller passes the same `items` it already resolved for
  // totals().
  function packageTestCount(pkg, items) {
    const codeCount = items.reduce((n, t) => n + (t.paramCount || 1), 0);
    return codeCount + (pkg.calculatedParams ? pkg.calculatedParams.length : 0);
  }

  // A profile's own flat price (see each package's `pricing` in data.js) —
  // NOT assembled from its member tests' own B2B/B2C prices the way every
  // profile used to be priced. No MSB floor either: that's a per-sample-
  // type billing rule for individually-priced tests, and doesn't apply to
  // a bundle that's already one flat number.
  function packagePricing(pkg) {
    const p = pkg.pricing || { b2b: 0, franchise: 0, b2c: 0 };
    const franchiseSavings = Math.max(0, p.b2b - p.franchise);
    return {
      b2b: p.b2b, franchise: p.franchise, b2c: p.b2c,
      margin: p.b2c - p.b2b,
      marginPercentage: marginPercentage(p.b2b, p.b2c),
      franchiseSavings,
      franchiseSavingsPercentage: p.b2b > 0 ? (franchiseSavings / p.b2b) * 100 : 0,
    };
  }

  // The cart's real combined total: individually-added tests (summed and
  // MSB-floored exactly like totals() above) PLUS every fixed-price
  // profile currently in the cart, added as its own flat number — a
  // profile bundle isn't subject to MSB (it's already one line, not
  // assembled from per-sample-type groups) and never double-counts with
  // `individualItems`, since a profile's own tests are never added there
  // in the first place (see profile.js's addPackage). Returns the exact
  // same shape totals() does so every caller downstream (cart drawer,
  // print page, margin/franchise boxes) works unchanged either way.
  function cartTotals(individualItems, bundlePkgs) {
    const base = totals(individualItems);
    let bundleB2b = 0, bundleB2c = 0, bundleFranchise = 0;
    (bundlePkgs || []).forEach(pkg => {
      const p = pkg.pricing || { b2b: 0, franchise: 0, b2c: 0 };
      bundleB2b += p.b2b;
      bundleB2c += p.b2c;
      bundleFranchise += (p.franchise != null ? p.franchise : p.b2b);
    });
    const b2b = base.b2b + bundleB2b;
    const b2c = base.b2c + bundleB2c;
    const msbB2b = base.msbB2b + bundleB2b;
    const netB2b = msbB2b;
    const msbFranchise = base.msbFranchise + bundleFranchise;
    const franchiseSavings = Math.max(0, netB2b - msbFranchise);
    return {
      b2b, b2c, msbB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      netB2b,
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
      msbFranchise, franchiseSavings,
      franchiseSavingsPercentage: netB2b > 0 ? (franchiseSavings / netB2b) * 100 : 0,
    };
  }

  AVM.modules.calculations = {
    margin, marginPercentage, totals, packageTestCount, packagePricing, cartTotals,
    sampleTypeBilling, msbAdjustedB2b, msbShortfalls,
    sampleTypeBillingFranchise, msbAdjustedFranchise,
  };
})();
