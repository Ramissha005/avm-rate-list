window.AVM = window.AVM || {};
AVM.utils = AVM.utils || {};

// Hand-rolled .xlsx writer — no external library, no build step, matches how
// the rest of this project works. An .xlsx file is just a zip archive of a
// handful of small XML parts; this builds those parts and zips them (stored,
// uncompressed — Excel reads that fine) entirely with browser-native APIs.
//
// Why not just style a CSV? CSV can't carry any formatting at all — no bold
// header, no currency format, no colors. A real .xlsx is the only way to get
// AVMLabs-branded, genuinely "good" Excel output.
(function () {
  const NAVY = "FF0E2238";
  const PROFIT = "FF1B5FA8";
  const GRAY = "FF5B6971";
  const LINE = "FFD7DADD";
  const ZEBRA = "FFF6F7F8";

  // ---- style indices, must match the cellXfs order built in stylesXml() ----
  const S = {
    title: 1, subtitle: 2,
    headerLeft: 3, headerRight: 4,
    textCell: 5, textCellZebra: 6,
    numCell: 7, numCellZebra: 8,
    marginCell: 9, marginCellZebra: 10,
    totalLabel: 11, totalNum: 12, totalMargin: 13,
  };

  function colLetter(i) {
    let s = "";
    i++;
    while (i > 0) {
      const rem = (i - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function xmlEscape(v) {
    return String(v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  // ---- CRC32 (needed for the zip's local/central file headers) ----
  function crc32(bytes) {
    let crc = ~0;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return ~crc >>> 0;
  }

  // ---- minimal stored (uncompressed) zip writer ----
  function makeZip(files) {
    const enc = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    files.forEach(({ name, data }) => {
      const nameBytes = enc.encode(name);
      const crc = crc32(data);
      const size = data.length;

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      localChunks.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralChunks.push(central);

      offset += local.length + data.length;
    });

    const centralSize = centralChunks.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...localChunks, ...centralChunks, end], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  // ---- fixed OOXML boilerplate parts ----
  function contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  }

  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  }

  function workbookXml(sheetName) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  }

  function workbookRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF101C27"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="${NAVY}"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="${NAVY}"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="${GRAY}"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="${PROFIT}"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${NAVY}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${ZEBRA}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${LINE}"/></bottom><diagonal/></border>
<border><left/><right/><top style="medium"><color rgb="${NAVY}"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
</styleSheet>`;
  }

  // columns: [{header, key, type:'text'|'currency'|'margin', width}]
  // rows: array of plain objects keyed by column.key
  // totals: { key: number } for columns that get a summed footer cell
  function worksheetXml({ title, subtitle, columns, rows, totals }) {
    const lastCol = colLetter(columns.length - 1);
    const headerRow = 4;
    const firstDataRow = headerRow + 1;
    const lastDataRow = firstDataRow + rows.length - 1;
    const hasTotals = totals && rows.length > 0;
    const totalsRow = lastDataRow + 1;

    const cols = `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("")}</cols>`;

    const titleRow = `<row r="1" ht="24"><c r="A1" t="inlineStr" s="${S.title}"><is><t>${xmlEscape(title)}</t></is></c></row>`;
    const subtitleRow = `<row r="2"><c r="A2" t="inlineStr" s="${S.subtitle}"><is><t>${xmlEscape(subtitle)}</t></is></c></row>`;

    const headerCells = columns.map((c, i) => {
      const s = c.type === "text" ? S.headerLeft : S.headerRight;
      return `<c r="${colLetter(i)}${headerRow}" t="inlineStr" s="${s}"><is><t>${xmlEscape(c.header)}</t></is></c>`;
    }).join("");
    const headerRowXml = `<row r="${headerRow}" ht="20">${headerCells}</row>`;

    const dataRowsXml = rows.map((row, ri) => {
      const r = firstDataRow + ri;
      const zebra = ri % 2 === 1;
      const cells = columns.map((c, ci) => {
        const ref = `${colLetter(ci)}${r}`;
        const val = row[c.key];
        if (c.type === "text") {
          const s = zebra ? S.textCellZebra : S.textCell;
          return `<c r="${ref}" t="inlineStr" s="${s}"><is><t>${xmlEscape(val == null ? "" : val)}</t></is></c>`;
        }
        const s = c.type === "margin" ? (zebra ? S.marginCellZebra : S.marginCell) : (zebra ? S.numCellZebra : S.numCell);
        return `<c r="${ref}" s="${s}"><v>${Number(val) || 0}</v></c>`;
      }).join("");
      return `<row r="${r}">${cells}</row>`;
    }).join("");

    let totalsRowXml = "";
    let mergeCells;
    if (hasTotals) {
      const totalKeys = Object.keys(totals);
      const firstTotalIdx = columns.findIndex(c => totalKeys.includes(c.key));
      const labelSpan = firstTotalIdx > 0 ? firstTotalIdx : 1;
      const cells = [];
      cells.push(`<c r="A${totalsRow}" t="inlineStr" s="${S.totalLabel}"><is><t>Total — ${rows.length} test${rows.length === 1 ? "" : "s"}</t></is></c>`);
      columns.forEach((c, ci) => {
        if (ci === 0 || !totalKeys.includes(c.key)) return;
        const ref = `${colLetter(ci)}${totalsRow}`;
        const range = `${colLetter(ci)}${firstDataRow}:${colLetter(ci)}${lastDataRow}`;
        const s = c.type === "margin" ? S.totalMargin : S.totalNum;
        cells.push(`<c r="${ref}" s="${s}"><f>SUM(${range})</f><v>${Number(totals[c.key]) || 0}</v></c>`);
      });
      totalsRowXml = `<row r="${totalsRow}">${cells.join("")}</row>`;
      // merge label across the leading non-total columns
      mergeCells = `<mergeCells count="3"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/><mergeCell ref="A${totalsRow}:${colLetter(Math.max(labelSpan - 1, 0))}${totalsRow}"/></mergeCells>`;
    } else {
      mergeCells = `<mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells>`;
    }

    const filterRef = `A${headerRow}:${lastCol}${lastDataRow}`;
    const dimensionEnd = hasTotals ? totalsRow : lastDataRow;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${dimensionEnd}"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${firstDataRow}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${titleRow}${subtitleRow}${headerRowXml}${dataRowsXml}${totalsRowXml}</sheetData><autoFilter ref="${filterRef}"/>${mergeCells}</worksheet>`;
  }

  function downloadWorkbook({ filename, sheetName, title, subtitle, columns, rows, totals }) {
    const enc = new TextEncoder();
    const files = [
      { name: "[Content_Types].xml", data: enc.encode(contentTypesXml()) },
      { name: "_rels/.rels", data: enc.encode(rootRelsXml()) },
      { name: "xl/workbook.xml", data: enc.encode(workbookXml(sheetName)) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRelsXml()) },
      { name: "xl/styles.xml", data: enc.encode(stylesXml()) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(worksheetXml({ title, subtitle, columns, rows, totals })) },
    ];
    const blob = makeZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  AVM.utils.xlsx = { downloadWorkbook };
})();
