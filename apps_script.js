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
    const LOG_START = 9; // data starts at row 10 (row 9 is header)
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
    const LOG_START = 9;

    // Title
    sheet.getRange('A1').setValue('Field Tracker — ' + (s.activity || 'Milling') + ' Session');
    sheet.getRange('A1').setFontSize(14).setFontWeight('bold');
    sheet.getRange('A1:G1').merge();

    // Subtitle
    sheet.getRange('A2').setValue(
      (s.date||'') + '  ·  ' + (s.direction||'') + '  ·  ' + tabName
    );
    sheet.getRange('A2').setFontColor('#888888').setFontSize(11);
    sheet.getRange('A2:G2').merge();

    // Stats
    const stats = [
      ['Start Station', s.startStation, 'End Station', s.endStation],
      ['Total Length (m)', s.totalLength, 'Avg Width (m)', s.avgWidth],
      ['Total Area (m²)', s.totalArea, 'Entries', data.entries.length],
    ];
    stats.forEach((row, i) => {
      const r = 4 + i;
      sheet.getRange(r,1).setValue(row[0]).setFontWeight('bold');
      sheet.getRange(r,2).setValue(row[1]).setHorizontalAlignment('right');
      sheet.getRange(r,4).setValue(row[2]).setFontWeight('bold');
      sheet.getRange(r,5).setValue(row[3]).setHorizontalAlignment('right');
    });

    // Summary block col H (machine-readable)
    const summaryBlock = [
      ['Date', s.date], ['Direction', s.direction], ['Activity', s.activity||'Milling'],
      ['Segment', s.segment||''], ['Start Station', s.startStation], ['End Station', s.endStation],
      ['Total Length (m)', s.totalLength], ['Avg Width (m)', s.avgWidth],
      ['Total Area (m2)', s.totalArea], ['Entries', data.entries.length],
      ['Status', data.closed ? 'closed' : 'open'],
    ];
    sheet.getRange(1, 8, summaryBlock.length, 2).setValues(summaryBlock);
    sheet.getRange(1, 8, summaryBlock.length, 1).setFontWeight('bold');

    // Entry log header
    const headers = ['Station','Width (m)','Length (m)','Seg Area (m²)','Cum Area (m²)','Timestamp'];
    const headerRange = sheet.getRange(LOG_START, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground('#F59E0B').setFontColor('#111');

    // Entry rows
    if (data.entries.length > 0) {
      const rows = data.entries.map(entry => [
        entry.station, entry.width, entry.length,
        entry.segArea, entry.cumArea, entry.timestamp || ''
      ]);
      const dataRange = sheet.getRange(LOG_START+1, 1, rows.length, 6);
      dataRange.setValues(rows);
      sheet.getRange(LOG_START+1, 1, rows.length, 1).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1, 2, rows.length, 5).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1, 6, rows.length, 1).setNumberFormat('@');
      for (let i = 0; i < rows.length; i++) {
        if (i % 2 === 0) sheet.getRange(LOG_START+1+i,1,1,6).setBackground('#FAFAFA');
      }
      sheet.getRange(LOG_START+rows.length, 5).setFontWeight('bold');
    }

    // Column widths
    [90,90,90,110,110,160].forEach((w,i) => sheet.setColumnWidth(i+1, w));
    sheet.setFrozenRows(LOG_START);
    sheet.autoResizeColumns(8, 2);

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
