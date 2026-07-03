// Field Tracker - Paving Sheet Backend
// Install on Paving Sheet: 1MzW88IKSUOzgwLn9OYgOTEOe3869ccAbaQ8GvJJD_yI
// Deploy as Web App: Execute as Me, Anyone

const PAVING_SHEET_ID = '1MzW88IKSUOzgwLn9OYgOTEOe3869ccAbaQ8GvJJD_yI';

function doGet(e) {
  const cb = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true, msg: 'Paving script alive' }, cb);

    const action = e.parameter.action;

    if (action === 'list_sessions') return respond(listSessions(), cb);
    if (action === 'read_session') return respond(readSession(e.parameter.tabName), cb);

    const raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, cb);
    const data = JSON.parse(decodeURIComponent(raw));

    if (data.action === 'save_paving_session') return respond(savePavingSession(data), cb);

    return respond({ ok: false, error: 'Unknown action: ' + data.action }, cb);
  } catch(err) {
    return respond({ ok: false, error: err.toString() }, cb);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'save_paving_session') return respond(savePavingSession(data));
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return respond({ ok: false, error: err.toString() });
  }
}

// -- LIST SESSIONS ---------------------------------------------------------

function listSessions() {
  try {
    const ss = SpreadsheetApp.openById(PAVING_SHEET_ID);
    const sheets = ss.getSheets();
    const sessions = [];

    sheets.forEach(function(sheet) {
      const name = sheet.getName();
      if (!name.startsWith('FT-')) return;
      try {
        const h = sheet.getRange(1, 1, 4, 6).getValues();
        const lastRow = sheet.getLastRow();
        const statusVal = String(h[2][5] || '');
        sessions.push({
          tab:          name,
          date:         String(h[0][1] || ''),
          direction:    String(h[0][3] || ''),
          segment:      String(h[0][5] || ''),
          startStation: h[1][1],
          endStation:   h[1][3],
          dirLabel:     String(h[1][5] || ''),
          startTime:    String(h[2][1] || ''),
          endTime:      String(h[2][3] || ''),
          totalTonnage: h[3][1],
          totalArea:    h[3][3],
          trucks:       h[3][5],
          entries:      Math.max(0, lastRow - 6),
          closed:       statusVal.toLowerCase().indexOf('closed') >= 0
        });
      } catch(e) {
        sessions.push({ tab: name, date: '', entries: 0, closed: false });
      }
    });

    sessions.sort(function(a, b) { return b.tab.localeCompare(a.tab); });
    return { ok: true, sessions: sessions };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

// -- READ SESSION ----------------------------------------------------------

function readSession(tabName) {
  try {
    if (!tabName) return { ok: false, error: 'No tabName' };
    const ss = SpreadsheetApp.openById(PAVING_SHEET_ID);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return { ok: false, error: 'Tab not found: ' + tabName };

    const lastRow = sheet.getLastRow();
    const LOG_START = 6;
    if (lastRow < LOG_START + 1) return { ok: true, tabName: tabName, truckEntries: [], widthEntries: [] };

    // Read header summary
    const h = sheet.getRange(1, 1, 4, 6).getValues();
    const summary = {
      'Date':         String(h[0][1] || ''),
      'Direction':    String(h[0][3] || ''),
      'Segment':      String(h[0][5] || ''),
      'Start Station': h[1][1],
      'End Station':   h[1][3],
      'Start Time':   String(h[2][1] || ''),
      'End Time':     String(h[2][3] || ''),
      'Status':       String(h[2][5] || ''),
      'Total Tonnage': h[3][1],
      'Total Area':   h[3][3]
    };
    const closed = summary['Status'].toLowerCase().indexOf('closed') >= 0;

    // Read truck entries (cols A-E starting row LOG_START+1)
    const truckData = sheet.getRange(LOG_START + 1, 1, lastRow - LOG_START, 5).getValues();
    const truckEntries = truckData
      .filter(function(row) { return row[0] !== '' && row[0] !== null; })
      .map(function(row) {
        return { vehicle: row[0], ticket: row[1], tonnage: row[2], cumTonnage: row[3], timestamp: row[4] || '' };
      });

    // Read width entries (cols G-M starting row LOG_START+1)
    const maxCol = sheet.getLastColumn();
    var widthEntries = [];
    if (maxCol >= 13) {
      const widthData = sheet.getRange(LOG_START + 1, 7, lastRow - LOG_START, 7).getValues();
      widthEntries = widthData
        .filter(function(row) { return row[0] !== '' && row[0] !== null; })
        .map(function(row) {
          return { station: row[0], width: row[1], milledWidth: row[2], length: row[3],
                   segArea: row[4], cumArea: row[5], timestamp: row[6] || '' };
        });
    }

    return { ok: true, tabName: tabName, summary: summary, closed: closed,
             truckEntries: truckEntries, widthEntries: widthEntries };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

// -- SAVE PAVING SESSION ---------------------------------------------------

function savePavingSession(data) {
  try {
    const ss = SpreadsheetApp.openById(PAVING_SHEET_ID);
    const tabName = data.tabName;

    var sheet = ss.getSheetByName(tabName);
    if (sheet) { sheet.clearContents(); sheet.clearFormats(); }
    else { sheet = ss.insertSheet(tabName); }

    sheet.setTabColor('#3B82F6');

    const s = data.summary || {};
    const labelColor = '#999999';

    // -- HEADER (rows 1-4) -------------------------------------------------
    const headerRows = [
      ['Date',       s.date||'',           'Direction', s.direction||'',  'Segment',   s.segment||''],
      ['Start ST',   String(s.startStation||''), 'End ST', String(s.endStation||''), 'LKI', s.dirLabel||''],
      ['Start Time', s.startTime||'',      'End Time',  s.endTime||'',    'Status',    data.closed ? 'Closed' : 'Open'],
      ['Tonnage (t)',String(s.totalTonnage||''), 'Area (m2)', String(s.totalArea||''), 'Trucks', String(s.trucks||'')]
    ];

    headerRows.forEach(function(row, i) {
      var r = i + 1;
      if (!row) return;
      sheet.getRange(r,1).setValue(row[0]).setFontColor(labelColor).setFontSize(9);
      sheet.getRange(r,2).setValue(row[1]).setFontWeight('bold').setFontSize(11);
      sheet.getRange(r,3).setValue(row[2]).setFontColor(labelColor).setFontSize(9);
      sheet.getRange(r,4).setValue(row[3]).setFontWeight('bold').setFontSize(11);
      sheet.getRange(r,5).setValue(row[4]).setFontColor(labelColor).setFontSize(9);
      sheet.getRange(r,6).setValue(row[5]).setFontWeight('bold').setFontSize(11);
    });

    var statusColor = data.closed ? '#999999' : '#22C55E';
    sheet.getRange(3,6).setFontColor(statusColor).setFontWeight('bold');
    sheet.getRange(1,1,4,6).setBackground('#F0F4FF');

    // -- TRUCK LOG (cols A-E, from row 6) ---------------------------------
    const LOG_START = 6;
    const truckHeaders = ['Vehicle', 'Ticket #', 'Tonnage (t)', 'Cumulative (t)', 'Time'];
    sheet.getRange(LOG_START, 1, 1, 5).setValues([truckHeaders])
      .setFontWeight('bold').setBackground('#3B82F6').setFontColor('#FFFFFF');

    if (data.truckEntries && data.truckEntries.length > 0) {
      var trows = data.truckEntries.map(function(t) {
        var ts = formatTimestamp(t.timestamp);
        return [t.vehicle||'', t.ticket||'', Number(t.tonnage)||0, Number(t.cumTonnage)||0, ts];
      });
      sheet.getRange(LOG_START+1, 1, trows.length, 5).setValues(trows);
      sheet.getRange(LOG_START+1, 3, trows.length, 2).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1, 5, trows.length, 1).setNumberFormat('@STRING@');
      for (var i = 0; i < trows.length; i++) {
        if (i % 2 === 0) sheet.getRange(LOG_START+1+i, 1, 1, 5).setBackground('#F8FAFF');
      }
    }

    // -- WIDTH LOG (cols G-M, from row 6) ---------------------------------
    const widthHeaders = ['Station', 'Pave W (m)', 'Milled W (m)', 'Length (m)', 'Seg Area (m2)', 'Cum Area (m2)', 'Time'];
    sheet.getRange(LOG_START, 7, 1, 7).setValues([widthHeaders])
      .setFontWeight('bold').setBackground('#3B82F6').setFontColor('#FFFFFF');

    if (data.widthEntries && data.widthEntries.length > 0) {
      var wrows = data.widthEntries.map(function(w) {
        var ts = formatTimestamp(w.timestamp);
        return [Number(w.station)||0, Number(w.width)||0, w.milledWidth||'',
                Number(w.length)||0, Number(w.segArea)||0, Number(w.cumArea)||0, ts];
      });
      sheet.getRange(LOG_START+1, 7, wrows.length, 7).setValues(wrows);
      sheet.getRange(LOG_START+1, 7, wrows.length, 6).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1, 13, wrows.length, 1).setNumberFormat('@STRING@');
      for (var j = 0; j < wrows.length; j++) {
        if (j % 2 === 0) sheet.getRange(LOG_START+1+j, 7, 1, 7).setBackground('#F8FAFF');
      }
    }

    // -- RATE ESTIMATES (col A, below truck log) ---------------------------
    if (data.rateEstimates && data.rateEstimates.length > 0) {
      var truckCount = (data.truckEntries || []).length;
      var estStart = LOG_START + truckCount + 3;
      sheet.getRange(estStart, 1).setValue('Rate Estimates')
        .setFontWeight('bold').setFontColor('#999999').setFontSize(9);
      var estHeaders = ['Time', 'To Station', 'Width (m)', 'Est. Area (m2)', 'Rate (%)'];
      sheet.getRange(estStart+1, 1, 1, 5).setValues([estHeaders])
        .setFontWeight('bold').setBackground('#F59E0B').setFontColor('#111111');
      var erows = data.rateEstimates.map(function(r) {
        return [formatTimestamp(r.ts), r.station, r.width, r.area, r.rate];
      });
      sheet.getRange(estStart+2, 1, erows.length, 5).setValues(erows);
      sheet.getRange(estStart+2, 4, erows.length, 2).setNumberFormat('0.00');
    }

    // -- COLUMN WIDTHS -----------------------------------------------------
    [60,70,90,90,95,20,80,80,80,75,90,95,95].forEach(function(w, i) {
      sheet.setColumnWidth(i+1, w);
    });
    sheet.setFrozenRows(LOG_START);

    return {
      ok: true,
      tabName: tabName,
      trucks: (data.truckEntries||[]).length,
      widths: (data.widthEntries||[]).length
    };
  } catch(err) {
    return { ok: false, error: 'savePavingSession: ' + err.toString() };
  }
}

// -- HELPERS ---------------------------------------------------------------

function formatTimestamp(ts) {
  try {
    if (!ts || String(ts).length === 0) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return String(d.getDate()).padStart(2,'0') + mo[d.getMonth()] + ' ' +
           String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  } catch(e) { return ''; }
}

function respond(obj, callback) {
  var json = JSON.stringify(obj);
  var body = callback ? callback + '(' + json + ')' : json;
  var mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}
