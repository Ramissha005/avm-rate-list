window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  const state = AVM.state;

  function csvEscape(value) {
    const s = String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows) {
    return rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
  }

  function downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const header = ["Code", "Test", "Technology", "Sample", "B2B", "B2C", "Margin"];
    const rows = items.map(t => [t.code, t.name, t.tech, t.sample, t.b2b, t.b2c, t.b2c - t.b2b]);
    downloadText(toCSV([header, ...rows]), "avmlabs-profile.csv", "text/csv;charset=utf-8;");
    AVM.utils.helpers.showToast("Profile exported as CSV");
  }

  function exportRateListCSV(tests) {
    if (!tests || tests.length === 0) {
      AVM.utils.helpers.showToast("Nothing to export");
      return;
    }
    const header = ["Code", "Test", "Category", "Technology", "Sample", "B2B", "B2C", "Margin"];
    const rows = tests.map(t => [t.code, t.name, t.category || "", t.tech, t.sample, t.b2b, t.b2c, t.b2c - t.b2b]);
    downloadText(toCSV([header, ...rows]), "avmlabs-rate-list.csv", "text/csv;charset=utf-8;");
    AVM.utils.helpers.showToast("Rate list exported as CSV");
  }

  AVM.modules.exportProfile = { copyProfileToClipboard, exportProfileCSV, exportRateListCSV };
})();
