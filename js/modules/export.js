window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  function today() {
    return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
        { header: "A Rates", key: "b2b", type: "currency", width: 12 },
        { header: "B2C", key: "b2c", type: "currency", width: 12 },
        { header: "Margin", key: "margin", type: "margin", width: 12 },
      ],
      rows: tests.map(t => ({ code: t.code, name: t.name, category: t.category || "", tech: t.tech, sample: t.sample, b2b: t.b2b, b2c: t.b2c, margin: t.b2c - t.b2b })),
      totals: { b2b: sum.b2b, b2c: sum.b2c, margin: sum.margin },
    });
    AVM.utils.helpers.showToast("Rate list exported to Excel");
  }

  AVM.modules.exportRateList = { exportRateListCSV };
})();
