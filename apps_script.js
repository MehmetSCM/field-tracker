// Field Tracker — Google Sheets Backend v3
const SHEET_ID = '1gbXUYxZPkpLBISI-p4mC5BXlF_qkQ6gRVYjs3cYFKyY';

function doGet(e) {
  const callback = e.parameter.callback || null;
  try {
    // Simple ping test — if ?ping=1, just return ok immediately
    if (e.parameter.ping) {
      return respond({ ok: true, msg: 'Script is alive' }, callback);
    }
    const raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data parameter' }, callback);
    const data = JSON.parse(decodeURIComponent(raw));
    if (data.action === 'save_session') {
      return respond(saveSession(data), callback);
    }
    return respond({ ok: false, error: 'Unknown action: ' + data.action }, callback);
  } catch(err) {
    return respond({ ok: false, error: 'doGet error: ' + err.toString() }, callback);
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
    } else {
      sheet = ss.insertSheet(tabName);
    }

    const headers = ['Station', 'Width (m)', 'Length (m)', 'Seg Area (m2)', 'Cum Area (m2)', 'Timestamp'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

    const s = data.summary;
    const summary = [
      ['Date', s.date], ['Direction', s.direction], ['Activity', s.activity],
      ['Start Station', s.startStation], ['End Station', s.endStation],
      ['Total Length (m)', s.totalLength], ['Avg Width (m)', s.avgWidth],
      ['Total Area (m2)', s.totalArea], ['Entries', data.entries.length],
    ];
    sheet.getRange(1, 8, summary.length, 2).setValues(summary);
    sheet.getRange(1, 8, summary.length, 1).setFontWeight('bold');

    if (data.entries.length > 0) {
      const rows = data.entries.map(entry => [
        entry.station, entry.width, entry.length,
        entry.segArea, entry.cumArea, entry.timestamp || ''
      ]);
      sheet.getRange(2, 1, rows.length, 6).setValues(rows);
      sheet.getRange(2, 1, rows.length, 6).setNumberFormat('0.00');
      sheet.getRange(2, 1, rows.length, 1).setNumberFormat('0');
    }

    sheet.autoResizeColumns(1, 9);
    return { ok: true, tabName: tabName, rows: data.entries.length };
  } catch(err) {
    return { ok: false, error: 'saveSession error: ' + err.toString() };
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
