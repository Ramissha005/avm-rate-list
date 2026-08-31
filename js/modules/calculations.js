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
  // profile.
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
  // summary cards, clipboard copy). Recompute by calling `totals` again
  // after any add/remove — nothing here is cached, so it always reflects
  // the current item list.
  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);
    const netB2b = mpbFloor(b2b);

    return {
      b2b, b2c, netB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
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
    const p = pkg.pricing || { b2b: 0, b2c: 0 };
    return {
      b2b: p.b2b, b2c: p.b2c,
      margin: p.b2c - p.b2b,
      marginPercentage: marginPercentage(p.b2b, p.b2c),
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
  // downstream (cart drawer, print page, margin box) works unchanged
  // either way.
  function cartTotals(individualItems, bundlePkgs) {
    const rawB2b = individualItems.reduce((sum, t) => sum + t.b2b, 0);
    const rawB2c = individualItems.reduce((sum, t) => sum + t.b2c, 0);

    let bundleB2b = 0, bundleB2c = 0;
    (bundlePkgs || []).forEach(pkg => {
      const p = pkg.pricing || { b2b: 0, b2c: 0 };
      bundleB2b += p.b2b;
      bundleB2c += p.b2c;
    });

    const b2b = rawB2b + bundleB2b;
    const b2c = rawB2c + bundleB2c;
    const netB2b = mpbFloor(b2b);

    return {
      b2b, b2c, netB2b,
      margin: b2c - b2b,
      marginPercentage: marginPercentage(b2b, b2c),
      netMargin: b2c - netB2b,
      netMarginPercentage: marginPercentage(netB2b, b2c),
    };
  }

  AVM.modules.calculations = {
    margin, marginPercentage, totals, packageTestCount, packagePricing, cartTotals,
  };
})();
