// Google Apps Script
// Sheet 1: "MapData"      — Google Maps scraped business data
// Sheet 2: "CFResults"    — Contact form fill results  (main.js)
// Sheet 3: "RetryResults" — Retry run results          (retry.js)

const MAP_SHEET   = 'RE_MapData';      // Real Estate scraped data
const CF_SHEET    = 'RE_CFResults';    // Contact form results
const RETRY_SHEET = 'RE_RetryResults'; // Retry results

const MAP_HEADERS = [
  'Index','Area','Keyword','Name','Rating','Reviews',
  'Address','Phone','Maps Website','Actual Website',
  'Contact Form URL','Maps URL','All Emails','Email Count','Timestamp'
];

const CF_HEADERS = [
  'URL','Status','Details','Load Status','Load Time(s)',
  'Contact Page','Form Status','Fields Filled',
  'Filled Fields','Failed Fields',
  'Validation','Captcha','Submit','Success','Timestamp'
];

// RetryResults uses same columns as CFResults + one extra to mark it as retry
const RETRY_HEADERS = [
  'URL','Status','Details','Load Status','Load Time(s)',
  'Contact Page','Form Status','Fields Filled',
  'Filled Fields','Failed Fields',
  'Validation','Captcha','Submit','Success','Timestamp'
];

// ── Sheet setup ───────────────────────────────────────────────────────────────
function getOrCreateSheet(name, headers, tabColor) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#4a86e8')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    if (tabColor) sheet.setTabColor(tabColor);
  }
  return sheet;
}

// ── POST handler ──────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents)
      return respond({ success: false, error: 'NO_DATA' });

    const body = JSON.parse(e.postData.contents);
    const type = body.type || 'map';

    if (type === 'map')   return handleMapData(body);
    if (type === 'cf')    return handleCFData(body);
    if (type === 'retry') return handleRetryData(body);
    return respond({ success: false, error: 'UNKNOWN_TYPE' });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// ── Map data handler ──────────────────────────────────────────────────────────
function handleMapData(body) {
  if (!body.rows || !Array.isArray(body.rows))
    return respond({ success: false, error: 'INVALID_ROWS' });

  const sheet = getOrCreateSheet(MAP_SHEET, MAP_HEADERS, '#4a86e8');
  const rows  = body.rows.map(r => {
    const row = [...r];
    if (!row[14]) row[14] = new Date().toISOString();
    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MAP_HEADERS.length)
       .setValues(rows);

  return respond({ success: true, inserted: rows.length, sheet: MAP_SHEET });
}

// ── CF results handler (main.js) ──────────────────────────────────────────────
function handleCFData(body) {
  if (!body.rows || !Array.isArray(body.rows))
    return respond({ success: false, error: 'INVALID_ROWS' });

  const sheet    = getOrCreateSheet(CF_SHEET, CF_HEADERS, '#6aa84f');
  const rows     = body.rows.map(r => { const row=[...r]; if(!row[14]) row[14]=new Date().toISOString(); return row; });
  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, rows.length, CF_HEADERS.length).setValues(rows);
  _colorRows(sheet, rows, startRow, CF_HEADERS.length);

  return respond({ success: true, inserted: rows.length, sheet: CF_SHEET });
}

// ── Retry results handler (retry.js) ─────────────────────────────────────────
function handleRetryData(body) {
  if (!body.rows || !Array.isArray(body.rows))
    return respond({ success: false, error: 'INVALID_ROWS' });

  const sheet    = getOrCreateSheet(RETRY_SHEET, RETRY_HEADERS, '#e69138');
  const rows     = body.rows.map(r => { const row=[...r]; if(!row[14]) row[14]=new Date().toISOString(); return row; });
  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, rows.length, RETRY_HEADERS.length).setValues(rows);
  _colorRows(sheet, rows, startRow, RETRY_HEADERS.length);

  return respond({ success: true, inserted: rows.length, sheet: RETRY_SHEET });
}

// ── Row color by status ───────────────────────────────────────────────────────
function _colorRows(sheet, rows, startRow, numCols) {
  rows.forEach((row, i) => {
    const status = (row[1] || '').toLowerCase();
    const color  = status === 'success' ? '#d9ead3'   // green
                 : status === 'partial' ? '#d0e0ff'   // blue
                 : status === 'skipped' ? '#fff2cc'   // yellow
                 : '#fce5cd';                          // orange = failed
    sheet.getRange(startRow + i, 1, 1, numCols).setBackground(color);
  });
}

// ── GET handler (stats for all sheets) ───────────────────────────────────────
function doGet() {
  try {
    const ss    = SpreadsheetApp.getActive();
    const mapSh = ss.getSheetByName(MAP_SHEET);
    const cfSh  = ss.getSheetByName(CF_SHEET);
    const rtSh  = ss.getSheetByName(RETRY_SHEET);

    return respond({
      status:       'OK',
      mapData:      _sheetStats(mapSh),
      cfResults:    _sheetStats(cfSh),
      retryResults: _sheetStats(rtSh),
      timestamp:    new Date().toISOString(),
    });
  } catch (err) {
    return respond({ status: 'ERROR', error: err.message });
  }
}

function _sheetStats(sheet) {
  if (!sheet) return { total: 0 };
  const total = Math.max(0, sheet.getLastRow() - 1);
  if (total === 0) return { total: 0 };
  let success = 0, partial = 0, failed = 0, skipped = 0;
  const data = sheet.getRange(2, 2, total, 1).getValues();
  data.forEach(([s]) => {
    const st = (s || '').toLowerCase();
    if      (st === 'success') success++;
    else if (st === 'partial') partial++;
    else if (st === 'skipped') skipped++;
    else                       failed++;
  });
  return { total, success, partial, failed, skipped };
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
