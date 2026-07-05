// Daily Reporter Script
// Sheet ID: 1iEPy1VukqwVInLCwv10UNNVxPiqBhKO3pjdRqPRTydc
// Run createTemplate() once to build the Template tab

var DR_SHEET_ID = '1iEPy1VukqwVInLCwv10UNNVxPiqBhKO3pjdRqPRTydc';
var NCOLS = 8; // A=Item Code, B=Activity, C=Qty, D=UOM, E=From ST, F=To ST, G=Direction, H=Notes

function createTemplate() {
  var ss = SpreadsheetApp.openById(DR_SHEET_ID);

  // Get or create Template tab
  var ws = ss.getSheetByName('Template');
  if (ws) {
    ws.clearContents();
    ws.clearFormats();
  } else {
    ws = ss.insertSheet('Template');
  }

  // Column widths
  ws.setColumnWidth(1, 105);  // A: Item Code
  ws.setColumnWidth(2, 240);  // B: Activity
  ws.setColumnWidth(3, 100);  // C: Quantity
  ws.setColumnWidth(4, 65);   // D: UOM
  ws.setColumnWidth(5, 100);  // E: From Station
  ws.setColumnWidth(6, 100);  // F: To Station
  ws.setColumnWidth(7, 80);   // G: Direction
  ws.setColumnWidth(8, 280);  // H: Notes

  // Row 1: Date header
  ws.setRowHeight(1, 32);
  ws.getRange(1, 1, 1, NCOLS)
    .setBackground('#1A1A2E')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11);
  ws.getRange(1, 1).setValue('DATE');
  ws.getRange(1, 1).setFontSize(9).setFontColor('#6B7280');
  ws.getRange(1, 2).setValue('[Replace with date e.g. 3 Jul 26]');

  // Row 2: Column headers
  ws.setRowHeight(2, 28);
  var headers = [['Item Code','Activity','Quantity','UOM','From Station','To Station','Direction','Notes']];
  ws.getRange(2, 1, 1, NCOLS).setValues(headers);
  ws.getRange(2, 1, 1, NCOLS)
    .setBackground('#F59E0B')
    .setFontColor('#111111')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center');

  // Activity rows - exactly NCOLS columns each
  var rows = [
    ['04.03.02', 'Cold Mill 50mm',             '',         'm2',    '', '', '', ''],
    ['05.02.01', 'Tack Coat',                  '=C3*0.26', 'Litre', '', '', '', 'Auto: milled area x 0.26 L/m2'],
    ['05.03.02', 'Top Lift 50mm - Hwy 1',      '',         'Tonne', '', '', '', ''],
    ['05.03.03', 'Top Lift 50mm - Side Roads',  '',         'Tonne', '', '', '', ''],
    ['05.03.01', 'Level Course',                '',         'Tonne', '', '', '', ''],
    ['04.08.01', 'Hot Joint Sealant',           '',         'Litre', '', '', '', ''],
    ['04.04.01', 'Shoulder Stripping',          '',         'm',     '', '', '', ''],
    ['',         '',                            '',         '',      '', '', '', '']
  ];

  // Verify all rows have exactly NCOLS columns
  for (var i = 0; i < rows.length; i++) {
    while (rows[i].length < NCOLS) rows[i].push('');
    rows[i] = rows[i].slice(0, NCOLS);
  }

  var dataRange = ws.getRange(3, 1, rows.length, NCOLS);
  dataRange.setValues(rows);

  // Row heights
  for (var r = 3; r < 3 + rows.length; r++) {
    ws.setRowHeight(r, 22);
  }

  // Alternating shading
  for (var i = 0; i < rows.length; i++) {
    var bg = i % 2 === 0 ? '#FFFFFF' : '#F8F8F8';
    ws.getRange(3 + i, 1, 1, NCOLS).setBackground(bg);
  }

  // Item code column: muted, small
  ws.getRange(3, 1, rows.length, 1).setFontColor('#6B7280').setFontSize(9);

  // Activity column: bold
  ws.getRange(3, 2, rows.length, 1).setFontWeight('bold');

  // Quantity column: right align, larger, bold
  ws.getRange(3, 3, rows.length, 1)
    .setNumberFormat('#,##0.00')
    .setHorizontalAlignment('right')
    .setFontSize(11)
    .setFontWeight('bold');

  // Notes column: italic, muted
  ws.getRange(3, 8, rows.length, 1).setFontStyle('italic').setFontColor('#6B7280');

  // Border on entire table
  ws.getRange(2, 1, rows.length + 1, NCOLS)
    .setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);

  // Freeze header rows
  ws.setFrozenRows(2);

  Logger.log('Template created successfully');
  return 'Done';
}

// Create a new day tab by copying Template
function createDayTab(dateStr) {
  var ss = SpreadsheetApp.openById(DR_SHEET_ID);
  var tabName = 'DR-' + dateStr.replace(/\s+/g, '');

  if (ss.getSheetByName(tabName)) return { ok: true, tabName: tabName, msg: 'Already exists' };

  var template = ss.getSheetByName('Template');
  if (!template) return { ok: false, error: 'Template tab not found - run createTemplate() first' };

  var newSheet = template.copyTo(ss);
  newSheet.setName(tabName);
  newSheet.getRange(1, 2).setValue(dateStr);

  return { ok: true, tabName: tabName };
}

// Write a quantity to a specific item code row in the day tab
function writeActivity(dateStr, itemCode, quantity, fromSt, toSt, dir, notes) {
  try {
    var ss = SpreadsheetApp.openById(DR_SHEET_ID);
    var tabName = 'DR-' + dateStr.replace(/\s+/g, '');

    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      var result = createDayTab(dateStr);
      if (!result.ok) return result;
      sheet = ss.getSheetByName(tabName);
    }

    // Find row with matching item code in column A
    var lastRow = sheet.getLastRow();
    var codes = sheet.getRange(1, 1, lastRow, 1).getValues();
    var targetRow = null;
    for (var i = 0; i < codes.length; i++) {
      if (String(codes[i][0]).trim() === String(itemCode).trim()) {
        targetRow = i + 1;
        break;
      }
    }
    if (!targetRow) return { ok: false, error: 'Item code not found: ' + itemCode };

    if (quantity !== undefined && quantity !== null) sheet.getRange(targetRow, 3).setValue(quantity);
    if (fromSt  !== undefined && fromSt  !== null)  sheet.getRange(targetRow, 5).setValue(fromSt);
    if (toSt    !== undefined && toSt    !== null)   sheet.getRange(targetRow, 6).setValue(toSt);
    if (dir)   sheet.getRange(targetRow, 7).setValue(dir);
    if (notes) sheet.getRange(targetRow, 8).setValue(notes);

    return { ok: true, tabName: tabName, row: targetRow };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

// Web endpoints
function doGet(e) {
  var cb = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true, msg: 'Daily Reporter script alive' }, cb);

    var action = e.parameter.action;
    if (action === 'create_day') return respond(createDayTab(e.parameter.date), cb);

    var raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, cb);
    var data = JSON.parse(decodeURIComponent(raw));

    if (data.action === 'write_activity') {
      return respond(writeActivity(
        data.date, data.itemCode, data.quantity,
        data.fromSt, data.toSt, data.dir, data.notes
      ), cb);
    }

    return respond({ ok: false, error: 'Unknown action' }, cb);
  } catch(err) {
    return respond({ ok: false, error: err.toString() }, cb);
  }
}

function respond(obj, callback) {
  var json = JSON.stringify(obj);
  var body = callback ? callback + '(' + json + ')' : json;
  var mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}
