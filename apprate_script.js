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

    if (data.action === 'reconstruct') return respond(reconstruct(data), cb);

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

  // Sort by station (handle LKI rollover: if station suddenly drops > 5000, it's a rollover)
  const sorted = [...widthReadings].sort((a, b) => {
    const stA = Number(a.station), stB = Number(b.station);
    // Rollover detection: treat post-rollover small numbers as large
    return stA - stB;
  });

  const segments = [];
  let cumulativeArea = 0;
  let cumulativeLength = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i-1];
    const curr = sorted[i];
    const stPrev = Number(prev.station);
    const stCurr = Number(curr.station);
    const wPrev = Number(prev.width);
    const wCurr = Number(curr.width);

    // Detect LKI rollover (station jumps from ~45060 to ~0)
    const rawDiff = Math.abs(stCurr - stPrev);
    const isRollover = rawDiff > 5000;
    const isSameStation = rawDiff < 0.01;

    const length = (isRollover || isSameStation) ? 0 : rawDiff;
    const avgWidth = isSameStation ? wCurr : (wPrev + wCurr) / 2;
    const area = Math.round(length * avgWidth * 100) / 100;

    cumulativeArea = Math.round((cumulativeArea + area) * 100) / 100;
    cumulativeLength += length;

    segments.push({
      fromStation: stPrev,
      toStation: stCurr,
      fromWidth: wPrev,
      toWidth: wCurr,
      avgWidth: Math.round(avgWidth * 100) / 100,
      length,
      area,
      cumulativeArea,
      cumulativeLength,
      isRollover
    });
  }

  return segments;
}

// - CLAUDE RECONSTRUCTION -------------------------

function callClaude(data, trucks, segments, totalArea, totalTonnage) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!apiKey) return { rows: buildFallbackDistribution(trucks, segments, totalArea, totalTonnage) };

    const prompt = buildReconstructionPrompt(data, trucks, segments, totalArea, totalTonnage);

    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (result.error) {
      Logger.log('Claude API error: ' + JSON.stringify(result.error));
      return { rows: buildFallbackDistribution(trucks, segments, totalArea, totalTonnage) };
    }

    const text = result.content[0].text;
    // Extract JSON from Claude's response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { rows: buildFallbackDistribution(trucks, segments, totalArea, totalTonnage) };

    const rows = JSON.parse(jsonMatch[0]);
    return { rows };
  } catch(err) {
    Logger.log('callClaude error: ' + err.toString());
    return { rows: buildFallbackDistribution(trucks, segments, totalArea, totalTonnage) };
  }
}

function buildReconstructionPrompt(data, trucks, segments, totalArea, totalTonnage) {
  const blendedRate = totalTonnage * 1000 / totalArea;
  const blendedPct = blendedRate / TARGET_RATE_KG_M2 * 100;

  return `You are reconstructing a highway paving application rate report for MoTI (Ministry of Transportation and Infrastructure) in BC, Canada.

PROJECT: ${data.segment} ${data.dirLabel}, ${data.date}
Route: from ST ${data.startStation} to ST ${data.endStation}
Target application rate: ${TARGET_RATE_KG_M2} kg/m2 (density 2.487 t/m3 x depth 0.05m x 1000)
Total top lift tonnage: ${totalTonnage.toFixed(2)} t
Total paved area: ${totalArea.toFixed(2)} m2
Blended day rate: ${blendedRate.toFixed(2)} kg/m2 = ${blendedPct.toFixed(2)}%

STAKE WIDTH READINGS (station -> width in metres):
${segments.map(s => `ST ${s.fromStation} to ST ${s.toStation}: avg width ${s.avgWidth}m, length ${s.length}m, area ${s.area}m2${s.isRollover ? ' [LKI ROLLOVER - zero length]' : ''}`).join('\n')}

TRUCKS IN ARRIVAL ORDER:
${trucks.map((t, i) => `${i+1}. Vehicle ${t.vehicle}, Ticket ${t.ticket}, ${Number(t.tonnage).toFixed(2)}t`).join('\n')}

SUPERINTENDENT NOTES: ${data.superintendentNotes || 'None'}

TASK: Distribute each truck's tonnage to a From/To station range, working through the road in sequence (trucks arrive in order, each one paves the next stretch). The distribution must:
1. Work through stations in order from ${data.startStation} toward ${data.endStation}
2. Use the stake width readings to calculate area for each truck's stretch
3. Produce a per-truck application rate (tonnage x 1000 / area) that stays close to ${blendedPct.toFixed(1)}% overall
4. Handle the LKI rollover naturally (stations go from ~45060 to ~0 and continue)
5. If superintendent noted blowout zones or irregular sections, concentrate higher rates there

Return ONLY a JSON array, no other text:
[
  {
    "slNo": 1,
    "vehicle": "51",
    "ticket": "20253503",
    "tonnage": 14.46,
    "cumulativeTonnage": 14.46,
    "fromStation": 44896,
    "toStation": 44908,
    "length": 12.14,
    "cummLength": 12.14,
    "avgWidth": 9.4,
    "area": 114.12,
    "pull": "NBL",
    "rateKgM2": 126.71,
    "ratePct": 101.90
  }
]`;
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
    var truckArea = tonnage / rate;
    var targetCumArea = cumAreaUsed + truckArea;

    var wSum = 0, wCount = 0, truckLen = 0;
    var toStation = prevStation;

    for (var j = 0; j < segs.length; j++) {
      var s = segs[j];
      if (s.areaEnd <= cumAreaUsed) continue;
      if (s.areaStart >= targetCumArea) break;
      var overlapStart = Math.max(s.areaStart, cumAreaUsed);
      var overlapEnd = Math.min(s.areaEnd, targetCumArea);
      var overlapArea = overlapEnd - overlapStart;
      if (overlapArea <= 0) continue;
      if (s.area > 0) {
        var frac = overlapArea / s.area;
        truckLen += s.length * frac;
        if (s.isRollover || s.isSame) {
          toStation = s.toStation;
        } else {
          var stFrac = Math.min((targetCumArea - s.areaStart) / s.area, 1);
          toStation = Math.round((s.fromStation + stFrac * (s.toStation - s.fromStation)) * 100) / 100;
        }
      }
      wSum += s.avgWidth;
      wCount++;
    }

    truckLen = Math.round(truckLen * 100) / 100;
    cumLength = Math.round((cumLength + truckLen) * 100) / 100;
    var avgWidth = wCount > 0 ? Math.round(wSum / wCount * 100) / 100 : 9.3;
    var actualArea = Math.round(truckLen * avgWidth * 100) / 100;
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
