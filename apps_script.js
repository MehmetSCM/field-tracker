// Field Tracker — Google Sheets Backend
// Paste this entire script into Extensions > Apps Script in your Sheet
// Then: Deploy > New Deployment > Web App > Execute as Me > Anyone > Deploy

const SHEET_ID = '1gbXUYxZPkpLBISI-p4mC5BXlF_qkQ6gRVYjs3cYFKyY';

function doGet(e) {
  // Browser fetch uses GET (CORS restriction on POST from static sites)
  // Payload arrives as e.parameter.data (JSON-encoded)
  // Also handles tab verification reads: ?action=verify&tabName=FT-2Jul26
  try {
    const action = e.parameter.action;

    // Verification check (future use)
    if(action === 'verify') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sheet = ss.getSheetByName(e.parameter.tabName);
      return respond({ ok: !!sheet });
    }

    // Main data payload
    const raw = e.parameter.data;
    if(!raw) return respond({ ok: false, error: 'No data parameter' });
    const data = JSON.parse(raw);

    if(data.action === 'save_session') {
      return saveSession(data);
    }
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  // Keep POST handler for future direct API use
  try {
    const data = JSON.parse(e.postData.contents);
    if(data.action === 'save_session') return saveSession(data);
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return respond({ ok: false, error: err.toString() });
  }
}

function saveSession(data) {
  // data = { action, tabName, entries, summary }
  // entries = [{station, width, length, segArea, cumArea, timestamp}]
  // summary = {date, direction, activity, startStation, endStation, totalArea, avgWidth, totalLength}

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tabName = data.tabName; // e.g. "FT-2Jul26"

  // Create tab if it doesn't exist, or clear it for a fresh save
  let sheet = ss.getSheetByName(tabName);
  if (sheet) {
    sheet.clearContents();
  } else {
    sheet = ss.insertSheet(tabName);
  }

  // Header row
  const headers = ['Station', 'Width (m)', 'Length (m)', 'Seg Area (m2)', 'Cum Area (m2)', 'Timestamp'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  // Summary block (rows 2-10, col H onward)
  const s = data.summary;
  const summaryData = [
    ['Date', s.date],
    ['Direction', s.direction],
    ['Activity', s.activity],
    ['Start Station', s.startStation],
    ['End Station', s.endStation],
    ['Total Length (m)', s.totalLength],
    ['Avg Width (m)', s.avgWidth],
    ['Total Area (m2)', s.totalArea],
    ['Entries', data.entries.length],
  ];
  sheet.getRange(1, 8, summaryData.length, 2).setValues(summaryData);
  sheet.getRange(1, 8, summaryData.length, 1).setFontWeight('bold');

  // Entry rows
  if (data.entries.length > 0) {
    const rows = data.entries.map(e => [
      e.station, e.width, e.length, e.segArea, e.cumArea, e.timestamp || ''
    ]);
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }

  // Format numbers
  sheet.getRange(2, 1, Math.max(data.entries.length, 1), 6)
    .setNumberFormat('0.00');
  sheet.getRange(2, 1, Math.max(data.entries.length, 1), 1)
    .setNumberFormat('0');

  // Auto-resize columns
  sheet.autoResizeColumns(1, 9);

  return respond({ ok: true, tabName, rows: data.entries.length });
}

function appendEntry(data) {
  // For live single-entry sync (future use)
  // data = { tabName, entry: {station, width, length, segArea, cumArea, timestamp} }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(data.tabName);
  if (!sheet) {
    sheet = ss.insertSheet(data.tabName);
    const headers = ['Station', 'Width (m)', 'Length (m)', 'Seg Area (m2)', 'Cum Area (m2)', 'Timestamp'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  const e = data.entry;
  sheet.appendRow([e.station, e.width, e.length, e.segArea, e.cumArea, e.timestamp || '']);
  return respond({ ok: true });
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
