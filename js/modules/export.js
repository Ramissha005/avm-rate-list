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

    const lines = items.map(t => `${t.name} (${t.code}) — B2B ${money(t.b2b)} · B2C ${money(t.b2c)} · Margin +${money(t.b2c - t.b2b)}`);
    const sum = AVM.modules.calculations.totals(items);
    const text = `AVMLabs — My Custom Profile\n\n` + lines.join("\n") +
      `\n\nB2B Cost: ${money(sum.b2b)}\nB2C Value: ${money(sum.b2c)}\nMargin: ${money(sum.margin)}`;

    navigator.clipboard?.writeText(text)
      .then(() => AVM.utils.helpers.showToast("Profile copied to clipboard"))
      .catch(() => AVM.utils.helpers.showToast("Couldn't copy — select and copy manually"));
  }

  function exportProfileCSV() {
    const { byCode } = AVM.data.getCatalog();
    const items = [...state.cart].map(c => byCode[c]).filter(Boolean);
    if (items.length === 0) {
      AVM.utils.helpers.showToast("Your profile is empty");
      return;
    }
    const sum = AVM.modules.calculations.totals(items);
    AVM.utils.xlsx.downloadWorkbook({
      filename: "avmlabs-profile.xlsx",
      sheetName: "My Profile",
      title: "AVMLabs — My Custom Profile",
      subtitle: `Generated ${today()} · ${items.length} test${items.length === 1 ? "" : "s"}`,
      columns: [
        { header: "Code", key: "code", type: "text", width: 12 },
        { header: "Test", key: "name", type: "text", width: 36 },
        { header: "Technology", key: "tech", type: "text", width: 20 },
        { header: "Sample", key: "sample", type: "text", width: 12 },
        { header: "B2B", key: "b2b", type: "currency", width: 12 },
        { header: "B2C", key: "b2c", type: "currency", width: 12 },
        { header: "Margin", key: "margin", type: "margin", width: 12 },
      ],
      rows: items.map(t => ({ code: t.code, name: t.name, tech: t.tech, sample: t.sample, b2b: t.b2b, b2c: t.b2c, margin: t.b2c - t.b2b })),
      totals: { b2b: sum.b2b, b2c: sum.b2c, margin: sum.margin },
    });
    AVM.utils.helpers.showToast("Profile exported to Excel");
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
