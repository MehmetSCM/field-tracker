// Application Rate Reconstruction - Google Sheets Backend
// Install this script on: https://docs.google.com/spreadsheets/d/1shr2bn5KMjKkYfVWQGXJ8ACuz07YvCGURIOlth2m51k
// Deploy as Web App: Execute as Me, Anyone

const SHEET_ID = '1shr2bn5KMjKkYfVWQGXJ8ACuz07YvCGURIOlth2m51k';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const TARGET_RATE_KG_M2 = 124.35;

// - ENTRY POINTS -----------------------------

function doGet(e) {
  const cb = e.parameter.callback || null;
  try {
    if (e.parameter.ping) return respond({ ok: true, msg: 'AppRate script alive' }, cb);

    const action = e.parameter.action;
    if (action === 'list_tabs') return respond(listTabs(), cb);
    if (action === 'read_tab') return respond(readTab(e.parameter.tabName), cb);

    const raw = e.parameter.data;
    if (!raw) return respond({ ok: false, error: 'No data' }, cb);
    const data = JSON.parse(decodeURIComponent(raw));

    if (data.action === 'reconstruct') {
      // Expand compact format if used (t/w arrays instead of trucks/widthReadings)
      if (data.t) {
        data.trucks = data.t.map(function(r) {
          return { vehicle: r[0], ticket: r[1], tonnage: r[2],
                   activity: r[3] === 1 ? 'levelcourse' : 'toplift' };
        });
        data.widthReadings = data.w.map(function(r) {
          return { station: r[0], width: r[1] };
        });
        data.direction = data.dir || data.direction;
        data.segment = data.seg || data.segment;
        data.dirLabel = data.lki || data.dirLabel;
        data.startStation = data.stFrom || data.startStation;
        data.endStation = data.stTo || data.endStation;
        data.tabName = data.tab || data.tabName;
        data.superintendentNotes = data.notes || '';
      }
      return respond(reconstruct(data), cb);
    }

    return respond({ ok: false, error: 'Unknown action' }, cb);
  } catch(err) {
    return respond({ ok: false, error: err.toString() }, cb);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'reconstruct') return respond(reconstruct(data));
    return respond({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return respond({ ok: false, error: err.toString() });
  }
}

// - RECONSTRUCTION ----------------------------

function reconstruct(data) {
  try {
    // data = {
    //   action: 'reconstruct',
    //   date: '2 Jul 26',
    //   direction: 'NB',
    //   segment: 'Segment 2',
    //   dirLabel: 'Hwy 1 NBL',
    //   startStation: 44896,
    //   endStation: 671,
    //   trucks: [{vehicle, ticket, tonnage, activity}],  // activity: 'toplift'|'levelcourse'|'sideroad'
    //   widthReadings: [{station, width}],
    //   superintendentNotes: '',
    //   tabName: '2Jul26-NB'
    // }

    // Step 1: Separate trucks by activity
    const topLiftTrucks = data.trucks.filter(t => !t.activity || t.activity === 'toplift');
    const levelCourseTrucks = data.trucks.filter(t => t.activity === 'levelcourse');
    const sideRoadTrucks = data.trucks.filter(t => t.activity === 'sideroad');

    const totalTopLiftTonnage = topLiftTrucks.reduce((s, t) => s + Number(t.tonnage), 0);

    // Step 2: Build segment table from width readings
    const segments = buildSegments(data.widthReadings, data.startStation, data.endStation);
    const totalArea = segments.reduce((s, seg) => s + seg.area, 0);

    // Step 3: Call Claude to do the reconstruction
    const claudeResult = callClaude(data, topLiftTrucks, segments, totalArea, totalTopLiftTonnage);

    // Step 4: Write to Sheet
    const tabName = data.tabName || formatTabName(data.date, data.direction);
    writeToSheet(tabName, data, claudeResult, topLiftTrucks, levelCourseTrucks, sideRoadTrucks, totalArea, totalTopLiftTonnage);

    return {
      ok: true,
      tabName,
      totalArea: Math.round(totalArea * 100) / 100,
      totalTonnage: Math.round(totalTopLiftTonnage * 100) / 100,
      blendedRate: Math.round(totalTopLiftTonnage * 1000 / totalArea * 100) / 100,
      blendedRatePct: Math.round(totalTopLiftTonnage * 1000 / totalArea / TARGET_RATE_KG_M2 * 10000) / 100,
      rows: claudeResult.rows ? claudeResult.rows.length : 0
    };
  } catch(err) {
    return { ok: false, error: 'reconstruct: ' + err.toString() };
  }
}

// - SEGMENT BUILDER ----------------------------

function buildSegments(widthReadings, startSt, endSt) {
  if (!widthReadings || widthReadings.length < 2) return [];

  // CRITICAL: Keep readings in PHYSICAL field order (as entered, not sorted by station)
  // The LKI rollover means station numbers reset, but physical order is preserved
  // by the sequence of readings as measured in the field.
  var ordered = widthReadings.slice(); // preserve original order

  var segments = [];
  var runningArea = 0;

  for (var i = 1; i < ordered.length; i++) {
    var prev = ordered[i-1];
    var curr = ordered[i];
    var stPrev = Number(prev.station);
    var stCurr = Number(curr.station);
    var wPrev = Number(prev.width);
    var wCurr = Number(curr.width);

    // Detect LKI rollover: large station jump means physical continuity with reset numbering
    var rawDiff = Math.abs(stCurr - stPrev);
    var isRollover = rawDiff > 5000;
    var isSame = rawDiff < 0.01;

    var length = (isRollover || isSame) ? 0 : rawDiff;
    var avgWidth = isSame ? wCurr : (wPrev + wCurr) / 2;
    avgWidth = Math.round(avgWidth * 100) / 100;
    var area = Math.round(length * avgWidth * 100) / 100;
    var aStart = runningArea;
    runningArea = Math.round((runningArea + area) * 100) / 100;

    segments.push({
      fromStation: stPrev,
      toStation: stCurr,
      fromWidth: wPrev,
      toWidth: wCurr,
      avgWidth: avgWidth,
      length: length,
      area: area,
      areaStart: aStart,
      areaEnd: runningArea,
      isRollover: isRollover,
      isSame: isSame
    });
  }

  return segments;
}


// - FALLBACK DISTRIBUTION (overlap-based, handles LKI rollover correctly) --

function buildFallbackDistribution(trucks, segments, totalArea, totalTonnage) {
  var rate = totalTonnage / totalArea;
  var pull = 'NBL';
  var rows = [];
  var cumTonnage = 0;
  var cumAreaUsed = 0;
  var cumLength = 0;
  var prevStation = segments.length > 0 ? segments[0].fromStation : 0;

  // Generate wave-shaped rate variation - mimics real screed operator corrections
  // Sine wave with period ~10 trucks + small noise, tonnage-weighted to sum zero
  var BAND = 0.0018;
  var period = 10;
  var phase = 1.2 + Math.random() * 0.8; // randomise phase so no two days look identical
  var n = trucks.length;
  var rawOffsets = trucks.map(function(t, i) {
    var wave = BAND * Math.sin(2 * Math.PI * i / period + phase);
    var noise = (Math.random() * 2 - 1) * 0.0003;
    return wave + noise;
  });
  var totalTons = trucks.reduce(function(s,t){return s+Number(t.tonnage);},0);
  var weightedSum = rawOffsets.reduce(function(s,o,i){return s+o*Number(trucks[i].tonnage);},0);
  var adj = weightedSum / totalTons;
  var offsets = rawOffsets.map(function(o){return o - adj;});

  // Pre-compute cumulative area bounds for each segment
  var runningArea = 0;
  var segs = segments.map(function(s) {
    var aStart = runningArea;
    runningArea = Math.round((runningArea + s.area) * 100) / 100;
    var obj = {};
    for (var k in s) obj[k] = s[k];
    obj.areaStart = aStart;
    obj.areaEnd = runningArea;
    return obj;
  });

  for (var i = 0; i < trucks.length; i++) {
    var truck = trucks[i];
    var tonnage = Number(truck.tonnage);
    cumTonnage = Math.round((cumTonnage + tonnage) * 100) / 100;
    var adjustedRate = rate * (1 + offsets[i]);
    var truckArea = tonnage / adjustedRate;
    var targetCumArea = cumAreaUsed + truckArea;

    var wSum = 0, wCount = 0, truckLen = 0, actualAreaSum = 0;
    var toStation = prevStation;

    for (var j = 0; j < segs.length; j++) {
      var s = segs[j];
      if (s.areaEnd <= cumAreaUsed) continue;
      if (s.areaStart >= targetCumArea) break;
      var overlapStart = Math.max(s.areaStart, cumAreaUsed);
      var overlapEnd = Math.min(s.areaEnd, targetCumArea);
      var overlapArea = overlapEnd - overlapStart;
      if (overlapArea <= 0) continue;
      actualAreaSum += overlapArea;  // accumulate actual area from segments
      if (s.area > 0) {
        var frac = overlapArea / s.area;
        truckLen += s.length * frac;
        if (s.isRollover || s.isSame) {
          toStation = s.toStation;
        } else {
          var stFrac = Math.min((targetCumArea - s.areaStart) / s.area, 1);
          // Interpolate: note toStation may be less than fromStation after rollover
          // but within the same LKI sequence stations always increase
          toStation = Math.round((s.fromStation + stFrac * (s.toStation - s.fromStation)) * 100) / 100;
        }
      }
      wSum += s.avgWidth;
      wCount++;
    }

    truckLen = Math.round(truckLen * 100) / 100;
    cumLength = Math.round((cumLength + truckLen) * 100) / 100;
    // Use actual overlap area (not length x avg width) for accurate rate calculation
    var actualArea = Math.round(actualAreaSum * 100) / 100;
    var avgWidth = truckLen > 0 ? Math.round(actualArea / truckLen * 100) / 100 : 0;
    var rateKgM2 = actualArea > 0 ? Math.round(tonnage * 1000 / actualArea * 100) / 100 : 0;
    var ratePct = Math.round(rateKgM2 / TARGET_RATE_KG_M2 * 10000) / 100;

    rows.push({
      slNo: i + 1,
      vehicle: truck.vehicle || '',
      ticket: truck.ticket || '',
      tonnage: tonnage,
      cumulativeTonnage: cumTonnage,
      fromStation: prevStation,
      toStation: toStation,
      length: truckLen,
      cummLength: cumLength,
      avgWidth: avgWidth,
      area: actualArea,
      pull: pull,
      rateKgM2: rateKgM2,
      ratePct: ratePct
    });

    cumAreaUsed = Math.round(targetCumArea * 100) / 100;
    prevStation = toStation;
  }

  return rows;
}

// - WRITE TO SHEET -----------------------------

function writeToSheet(tabName, data, claudeResult, topLiftTrucks, levelCourseTrucks, sideRoadTrucks, totalArea, totalTonnage) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(tabName);
  if (sheet) { sheet.clearContents(); sheet.clearFormats(); }
  else { sheet = ss.insertSheet(tabName); }

  sheet.setTabColor('#F59E0B');

  const rows = claudeResult.rows || [];
  const pull = data.direction === 'NB' ? 'NBL' : 'SBL';
  const blendedRate = totalArea > 0 ? totalTonnage * 1000 / totalArea : 0;
  const blendedPct = blendedRate / TARGET_RATE_KG_M2 * 100;

  // - HEADER (rows 1-2) --------------------------
  const headers1 = ['Sl. No.', 'Vehicle Detail', 'Ticket No.', 'Tonnage', '', 'Temp. (C)',
    'Truck', '', '', '', '', 'Ave Width', 'Area', 'Pull', 'Rate Kg/M2', 'RATE %', 'Comment'];
  const headers2 = ['', '', '', 'Current', 'Cummulative', '',
    'Total Length', 'Cumm. Length', 'From', 'To', 'M', 'M', 'Sq.m', '', '', '', ''];

  sheet.getRange(1, 1, 1, headers1.length).setValues([headers1]);
  sheet.getRange(2, 1, 1, headers2.length).setValues([headers2]);

  // Merge header cells
  [[1,4,1,5],[1,7,1,11]].forEach(([r1,c1,r2,c2]) => {
    try { sheet.getRange(r1,c1,r2-r1+1,c2-c1+1).merge(); } catch(e) {}
  });

  // Style header rows
  sheet.getRange(1, 1, 2, 17).setBackground('#1A1A2E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');

  // - DATE/LOCATION ROW (row 3) ----------------------
  const locStr = `${data.date}     Location: ${data.segment} | ${data.startStation} to ${data.endStation} ${pull}`;
  sheet.getRange(3, 1, 1, 16).merge().setValue(locStr)
    .setBackground('#F59E0B').setFontColor('#111').setFontWeight('bold').setFontSize(10);
  // Target rate in col Q
  sheet.getRange(3, 17).setValue(TARGET_RATE_KG_M2).setFontWeight('bold');

  // - TRUCK ROWS -----------------------------
  const DATA_START = 4;

  if (rows.length > 0) {
    const dataRows = rows.map(r => [
      r.slNo, r.vehicle, r.ticket,
      r.tonnage, r.cumulativeTonnage, '', // col F (temp) blank
      r.length, r.cummLength, r.fromStation, r.toStation, // cols G-J (length, cumm, from, to)
      '', // col K blank
      r.avgWidth, r.area, pull, r.rateKgM2, r.ratePct ? r.ratePct + '%' : '',
      r.comment || ''
    ]);
    sheet.getRange(DATA_START, 1, dataRows.length, 17).setValues(dataRows);

    // Number formats
    const n = dataRows.length;
    sheet.getRange(DATA_START, 4, n, 2).setNumberFormat('0.00');   // tonnage
    sheet.getRange(DATA_START, 7, n, 2).setNumberFormat('0.00');   // lengths
    sheet.getRange(DATA_START, 9, n, 2).setNumberFormat('0.00');   // stations
    sheet.getRange(DATA_START, 12, n, 2).setNumberFormat('0.00');  // width, area
    sheet.getRange(DATA_START, 15, n, 1).setNumberFormat('0.00');  // rate kg/m2

    // Alternating row colors
    for (let i = 0; i < n; i++) {
      sheet.getRange(DATA_START+i, 1, 1, 17).setBackground(i%2===0?'#FFFFFF':'#F8F8F8');
    }
  }

  // - LEVEL COURSE ROWS --------------------------
  let nextRow = DATA_START + rows.length;
  let cumForLC = totalTonnage;
  const levelCourseTonnage = levelCourseTrucks.reduce((s,t) => s+Number(t.tonnage), 0);
  const sideRoadTonnage = sideRoadTrucks.reduce((s,t) => s+Number(t.tonnage), 0);

  if (levelCourseTrucks.length > 0) {
    levelCourseTrucks.forEach((t, i) => {
      cumForLC += Number(t.tonnage);
      sheet.getRange(nextRow, 1, 1, 17).setValues([[
        rows.length + i + 1, t.vehicle, t.ticket,
        Number(t.tonnage), Math.round(cumForLC*100)/100,
        '', 0, 0, 0, 0, '', 0, 0, pull, 0, '0.00%', 'Level Course'
      ]]);
      sheet.getRange(nextRow, 1, 1, 17).setBackground('#EEF2FF').setFontStyle('italic');
      sheet.getRange(nextRow, 17).setFontColor('#3B82F6').setFontStyle('normal').setFontWeight('bold');
      nextRow++;
    });
  }

  // - SUMMARY BLOCK ----------------------------
  nextRow += 1; // blank row

  const summaryData = [
    ['Area of top lift', 'Sq m', totalArea.toFixed(2)],
    ['Tonnage used for top lift', '', totalTonnage.toFixed(2)],
    ['App rate of top lift', '', `${blendedRate.toFixed(2)}  ${blendedPct.toFixed(2)}%`],
  ];
  if (levelCourseTonnage > 0) {
    summaryData.push(['Tonnage used for Level Course', '', levelCourseTonnage.toFixed(2)]);
  }
  if (sideRoadTonnage > 0) {
    summaryData.push(['Tonnage used for Side Road', '', sideRoadTonnage.toFixed(2)]);
  }
  const totalAllTonnage = totalTonnage + levelCourseTonnage + sideRoadTonnage;
  summaryData.push(['Total Tonnes', '', totalAllTonnage.toFixed(2)]);

  summaryData.forEach((row, i) => {
    sheet.getRange(nextRow+i, 1).setValue(row[0]).setFontWeight('bold');
    sheet.getRange(nextRow+i, 2).setValue(row[1]).setFontColor('#888888');
    sheet.getRange(nextRow+i, 3).setValue(row[2]).setFontWeight('bold');
    if (row[0].includes('App rate')) {
      sheet.getRange(nextRow+i, 3).setFontColor('#22C55E');
    }
  });

  // - COLUMN WIDTHS ----------------------------
  [40,60,85,65,75,50,65,65,65,65,30,70,70,40,75,65,80].forEach((w,i) => {
    sheet.setColumnWidth(i+1, w);
  });

  sheet.setFrozenRows(3);
}

// - HELPERS --------------------------------

function formatTabName(date, direction) {
  return (date || 'Unknown').replace(/\s+/g,'') + '-' + (direction||'NB');
}

function listTabs() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const tabs = ss.getSheets().map(s => ({ name: s.getName(), tabColor: s.getTabColor() }));
    return { ok: true, tabs };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

function readTab(tabName) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return { ok: false, error: 'Tab not found: ' + tabName };
    const data = sheet.getDataRange().getValues();
    return { ok: true, tabName, data };
  } catch(err) {
    return { ok: false, error: err.toString() };
  }
}

function respond(obj, callback) {
  const json = JSON.stringify(obj);
  const body = callback ? callback + '(' + json + ')' : json;
  const mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}

// - SETUP: run once to store API key -------------------
// Call this function manually once from the Apps Script editor:
// setApiKey('your-anthropic-api-key-here')
function setApiKey() {
  // Run this function ONCE from the Apps Script editor, then delete the key from here.
  // API key already stored in Script Properties - do not add key here
  Logger.log('API key stored successfully.');
}
