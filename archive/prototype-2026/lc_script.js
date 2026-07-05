// Level Course Script
// Sheet ID: 1P60fkqnnWA1IWdclij7UG_XNdE8x2iosG_KktA_Ug7I
// Deploy as Web App: Execute as Me, Anyone

var LC_SHEET_ID = '1P60fkqnnWA1IWdclij7UG_XNdE8x2iosG_KktA_Ug7I';

function doGet(e) {
  var cb = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true, msg: 'Level Course script alive' }, cb);

    var action = e.parameter.action;
    if (action === 'list_sessions') return respond(listSessions(), cb);
    if (action === 'read_session')  return respond(readSession(e.parameter.tabName), cb);

    var raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, cb);
    var data = JSON.parse(decodeURIComponent(raw));

    if (data.action === 'save_lc_session') return respond(saveLCSession(data), cb);

    return respond({ ok: false, error: 'Unknown action: ' + data.action }, cb);
  } catch(err) {
    return respond({ ok: false, error: err.toString() }, cb);
  }
}

function listSessions() {
  try {
    var ss = SpreadsheetApp.openById(LC_SHEET_ID);
    var sessions = [];
    ss.getSheets().forEach(function(sheet) {
      var name = sheet.getName();
      if (!name.startsWith('FT-')) return;
      try {
        var h = sheet.getRange(1, 1, 4, 6).getValues();
        var statusVal = String(h[2][5] || '');
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
          closed:       statusVal.toLowerCase().indexOf('closed') >= 0
        });
      } catch(e) {
        sessions.push({ tab: name, date: '', closed: false });
      }
    });
    sessions.sort(function(a,b){ return b.tab.localeCompare(a.tab); });
    return { ok: true, sessions: sessions };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

function readSession(tabName) {
  try {
    if (!tabName) return { ok: false, error: 'No tabName' };
    var ss = SpreadsheetApp.openById(LC_SHEET_ID);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return { ok: false, error: 'Tab not found: ' + tabName };

    var lastRow = sheet.getLastRow();
    var LOG_START = 6;
    var h = sheet.getRange(1, 1, 4, 6).getValues();
    var summary = {
      'Date':         String(h[0][1]||''),
      'Direction':    String(h[0][3]||''),
      'Segment':      String(h[0][5]||''),
      'Start Station': h[1][1],
      'End Station':   h[1][3],
      'Start Time':   String(h[2][1]||''),
      'End Time':     String(h[2][3]||''),
      'Status':       String(h[2][5]||''),
      'Total Tonnage': h[3][1],
      'Total Area':   h[3][3]
    };
    var closed = summary['Status'].toLowerCase().indexOf('closed') >= 0;

    if (lastRow < LOG_START + 1) return { ok: true, tabName: tabName, summary: summary, closed: closed, truckEntries: [], widthEntries: [] };

    // Truck entries cols A-E
    var tdata = sheet.getRange(LOG_START+1, 1, lastRow-LOG_START, 5).getValues();
    var truckEntries = tdata.filter(function(r){ return r[0]!==''; }).map(function(r){
      return { vehicle:r[0], ticket:r[1], tonnage:r[2], cumTonnage:r[3], timestamp:r[4]||'' };
    });

    // Width entries cols G-M
    var widthEntries = [];
    if (sheet.getLastColumn() >= 13) {
      var wdata = sheet.getRange(LOG_START+1, 7, lastRow-LOG_START, 7).getValues();
      widthEntries = wdata.filter(function(r){ return r[0]!==''; }).map(function(r){
        return { station:r[0], width:r[1], length:r[2], segArea:r[3], cumArea:r[4], timestamp:r[5]||'' };
      });
    }

    return { ok:true, tabName:tabName, summary:summary, closed:closed, truckEntries:truckEntries, widthEntries:widthEntries };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

function saveLCSession(data) {
  try {
    var ss = SpreadsheetApp.openById(LC_SHEET_ID);
    var tabName = data.tabName;
    var sheet = ss.getSheetByName(tabName);
    if (sheet) { sheet.clearContents(); sheet.clearFormats(); }
    else { sheet = ss.insertSheet(tabName); }
    sheet.setTabColor('#22C55E'); // Green for level course

    var s = data.summary || {};
    var labelColor = '#999999';

    // Header rows 1-4
    var headerRows = [
      ['Date', s.date||'', 'Direction', s.direction||'', 'Segment', s.segment||''],
      ['Start ST', String(s.startStation||''), 'End ST', String(s.endStation||''), 'LKI', s.dirLabel||''],
      ['Start Time', s.startTime||'', 'End Time', s.endTime||'', 'Status', data.closed?'Closed':'Open'],
      ['Tonnage (t)', String(s.totalTonnage||''), 'Area (m2)', String(s.totalArea||''), 'Trucks', String(s.trucks||'')]
    ];
    headerRows.forEach(function(row, i) {
      var r = i+1;
      sheet.getRange(r,1).setValue(row[0]).setFontColor(labelColor).setFontSize(9);
      sheet.getRange(r,2).setValue(row[1]).setFontWeight('bold').setFontSize(11);
      sheet.getRange(r,3).setValue(row[2]).setFontColor(labelColor).setFontSize(9);
      sheet.getRange(r,4).setValue(row[3]).setFontWeight('bold').setFontSize(11);
      sheet.getRange(r,5).setValue(row[4]).setFontColor(labelColor).setFontSize(9);
      sheet.getRange(r,6).setValue(row[5]).setFontWeight('bold').setFontSize(11);
    });
    sheet.getRange(3,6).setFontColor(data.closed?'#999999':'#22C55E').setFontWeight('bold');
    sheet.getRange(1,1,4,6).setBackground('#F0FFF4');

    var LOG_START = 6;

    // Truck log cols A-E
    var truckHeaders = ['Vehicle','Ticket #','Tonnage (t)','Cumulative (t)','Time'];
    sheet.getRange(LOG_START,1,1,5).setValues([truckHeaders])
      .setFontWeight('bold').setBackground('#22C55E').setFontColor('#111111');

    if (data.truckEntries && data.truckEntries.length > 0) {
      var trows = data.truckEntries.map(function(t) {
        return [t.vehicle||'', t.ticket||'', Number(t.tonnage)||0, Number(t.cumTonnage)||0, formatTs(t.timestamp)];
      });
      sheet.getRange(LOG_START+1,1,trows.length,5).setValues(trows);
      sheet.getRange(LOG_START+1,3,trows.length,2).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1,5,trows.length,1).setNumberFormat('@STRING@');
      for (var i=0;i<trows.length;i++) {
        if (i%2===0) sheet.getRange(LOG_START+1+i,1,1,5).setBackground('#F0FFF4');
      }
    }

    // Width log cols G-M
    var widthHeaders = ['Station','Width (m)','Length (m)','Seg Area (m2)','Cum Area (m2)','Time'];
    sheet.getRange(LOG_START,7,1,6).setValues([widthHeaders])
      .setFontWeight('bold').setBackground('#22C55E').setFontColor('#111111');

    if (data.widthEntries && data.widthEntries.length > 0) {
      var wrows = data.widthEntries.map(function(w) {
        return [Number(w.station)||0, Number(w.width)||0, Number(w.length)||0,
                Number(w.segArea)||0, Number(w.cumArea)||0, formatTs(w.timestamp)];
      });
      sheet.getRange(LOG_START+1,7,wrows.length,6).setValues(wrows);
      sheet.getRange(LOG_START+1,7,wrows.length,5).setNumberFormat('0.00');
      sheet.getRange(LOG_START+1,12,wrows.length,1).setNumberFormat('@STRING@');
      for (var j=0;j<wrows.length;j++) {
        if (j%2===0) sheet.getRange(LOG_START+1+j,7,1,6).setBackground('#F0FFF4');
      }
    }

    [60,70,90,90,95,20,80,80,80,75,90,95].forEach(function(w,i){
      sheet.setColumnWidth(i+1,w);
    });
    sheet.setFrozenRows(LOG_START);

    return { ok:true, tabName:tabName, trucks:(data.truckEntries||[]).length, widths:(data.widthEntries||[]).length };
  } catch(err) {
    return { ok:false, error:'saveLCSession: '+err.toString() };
  }
}

function formatTs(ts) {
  try {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return String(d.getDate()).padStart(2,'0')+mo[d.getMonth()]+' '+
           String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  } catch(e) { return ''; }
}

function respond(obj, callback) {
  var json = JSON.stringify(obj);
  var body = callback ? callback+'('+json+')' : json;
  var mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}
