// Field Tracker — Google Sheets Backend v5
// Two-way sync: push entries, pull full session, read tab list
const SHEET_ID = '1gbXUYxZPkpLBISI-p4mC5BXlF_qkQ6gRVYjs3cYFKyY';

function doGet(e) {
  const cb = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true }, cb);

    const action = e.parameter.action;

    // List all FT- tabs with their summary data
    if (action === 'list_sessions') {
      return respond(listSessions(), cb);
    }

    // Read a specific session's entries back
    if (action === 'read_session') {
      return respond(readSession(e.parameter.tabName), cb);
    }

    // Save/push session data
    const raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, cb);
    const data = JSON.parse(decodeURIComponent(raw));
    if (data.action === 'save_session') return respond(saveSession(data), cb);

    return respond({ ok: false, error: 'Unknown action' }, cb);
  } catch(err) {
    return respond({ ok: false, error: err.toString() }, cb);
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

function listSessions() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheets = ss.getSheets();
    const sessions = [];
    sheets.forEach(sheet => {
      const name = sheet.getName();
      if (!name.startsWith('FT-')) return;
      // Read summary from col H
      const summary = {};
      try {
        const summaryData = sheet.getRange(1, 8, 10, 2).getValues();
        summaryData.forEach(row => {
          if (row[0]) summary[row[0]] = row[1];
        });
      } catch(e) {}
      sessions.push({
        tab: name,
        date: summary['Date'] || '',
        direction: summary['Direction'] || '',
        activity: summary['Activity'] || '',
        segment: summary['Segment'] || '',
        startStation: summary['Start Station'] || '',
        endStation: summary['End Station'] || '',
        totalArea: summary['Total Area (m2)'] || '',
        avgWidth: summary['Avg Width (m)'] || '',
        totalLength: summary['Total Length (m)'] || '',
        entries: summary['Entries'] || 0,
        closed: summary['Status'] === 'closed'
      });
    });
    // Sort newest first by tab name
    sessions.sort((a,b) => b.tab.localeCompare(a.tab));
    return { ok: true, sessions };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

function readSession(tabName) {
  try {
    if (!tabName) return { ok: false, error: 'No tabName' };
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return { ok: false, error: 'Tab not found: ' + tabName };

    const lastRow = sheet.getLastRow();
    const LOG_START = 5; // matches saveSession layout
    if (lastRow < LOG_START + 1) return { ok: true, entries: [], tabName };

    const data = sheet.getRange(LOG_START + 1, 1, lastRow - LOG_START, 6).getValues();
    const entries = data
      .filter(row => row[0] !== '' && row[0] !== null)
      .map(row => ({
        station: row[0],
        width: row[1],
        length: row[2],
        segArea: row[3],
        cumArea: row[4],
        timestamp: row[5] || ''
      }));

    // Also read summary
    const summaryData = sheet.getRange(1, 8, 10, 2).getValues();
    const summary = {};
    summaryData.forEach(row => { if (row[0]) summary[row[0]] = row[1]; });

    return { ok: true, tabName, entries, summary, closed: summary['Status'] === 'closed' };
  } catch(err) {
    return { ok: false, error: err.toString() };
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

    sheet.setTabColor('#F59E0B');

    const s = data.summary;
    const LOG_START = 5; // compact: stats rows 1-3, blank row 4, log from row 5

    // ── SUMMARY STATS (rows 1-3, cols A-E) ──────────────────────────────
    const stats = [
      ['Date', s.date||'', 'Direction', s.direction||'', (s.segment||'')],
      ['Start ST', s.startStation||'', 'End ST', s.endStation||'', (s.dirLabel||'')],
      ['Length (m)', s.totalLength||'', 'Avg Width (m)', s.avgWidth||'', 'Area (m²)'],
    ];
    // Row 3 col E gets the area value
    stats[2].push(s.totalArea||'');

    stats.forEach((row, i) => {
      const r = i + 1;
      sheet.getRange(r,1).setValue(row[0]).setFontWeight('bold').setFontColor('#888888').setFontSize(10);
      sheet.getRange(r,2).setValue(row[1]).setFontWeight('bold').setFontSize(11);
      sheet.getRange(r,3).setValue(row[2]).setFontWeight('bold').setFontColor('#888888').setFontSize(10);
      sheet.getRange(r,4).setValue(row[3]).setFontWeight('bold').setFontSize(11);
      if (row[4] !== undefined) sheet.getRange(r,5).setValue(row[4]).setFontColor('#888888').setFontSize(10);
      if (row[5] !== undefined) sheet.getRange(r,6).setValue(row[5]).setFontWeight('bold').setFontSize(11);
    });

    // ── MACHINE-READABLE SUMMARY (col H, rows 1-11) ─────────────────────
    const summaryBlock = [
      ['Date', s.date], ['Direction', s.direction], ['Activity', s.activity||'Milling'],
      ['Segment', s.segment||''], ['Start Station', s.startStation], ['End Station', s.endStation],
      ['Total Length (m)', s.totalLength], ['Avg Width (m)', s.avgWidth],
      ['Total Area (m2)', s.totalArea], ['Entries', data.entries.length],
      ['Status', data.closed ? 'closed' : 'open'],
    ];
    sheet.getRange(1, 8, summaryBlock.length, 2).setValues(summaryBlock);
    sheet.getRange(1, 8, summaryBlock.length, 1).setFontWeight('bold').setFontColor('#AAAAAA').setFontSize(9);
    sheet.getRange(1, 9, summaryBlock.length, 1).setFontSize(9);

    // ── ENTRY LOG HEADER (row 5) ─────────────────────────────────────────
    const headers = ['Station','Width (m)','Length (m)','Seg Area (m²)','Cum Area (m²)','Time'];
    const headerRange = sheet.getRange(LOG_START, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground('#F59E0B').setFontColor('#111111');

    // ── ENTRY ROWS ────────────────────────────────────────────────────────
    if (data.entries.length > 0) {
      const rows = data.entries.map(entry => {
        // Shorten timestamp: ISO → "27Jun 07:00"
        let ts = entry.timestamp || '';
        try {
          if (ts) {
            const d = new Date(ts);
            const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const dd = String(d.getDate()).padStart(2,'0');
            const hh = String(d.getHours()).padStart(2,'0');
            const mm = String(d.getMinutes()).padStart(2,'0');
            ts = dd + mo[d.getMonth()] + ' ' + hh + ':' + mm;
          }
        } catch(e) {}
        return [entry.station, entry.width, entry.length, entry.segArea, entry.cumArea, ts];
      });
      const dataRange = sheet.getRange(LOG_START+1, 1, rows.length, 6);
      dataRange.setValues(rows);
      sheet.getRange(LOG_START+1, 1, rows.length, 1).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1, 2, rows.length, 5).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1, 6, rows.length, 1).setNumberFormat('@');
      for (let i = 0; i < rows.length; i++) {
        if (i % 2 === 0) sheet.getRange(LOG_START+1+i, 1, 1, 6).setBackground('#FAFAFA');
      }
      sheet.getRange(LOG_START+rows.length, 5).setFontWeight('bold');
    }

    // ── COLUMN WIDTHS ─────────────────────────────────────────────────────
    sheet.setColumnWidth(1, 80);   // Station
    sheet.setColumnWidth(2, 80);   // Width
    sheet.setColumnWidth(3, 80);   // Length
    sheet.setColumnWidth(4, 100);  // Seg Area
    sheet.setColumnWidth(5, 100);  // Cum Area
    sheet.setColumnWidth(6, 100);  // Time (shortened)
    sheet.autoResizeColumns(8, 2); // Summary labels auto-size
    sheet.setFrozenRows(LOG_START);

    return { ok: true, tabName, rows: data.entries.length };
  } catch(err) {
    return { ok: false, error: 'saveSession: ' + err.toString() };
  }
}

function respond(obj, callback) {
  const json = JSON.stringify(obj);
  const body = callback ? callback + '(' + json + ')' : json;
  const mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}
