// Daily Reporter - Google Sheets Backend
// Install on Daily Reporter Sheet: 1iEPy1VukqwVInLCwv10UNNVxPiqBhKO3pjdRqPRTydc
// Run createTemplate() once to build the Template tab

const DR_SHEET_ID = '1iEPy1VukqwVInLCwv10UNNVxPiqBhKO3pjdRqPRTydc';

// -- CREATE TEMPLATE TAB -------------------------------------------------------

function createTemplate() {
  const ss = SpreadsheetApp.openById(DR_SHEET_ID);

  // Get or create Template tab
  var ws = ss.getSheetByName('Template');
  if (ws) {
    ws.clearContents();
    ws.clearFormats();
  } else {
    ws = ss.insertSheet('Template');
  }

  // -- COLUMN WIDTHS ----------------------------------------------------------
  ws.setColumnWidth(1, 105);  // A: Item Code
  ws.setColumnWidth(2, 240);  // B: Activity / Description
  ws.setColumnWidth(3, 100);  // C: Quantity
  ws.setColumnWidth(4, 65);   // D: UOM
  ws.setColumnWidth(5, 100);  // E: From Station
  ws.setColumnWidth(6, 100);  // F: To Station
  ws.setColumnWidth(7, 80);   // G: Direction
  ws.setColumnWidth(8, 280);  // H: Notes

  // -- ROW 1: DATE HEADER -----------------------------------------------------
  ws.setRowHeight(1, 32);
  ws.getRange('A1').setValue('DATE');
  ws.getRange('B1').setValue('[Replace with date e.g. 3 Jul 26]');
  ws.getRange('A1:H1').setBackground('#1A1A2E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11);
  ws.getRange('A1').setFontSize(9).setFontColor('#6B7280');

  // -- ROW 2: COLUMN HEADERS --------------------------------------------------
  ws.setRowHeight(2, 28);
  var headers = ['Item Code', 'Activity', 'Quantity', 'UOM',
                 'From Station', 'To Station', 'Direction', 'Notes'];
  ws.getRange(2, 1, 1, 8).setValues([headers]);
  ws.getRange(2, 1, 1, 8)
    .setBackground('#F59E0B').setFontColor('#111111')
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center');

  // -- ACTIVITY ROWS ----------------------------------------------------------
  // [Activity, Item Code, Segment, Direction, From ST, To ST, Quantity, UOM, Notes]
  var rows = [
    ['04.03.02', 'Cold Mill 50mm',              '', 'm2',    '', '', '', ''],
    ['05.02.01', 'Tack Coat',                   '=C3*0.26', 'Litre', '', '', '', 'Auto: milled area x 0.26 L/m2'],
    ['05.03.02', 'Top Lift 50mm - Hwy 1',       '', 'Tonne', '', '', '', ''],
    ['05.03.03', 'Top Lift 50mm - Side Roads',  '', 'Tonne', '', '', '', ''],
    ['05.03.01', 'Level Course',                '', 'Tonne', '', '', '', ''],
    ['04.08.01', 'Hot Joint Sealant',           '', 'Litre', '', '', '', ''],
    ['04.04.01', 'Shoulder Stripping',          '', 'm',     '', '', '', ''],
    ['',         '',                            '', '',      '', '', '', ''],
  ];

  ws.setRowHeight(3, 22); // milling
  ws.setRowHeight(4, 22); // tack coat
  ws.setRowHeight(5, 22); // top lift hwy
  ws.setRowHeight(6, 22); // top lift side roads
  ws.setRowHeight(7, 22); // level course
  ws.setRowHeight(8, 22); // hot joint
  ws.setRowHeight(9, 22); // shouldering
  ws.setRowHeight(10, 22); // spare

  ws.getRange(3, 1, rows.length, 8).setValues(rows);

  // Alternating row shading
  for (var i = 0; i < rows.length; i++) {
    var r = 3 + i;
    var bg = i % 2 === 0 ? '#FFFFFF' : '#F8F8F8';
    ws.getRange(r, 1, 1, 8).setBackground(bg);
  }

  // Number format for quantity column
  ws.getRange('C3:C' + (3 + rows.length)).setNumberFormat('#,##0.00');

  // Item code column - muted, smaller
  ws.getRange('A3:A' + (3 + rows.length)).setFontColor('#6B7280').setFontSize(9);

  // Notes column - italic
  ws.getRange('H3:H' + (3 + rows.length)).setFontStyle('italic').setFontColor('#6B7280');

  // Activity column - bold
  ws.getRange('B3:B' + (3 + rows.length)).setFontWeight('bold');

  // Quantity column - right aligned, larger
  ws.getRange('C3:C' + (3 + rows.length)).setHorizontalAlignment('right').setFontSize(11).setFontWeight('bold');

  // Border around data range
  var dataRange = ws.getRange(2, 1, rows.length + 1, 8);
  var border = SpreadsheetApp.newTextStyle().build();
  dataRange.setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);

  // Freeze header rows
  ws.setFrozenRows(2);

  Logger.log('Template tab created successfully.');
  return 'Template created';
}

// -- CREATE DAY TAB ------------------------------------------------------------
// Called by the app at end of day - copies Template and fills in data

function createDayTab(dateStr) {
  // dateStr e.g. '3 Jul 26'
  const ss = SpreadsheetApp.openById(DR_SHEET_ID);
  const tabName = 'DR-' + dateStr.replace(/\s+/g, '');

  // Don't overwrite existing tab
  if (ss.getSheetByName(tabName)) return { ok: true, tabName: tabName, msg: 'Already exists' };

  // Copy Template
  const template = ss.getSheetByName('Template');
  if (!template) return { ok: false, error: 'Template tab not found' };

  const newSheet = template.copyTo(ss);
  newSheet.setName(tabName);

  // Set the date in B1
  newSheet.getRange('B1').setValue(dateStr);

  // Move to front (after Template)
  ss.moveActiveSheet(1);
  newSheet.activate();
  ss.moveActiveSheet(2);

  return { ok: true, tabName: tabName };
}

// -- WRITE ACTIVITY -------------------------------------------------------------
// Write a quantity to a specific activity row in the day tab

function writeActivity(dateStr, itemCode, quantity, fromSt, toSt, seg, dir, notes) {
  try {
    const ss = SpreadsheetApp.openById(DR_SHEET_ID);
    const tabName = 'DR-' + dateStr.replace(/\s+/g, '');

    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      // Create tab first
      const result = createDayTab(dateStr);
      if (!result.ok) return result;
      sheet = ss.getSheetByName(tabName);
    }

    // Find the row with matching item code in column B
    var lastRow = sheet.getLastRow();
    var itemCodes = sheet.getRange('A1:A' + lastRow).getValues();
    var targetRow = null;
    for (var i = 0; i < itemCodes.length; i++) {
      if (String(itemCodes[i][0]).trim() === String(itemCode).trim()) {
        targetRow = i + 1;
        break;
      }
    }
    if (!targetRow) return { ok: false, error: 'Item code not found: ' + itemCode };

    // Write values
    if (quantity !== undefined && quantity !== null) sheet.getRange(targetRow, 3).setValue(quantity);
    if (fromSt !== undefined && fromSt !== null) sheet.getRange(targetRow, 5).setValue(fromSt);
    if (toSt !== undefined && toSt !== null)     sheet.getRange(targetRow, 6).setValue(toSt);
    if (dir)   sheet.getRange(targetRow, 7).setValue(dir);
    if (notes) sheet.getRange(targetRow, 8).setValue(notes);

    return { ok: true, tabName: tabName, row: targetRow };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

// -- WEB ENDPOINTS -------------------------------------------------------------

function doGet(e) {
  const cb = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true, msg: 'Daily Reporter script alive' }, cb);

    const action = e.parameter.action;
    if (action === 'create_day') return respond(createDayTab(e.parameter.date), cb);

    const raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, cb);
    const data = JSON.parse(decodeURIComponent(raw));

    if (data.action === 'write_activity') {
      return respond(writeActivity(
        data.date, data.itemCode, data.quantity,
        data.fromSt, data.toSt, data.seg, data.dir, data.notes
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
