// Google Apps Script
// Sheet 1: "MapData"     — Google Maps scraped business data
// Sheet 2: "CFResults"   — Contact form fill results

const MAP_SHEET = 'MapData';
const CF_SHEET  = 'CFResults';

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

// ── Sheet setup ───────────────────────────────────────────────────────────────
function getOrCreateSheet(name, headers) {
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

    if (type === 'map') return handleMapData(body);
    if (type === 'cf')  return handleCFData(body);
    return respond({ success: false, error: 'UNKNOWN_TYPE' });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// ── Map data handler ──────────────────────────────────────────────────────────
function handleMapData(body) {
  if (!body.rows || !Array.isArray(body.rows))
    return respond({ success: false, error: 'INVALID_ROWS' });

  const sheet = getOrCreateSheet(MAP_SHEET, MAP_HEADERS);
  const rows  = body.rows.map(r => {
    const row = [...r];
    if (!row[14]) row[14] = new Date().toISOString();
    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MAP_HEADERS.length)
       .setValues(rows);

  return respond({ success: true, inserted: rows.length, sheet: MAP_SHEET });
}

// ── CF results handler ────────────────────────────────────────────────────────
function handleCFData(body) {
  if (!body.rows || !Array.isArray(body.rows))
    return respond({ success: false, error: 'INVALID_ROWS' });

  const sheet = getOrCreateSheet(CF_SHEET, CF_HEADERS);
  const rows  = body.rows.map(r => {
    const row = [...r];
    if (!row[14]) row[14] = new Date().toISOString();
    // Color row by status
    return row;
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, CF_HEADERS.length).setValues(rows);

  // Color by status
  rows.forEach((row, i) => {
    const status = (row[1] || '').toLowerCase();
    const color  = status === 'success' ? '#d9ead3'
                 : status === 'skipped' ? '#fff2cc'
                 : '#fce5cd';
    sheet.getRange(startRow + i, 1, 1, CF_HEADERS.length).setBackground(color);
  });

  return respond({ success: true, inserted: rows.length, sheet: CF_SHEET });
}

// ── GET handler (stats) ───────────────────────────────────────────────────────
function doGet() {
  try {
    const ss      = SpreadsheetApp.getActive();
    const mapSh   = ss.getSheetByName(MAP_SHEET);
    const cfSh    = ss.getSheetByName(CF_SHEET);
    const mapRows = mapSh ? Math.max(0, mapSh.getLastRow() - 1) : 0;
    const cfRows  = cfSh  ? Math.max(0, cfSh.getLastRow()  - 1) : 0;

    let success = 0, failed = 0, skipped = 0;
    if (cfSh && cfRows > 0) {
      const data = cfSh.getRange(2, 2, cfRows, 1).getValues();
      data.forEach(([s]) => {
        const st = (s || '').toLowerCase();
        if (st === 'success') success++;
        else if (st === 'skipped') skipped++;
        else failed++;
      });
    }

    return respond({
      status: 'OK',
      mapData:    { total: mapRows },
      cfResults:  { total: cfRows, success, failed, skipped },
      timestamp:  new Date().toISOString()
    });
  } catch (err) {
    return respond({ status: 'ERROR', error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
