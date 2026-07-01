// Field Tracker — Google Sheets Backend v4
const SHEET_ID = '1gbXUYxZPkpLBISI-p4mC5BXlF_qkQ6gRVYjs3cYFKyY';

function doGet(e) {
  const callback = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true, msg: 'alive' }, callback);
    const raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, callback);
    const data = JSON.parse(decodeURIComponent(raw));
    if (data.action === 'save_session') return respond(saveSession(data), callback);
    return respond({ ok: false, error: 'Unknown action' }, callback);
  } catch(err) {
    return respond({ ok: false, error: err.toString() }, callback);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'save_session') return respond(saveSession(data));
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function saveSession(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const tabName = data.tabName;

    let sheet = ss.getSheetByName(tabName);
    if (sheet) {
      sheet.clearContents();
      sheet.clearFormats();
    } else {
      sheet = ss.insertSheet(tabName);
    }

    // Tab color — amber so FT- tabs stand out
    sheet.setTabColor('#F59E0B');

    const s = data.summary;

    // ── SUMMARY BLOCK (rows 1–5, cols A–D) ──────────────────────────────
    // Row 1: big title
    sheet.getRange('A1').setValue('Field Tracker — Milling Session');
    sheet.getRange('A1').setFontSize(14).setFontWeight('bold');
    sheet.getRange('A1:G1').merge();

    // Row 2: date / direction / project
    sheet.getRange('A2').setValue(s.date + '  ·  ' + s.direction + '  ·  ' + data.tabName);
    sheet.getRange('A2').setFontColor('#888888').setFontSize(11);
    sheet.getRange('A2:G2').merge();

    // Row 3: blank separator
    sheet.getRange('A3').setValue('');

    // Row 4–8: key stats in two columns
    const stats = [
      ['Start Station', s.startStation, 'End Station', s.endStation],
      ['Total Length (m)', s.totalLength, 'Avg Width (m)', s.avgWidth],
      ['Total Area (m²)', s.totalArea, 'Entries', data.entries.length],
    ];
    stats.forEach((row, i) => {
      const r = 4 + i;
      sheet.getRange(r, 1).setValue(row[0]).setFontWeight('bold');
      sheet.getRange(r, 2).setValue(row[1]).setHorizontalAlignment('right');
      sheet.getRange(r, 4).setValue(row[2]).setFontWeight('bold');
      sheet.getRange(r, 5).setValue(row[3]).setHorizontalAlignment('right');
    });

    // ── ENTRY LOG (starts row 9) ─────────────────────────────────────────
    const LOG_START = 9;

    // Header row
    const headers = ['Station', 'Width (m)', 'Length (m)', 'Seg Area (m²)', 'Cum Area (m²)', 'Time (UTC)'];
    const headerRange = sheet.getRange(LOG_START, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#F59E0B');
    headerRange.setFontColor('#111111');

    // Data rows
    if (data.entries.length > 0) {
      const rows = data.entries.map(entry => [
        entry.station,
        entry.width,
        entry.length,
        entry.segArea,
        entry.cumArea,
        entry.timestamp ? entry.timestamp.replace('T',' ').replace('Z','') : ''
      ]);
      const dataRange = sheet.getRange(LOG_START + 1, 1, rows.length, 6);
      dataRange.setValues(rows);

      // Number formats
      sheet.getRange(LOG_START+1, 1, rows.length, 1).setNumberFormat('0');        // Station: integer
      sheet.getRange(LOG_START+1, 2, rows.length, 5).setNumberFormat('0.00');     // rest: 2dp
      sheet.getRange(LOG_START+1, 5, rows.length, 1).setNumberFormat('0.0');      // Cum area: 1dp
      sheet.getRange(LOG_START+1, 6, rows.length, 1).setNumberFormat('@');        // Timestamp: text

      // Alternating row shading
      for (let i = 0; i < rows.length; i++) {
        if (i % 2 === 0) {
          sheet.getRange(LOG_START+1+i, 1, 1, 6).setBackground('#FAFAFA');
        }
      }

      // Bold the last cum area (final total)
      sheet.getRange(LOG_START + rows.length, 5).setFontWeight('bold');
    }

    // ── COLUMN WIDTHS ────────────────────────────────────────────────────
    sheet.setColumnWidth(1, 90);   // Station
    sheet.setColumnWidth(2, 90);   // Width
    sheet.setColumnWidth(3, 90);   // Length
    sheet.setColumnWidth(4, 110);  // Seg Area
    sheet.setColumnWidth(5, 110);  // Cum Area
    sheet.setColumnWidth(6, 160);  // Timestamp
    sheet.setColumnWidth(4, 110);  // stat col D
    sheet.setColumnWidth(5, 90);   // stat col E

    // Freeze header row
    sheet.setFrozenRows(LOG_START);

    return { ok: true, tabName: tabName, rows: data.entries.length };
  } catch(err) {
    return { ok: false, error: 'saveSession: ' + err.toString() };
  }
}

function respond(obj, callback) {
  const json = JSON.stringify(obj);
  const body = callback ? callback + '(' + json + ')' : json;
  const mime = callback
    ? ContentService.MimeType.JAVASCRIPT
    : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}
