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
      // Read from visible header rows (cols A-F, rows 1-4)
      // Row 1: Date(B1), Direction(D1), Segment(F1)
      // Row 2: Start ST(B2), End ST(D2), LKI(F2)
      // Row 3: Start Time(B3), End Time(D3), Status(F3)
      // Row 4: Length(B4), Avg Width(D4), Area(F4)
      try {
        const h = sheet.getRange(1, 1, 4, 6).getValues();
        const lastRow = sheet.getLastRow();
        const entries = Math.max(0, lastRow - 6); // LOG_START=6, header=1 row
        const statusVal = h[2][5] || ''; // F3
        sessions.push({
          tab: name,
          date:        String(h[0][1] || ''),
          direction:   String(h[0][3] || ''),
          segment:     String(h[0][5] || ''),
          startStation: h[1][1],
          endStation:   h[1][3],
          dirLabel:    String(h[1][5] || ''),
          startTime:   String(h[2][1] || ''),
          endTime:     String(h[2][3] || ''),
          totalLength: h[3][1],
          avgWidth:    h[3][3],
          totalArea:   h[3][5],
          entries:     entries,
          closed:      statusVal.toString().toLowerCase().includes('closed')
        });
      } catch(e) {
        sessions.push({ tab: name, date: '', entries: 0, closed: false });
      }
    });
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
    const LOG_START = 6; // matches saveSession layout
    if (lastRow < LOG_START + 1) return { ok: true, entries: [], tabName };

    const data = sheet.getRange(LOG_START + 1, 1, lastRow - LOG_START, 6).getValues();
    const entries = data
      .filter(row => row[0] !== '' && row[0] !== null)
      .map(row => ({
        station: row[0], width: row[1], length: row[2],
        segArea: row[3], cumArea: row[4], timestamp: row[5] || ''
      }));

    // Read summary from visible header rows (cols A-F, rows 1-4)
    const h = sheet.getRange(1, 1, 4, 6).getValues();
    const summary = {
      'Date':            String(h[0][1]||''),
      'Direction':       String(h[0][3]||''),
      'Segment':         String(h[0][5]||''),
      'Start Station':   h[1][1],
      'End Station':     h[1][3],
      'Start Time':      String(h[2][1]||''),
      'End Time':        String(h[2][3]||''),
      'Status':          String(h[2][5]||''),
      'Total Length (m)': h[3][1],
      'Avg Width (m)':   h[3][3],
      'Total Area (m2)': h[3][5],
    };
    const closed = summary['Status'].toLowerCase().includes('closed');

    return { ok: true, tabName, entries, summary, closed };
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
    const LOG_START = 6; // rows 1-4 header, row 5 blank, row 6 log header

    // ── HEADER BLOCK (rows 1-4, cols A-F) ───────────────────────────────
    // Layout: col A = label (grey), col B = value (bold), col C = label, col D = value, col E = label, col F = value
    const headerRows = [
      ['Date',       s.date||'',            'Direction', s.direction||'',   'Segment',    s.segment||''],
      ['Start ST',   String(s.startStation||''), 'End ST',    String(s.endStation||''),   'LKI',        s.dirLabel||''],
      ['Start Time', s.startTime||'',       'End Time',  s.endTime||'',     '',           ''],
      ['Length (m)', String(s.totalLength||''), 'Avg W (m)', String(s.avgWidth||''),  'Area (m²)',  String(s.totalArea||'')],
    ];
    const labelColor = '#999999';
    const valColor   = '#111111';
    const labelSize  = 9;
    const valSize    = 11;

    headerRows.forEach((row, i) => {
      const r = i + 1;
      // Col A: label
      sheet.getRange(r,1).setValue(row[0])
        .setFontWeight('normal').setFontColor(labelColor).setFontSize(labelSize);
      // Col B: value
      sheet.getRange(r,2).setValue(row[1])
        .setFontWeight('bold').setFontColor(valColor).setFontSize(valSize);
      // Col C: label
      sheet.getRange(r,3).setValue(row[2])
        .setFontWeight('normal').setFontColor(labelColor).setFontSize(labelSize);
      // Col D: value
      sheet.getRange(r,4).setValue(row[3])
        .setFontWeight('bold').setFontColor(valColor).setFontSize(valSize);
      // Col E: label (if present)
      sheet.getRange(r,5).setValue(row[4]||'')
        .setFontWeight('normal').setFontColor(labelColor).setFontSize(labelSize);
      // Col F: value (if present)
      sheet.getRange(r,6).setValue(row[5]||'')
        .setFontWeight('bold').setFontColor(valColor).setFontSize(valSize);
    });

    // Status indicator row 3 col F: open = green dot, closed = grey
    const statusLabel = data.closed ? '● Closed' : '● Open';
    const statusColor = data.closed ? '#999999' : '#22C55E';
    sheet.getRange(3,5).setValue('Status').setFontColor(labelColor).setFontSize(labelSize);
    sheet.getRange(3,6).setValue(statusLabel).setFontColor(statusColor).setFontWeight('bold').setFontSize(valSize);

    // Light grey background on header rows for visual separation
    sheet.getRange(1, 1, 4, 6).setBackground('#F8F8F8');

    // ── ENTRY LOG HEADER (row 6) ─────────────────────────────────────────
    const headers = ['Station', 'Width (m)', 'Length (m)', 'Seg Area (m²)', 'Cum Area (m²)', 'Time'];
    const headerRange = sheet.getRange(LOG_START, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground('#F59E0B').setFontColor('#111111').setFontSize(10);

    // ── ENTRY ROWS ────────────────────────────────────────────────────────
    if (data.entries.length > 0) {
      const rows = data.entries.map(entry => {
        // Format timestamp as plain text string "01Jul 14:32"
        let ts = '';
        try {
          if (entry.timestamp && entry.timestamp.length > 0) {
            const d = new Date(entry.timestamp);
            if (!isNaN(d.getTime())) {
              const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              ts = String(d.getDate()).padStart(2,'0') + mo[d.getMonth()] + ' '
                 + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            }
          }
        } catch(e) { ts = ''; }
        return [
          Number(entry.station),
          Number(entry.width),
          Number(entry.length),
          Number(entry.segArea),
          Number(entry.cumArea),
          ts  // plain string — must stay as string, not a number
        ];
      });

      const dataRange = sheet.getRange(LOG_START+1, 1, rows.length, 6);
      dataRange.setValues(rows);

      // Number formats — explicit per column to prevent Sheets auto-interpreting time strings
      sheet.getRange(LOG_START+1, 1, rows.length, 1).setNumberFormat('0.00');   // Station
      sheet.getRange(LOG_START+1, 2, rows.length, 1).setNumberFormat('0.00');   // Width
      sheet.getRange(LOG_START+1, 3, rows.length, 1).setNumberFormat('0.00');   // Length
      sheet.getRange(LOG_START+1, 4, rows.length, 1).setNumberFormat('0.00');   // Seg Area
      sheet.getRange(LOG_START+1, 5, rows.length, 1).setNumberFormat('0.00');   // Cum Area
      sheet.getRange(LOG_START+1, 6, rows.length, 1).setNumberFormat('@STRING@'); // Time — force plain text

      // Alternating row shading
      for (let i = 0; i < rows.length; i++) {
        sheet.getRange(LOG_START+1+i, 1, 1, 6)
          .setBackground(i % 2 === 0 ? '#FFFFFF' : '#F5F5F5');
      }
      // Bold final cumulative area
      sheet.getRange(LOG_START+rows.length, 5).setFontWeight('bold');
    }

    // ── COLUMN WIDTHS ─────────────────────────────────────────────────────
    sheet.setColumnWidth(1, 85);    // Station
    sheet.setColumnWidth(2, 80);    // Width
    sheet.setColumnWidth(3, 80);    // Length
    sheet.setColumnWidth(4, 105);   // Seg Area
    sheet.setColumnWidth(5, 105);   // Cum Area
    sheet.setColumnWidth(6, 95);    // Time
    sheet.setFrozenRows(LOG_START); // Freeze through log header

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
