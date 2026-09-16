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

  // Minimum Patient Billing only kicks in when a Serum sample is actually
  // being drawn: that's the tube the ₹100 floor is protecting, since a
  // visit with no serum draw at all shouldn't be bumped up on its account.
  // Once at least one Serum-sample test is in the mix, though, the floor
  // covers the patient's *whole* combined bill for that visit — every
  // sample type together, not just the serum tests' own subtotal — since
  // it's a single blood draw covering the whole order, not per sample type.
  // A visit with zero Serum-sample tests is billed at its raw total, however
  // low, with no floor at all.
  const MPB_FLOOR = 100;

  function isSerumSample(test) {
    return test.sampleId === "serum";
  }

  // Floors a raw total at MPB_FLOOR — but only once there's actually
  // something being billed; an empty cart stays ₹0, never bumped to ₹100.
  function mpbFloor(raw) {
    return raw > 0 && raw < MPB_FLOOR ? MPB_FLOOR : raw;
  }

  // The MPB-adjusted total for a set of items: the raw combined total,
  // floored at ₹100 — but only when at least one item is a Serum sample.
  // No serum test in the set at all means no floor, regardless of how low
  // the raw total is.
  function netB2bWithMpb(items) {
    const raw = items.reduce((sum, t) => sum + t.b2b, 0);
    return items.some(isSerumSample) ? mpbFloor(raw) : raw;
  }

  // `margin`/`marginPercentage`/`b2b` stay raw (pre-MPB) so they still
  // match a straight sum of each item's own numbers — callers that render
  // per-line-item figures alongside a total (Excel columns summed by an
  // actual SUM() formula, the print table's footer row) stay internally
  // consistent with what's printed above them.
  //
  // `netB2b` is the actual billable B2B total: the raw sum, floored once at
  // ₹100 (see `netB2bWithMpb`) — but only when a Serum-sample test is in the
  // list at all; a list with none stays at its raw total. `netMargin`/
  // `netMarginPercentage` are that same post-MPB figure for callers that
  // want the partner's actual bottom line (cart drawer headline, print
  // summary cards, clipboard copy). Recompute by calling `totals` again
  // after any add/remove — nothing here is cached, so it always reflects
  // the current item list.
  function totals(items) {
    const b2b = items.reduce((sum, t) => sum + t.b2b, 0);
    const b2c = items.reduce((sum, t) => sum + t.b2c, 0);
    const netB2b = netB2bWithMpb(items);

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
  // once to the *combined* raw total of the individually-added tests (see
  // `netB2bWithMpb`), but only when at least one of those individually-added
  // tests is a Serum sample; a cart with none stays at its raw total no
  // matter how low. Bundles (already a flat number) always pass through
  // untouched, on top of that. Never double-counts with `individualItems`,
  // since a profile's own tests are never added there in the first place
  // (see profile.js's addPackage). Returns the exact same shape totals()
  // does so every caller downstream (cart drawer, print page, margin box)
  // works unchanged either way.
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
    const netB2b = netB2bWithMpb(individualItems) + bundleB2b;

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
