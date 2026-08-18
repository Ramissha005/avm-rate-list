window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  function today() {
    return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function copyProfileToClipboard() {
    const { byCode } = AVM.data.getCatalog();
    const { money } = AVM.utils.formatters;
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    if (items.length === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    const customerView = state.customerView;

    const lines = items.map(t => customerView
      ? `${t.name} (${t.code}) — B2C ${money(t.b2c)}`
      : `${t.name} (${t.code}) — B2B ${money(t.b2b)} · B2C ${money(t.b2c)} · Margin +${money(t.b2c - t.b2b)}`);
    const sum = AVM.modules.calculations.totals(items);
    const discountLines = sum.discountRate > 0
      ? `\nBulk Discount (${Math.round(sum.discountRate * 100)}%): −${money(sum.discountAmount)}\nNet B2B Payable: ${money(sum.netB2b)}`
      : "";
    const text = `AVMLabs — My Profile\n\n` + lines.join("\n") +
      (customerView ? `\n\nB2C Value: ${money(sum.b2c)}` : `\n\nB2B Cost: ${money(sum.b2b)}${discountLines}\nB2C Value: ${money(sum.b2c)}\nMargin: ${money(sum.netMargin)}`);

    navigator.clipboard?.writeText(text)
      .then(() => AVM.utils.helpers.showToast(customerView ? "Customer copy copied to clipboard" : "Profile copied to clipboard"))
      .catch(() => AVM.utils.helpers.showToast("Couldn't copy — select and copy manually"));
  }

  function exportProfileCSV() {
    const { byCode } = AVM.data.getCatalog();
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    if (items.length === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    const customerView = state.customerView;
    const sum = AVM.modules.calculations.totals(items);
    const pricingColumns = customerView
      ? [{ header: "B2C", key: "b2c", type: "currency", width: 12 }]
      : [
          { header: "B2B", key: "b2b", type: "currency", width: 12 },
          { header: "B2C", key: "b2c", type: "currency", width: 12 },
          { header: "Margin", key: "margin", type: "margin", width: 12 },
        ];
    // The B2B/Margin columns below stay raw (each row summed by an actual
    // Excel formula), so a discounted total can't be dropped into those
    // footer cells without them disagreeing with their own SUM() once Excel
    // recalculates. The bulk discount and net payable figure go in the
    // subtitle instead, as a plain note alongside the raw column totals.
    const discountNote = !customerView && sum.discountRate > 0
      ? ` · Bulk Discount ${Math.round(sum.discountRate * 100)}% (−${AVM.utils.formatters.money(sum.discountAmount)}) → Net B2B ${AVM.utils.formatters.money(sum.netB2b)}`
      : "";
    AVM.utils.xlsx.downloadWorkbook({
      filename: customerView ? "avmlabs-profile-customer-copy.xlsx" : "avmlabs-profile.xlsx",
      sheetName: "My Profile",
      title: customerView ? "AVMLabs — My Profile (Customer Copy)" : "AVMLabs — My Profile",
      subtitle: `Generated ${today()} · ${items.length} test${items.length === 1 ? "" : "s"}${discountNote}`,
      columns: [
        { header: "Code", key: "code", type: "text", width: 12 },
        { header: "Test", key: "name", type: "text", width: 36 },
        { header: "Technology", key: "tech", type: "text", width: 20 },
        { header: "Sample", key: "sample", type: "text", width: 12 },
        ...pricingColumns,
      ],
      rows: items.map(t => ({ code: t.code, name: t.name, tech: t.tech, sample: t.sample, b2b: t.b2b, b2c: t.b2c, margin: t.b2c - t.b2b })),
      totals: customerView ? { b2c: sum.b2c } : { b2b: sum.b2b, b2c: sum.b2c, margin: sum.margin },
    });
    AVM.utils.helpers.showToast(customerView ? "Customer copy exported to Excel" : "Profile exported to Excel");
  }

  function exportRateListCSV(tests) {
    if (!tests || tests.length === 0) {
      AVM.utils.helpers.showToast("Nothing to export");
      return;
    }
    const sum = AVM.modules.calculations.totals(tests);
    AVM.utils.xlsx.downloadWorkbook({
      filename: "avmlabs-rate-list.xlsx",
      sheetName: "Rate List",
      title: "AVMLabs — Rate List",
      subtitle: `Generated ${today()} · ${tests.length} test${tests.length === 1 ? "" : "s"}`,
      columns: [
        { header: "Code", key: "code", type: "text", width: 12 },
        { header: "Test", key: "name", type: "text", width: 36 },
        { header: "Category", key: "category", type: "text", width: 18 },
        { header: "Technology", key: "tech", type: "text", width: 20 },
        { header: "Sample", key: "sample", type: "text", width: 12 },
        { header: "B2B", key: "b2b", type: "currency", width: 12 },
        { header: "B2C", key: "b2c", type: "currency", width: 12 },
        { header: "Margin", key: "margin", type: "margin", width: 12 },
      ],
      rows: tests.map(t => ({ code: t.code, name: t.name, category: t.category || "", tech: t.tech, sample: t.sample, b2b: t.b2b, b2c: t.b2c, margin: t.b2c - t.b2b })),
      totals: { b2b: sum.b2b, b2c: sum.b2c, margin: sum.margin },
    });
    AVM.utils.helpers.showToast("Rate list exported to Excel");
  }

  AVM.modules.exportProfile = { copyProfileToClipboard, exportProfileCSV, exportRateListCSV };
})();
