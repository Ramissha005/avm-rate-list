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

  // Minimum Patient Billing: whatever a patient's whole profile adds up to
  // — every test and sample combined, not grouped by sample type — the lab
  // still has to draw, process and report on it, so the bill can never come
  // in under ₹100 total. Below that, the patient is simply billed the ₹100
  // floor instead of their raw (lower) total. One floor, checked once per
  // profile — applies identically whether the cost base in play is B2B or
  // Franchise (see `netFranchise` below), just compared against whichever
  // rate is actually being billed.
  const MPB_FLOOR = 100;

  // Floors a raw total at MPB_FLOOR — but only once there's actually
  // something being billed; an empty cart stays ₹0, never bumped to ₹100.
  function mpbFloor(raw) {
    return raw > 0 && raw < MPB_FLOOR ? MPB_FLOOR : raw;
  }

  // `margin`/`marginPercentage`/`b2b` stay raw (pre-MPB) so they still
  // match a straight sum of each item's own numbers — callers that render
  // per-line-item figures alongside a total (Excel columns summed by an
  // actual SUM() formula, the print table's footer row) stay internally
  // consistent with what's printed above them.
  //
  // `netB2b` is the actual billable B2B total: the raw sum, floored once at
  // ₹100 for the whole profile (see `mpbFloor`) — MPB applies once per
  // patient, never per sample type or per test. `netMargin`/
  // `netMarginPercentage` are that same post-MPB figure for callers that
  // want the partner's actual bottom line (cart drawer headline, print
  // summary cards, clipboard copy). `franchiseRaw`/`netFranchise` are the
  // same raw-sum-then-₹100-floor treatment applied to the Franchise rate
  // instead, for the "what would this cost as a franchisee" comparison —
  // falls back to a test's own B2B price when it has no `franchise` rate on
  // file yet, so a not-yet-priced test never invents a saving that isn't
  // backed by real franchise data. Recompute by calling `totals` again
  // after any add/remove — nothing here is cached, so it always reflects
  // the current item list.
  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);
    const franchiseRaw = items.reduce((sum, t) => sum + (t.franchise != null ? t.franchise : t.b2b), 0);

    const netB2b = mpbFloor(b2b);
    // What this same profile costs at the Franchise rate (same ₹100 floor)
    // vs. `netB2b` above, which is what a B2B partner actually pays today.
    // The difference is the real, apples-to-apples "you'd save this much
    // as a franchise" figure for the profile currently in the cart. Floored
    // at 0 so a data gap (a test priced the same or cheaper at B2B than
    // franchise) can never show a negative/nonsense saving.
    const netFranchise = mpbFloor(franchiseRaw);
    const franchiseSavings = Math.max(0, netB2b - netFranchise);
    const franchiseSavingsPercentage = netB2b > 0 ? (franchiseSavings / netB2b) * 100 : 0;

    return {
      b2b, b2c, netB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
      franchiseRaw, netFranchise, franchiseSavings, franchiseSavingsPercentage,
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
  // profile used to be priced. No MPB floor either: that's a per-profile
  // billing rule for individually-priced tests, and doesn't apply to a
  // bundle that's already one flat number.
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

  // The cart's real combined total: individually-added tests plus every
  // fixed-price profile currently in the cart, each contributing its own
  // flat number — then the ₹100 Minimum Patient Billing floor is applied
  // once to that *combined* raw total (not to the individual tests alone),
  // since MPB is about the patient's whole visit, not any one line item.
  // Never double-counts with `individualItems`, since a profile's own tests
  // are never added there in the first place (see profile.js's
  // addPackage). Returns the exact same shape totals() does so every caller
  // downstream (cart drawer, print page, margin/franchise boxes) works
  // unchanged either way.
  function cartTotals(individualItems, bundlePkgs) {
    const rawB2b = individualItems.reduce((sum, t) => sum + t.b2b, 0);
    const rawB2c = individualItems.reduce((sum, t) => sum + t.b2c, 0);
    const rawFranchiseItems = individualItems.reduce((sum, t) => sum + (t.franchise != null ? t.franchise : t.b2b), 0);

    let bundleB2b = 0, bundleB2c = 0, bundleFranchise = 0;
    (bundlePkgs || []).forEach(pkg => {
      const p = pkg.pricing || { b2b: 0, franchise: 0, b2c: 0 };
      bundleB2b += p.b2b;
      bundleB2c += p.b2c;
      bundleFranchise += (p.franchise != null ? p.franchise : p.b2b);
    });

    const b2b = rawB2b + bundleB2b;
    const b2c = rawB2c + bundleB2c;
    const franchiseRaw = rawFranchiseItems + bundleFranchise;

    const netB2b = mpbFloor(b2b);
    const netFranchise = mpbFloor(franchiseRaw);
    const franchiseSavings = Math.max(0, netB2b - netFranchise);

    return {
      b2b, b2c, netB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
      franchiseRaw, netFranchise, franchiseSavings,
      franchiseSavingsPercentage: netB2b > 0 ? (franchiseSavings / netB2b) * 100 : 0,
    };
  }

  AVM.modules.calculations = {
    margin, marginPercentage, totals, packageTestCount, packagePricing, cartTotals,
  };
})();
