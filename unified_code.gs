// Google Apps Script for Unified Salesforce Data Management
// Single sheet with company data and emails in same row

const UNIFIED_SHEET = "SalesforceUnified";

// =====================================
// UNIFIED SHEET SETUP
// =====================================
function setupUnifiedSheet() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(UNIFIED_SHEET);

  if (!sheet) sheet = ss.insertSheet(UNIFIED_SHEET);

  const headers = [
    "Index", "Area", "Keyword", "Name", "Rating", "Reviews",
    "Address", "Phone", "Maps Website", "Actual Website", "Contact Form URL", "Maps URL", "All Emails", "Email Count", "Timestamp"
  ];

  const row = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const headerMissing = row.every(cell => !cell || cell.trim() === "");

  if (headerMissing) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  return sheet;
}

// =====================================
// POST HANDLER
// =====================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ success: false, error: "NO_DATA_RECEIVED" });
    }

    const body = JSON.parse(e.postData.contents);
    return handleUnifiedData(body);

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// =====================================
// HANDLE UNIFIED DATA
// =====================================
function handleUnifiedData(body) {
  if (!body.rows || !Array.isArray(body.rows)) {
    return respond({ success: false, error: "INVALID_ROWS" });
  }

  const sheet = setupUnifiedSheet();
  const startRow = sheet.getLastRow() + 1;

  const rowsWithTimestamp = body.rows.map(row => {
    const newRow = [...row];
    if (newRow.length < 15) {
      newRow[14] = new Date(); // Add timestamp if not present
    }
    return newRow;
  });

  sheet.getRange(startRow, 1, rowsWithTimestamp.length, 15)
        .setValues(rowsWithTimestamp);

  return respond({ 
    success: true, 
    inserted: body.rows.length,
    totalRows: sheet.getLastRow() - 1
  });
}

// =====================================
// GET HANDLER
// =====================================
function doGet() {
  try {
    const ss = SpreadsheetApp.getActive();
    
    let totalRows = 0;
    let totalEmails = 0;
    
    const sheet = ss.getSheetByName(UNIFIED_SHEET);
    if (sheet) {
      totalRows = Math.max(0, sheet.getLastRow() - 1);
      
      // Count total emails
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const emailCount = parseInt(data[i][13]) || 0; // Email Count column (now index 13)
        totalEmails += emailCount;
      }
    }
    
    return respond({ 
      status: "OK", 
      message: "Unified Salesforce Data System Ready",
      stats: {
        companies: totalRows,
        totalEmails: totalEmails
      },
      timestamp: new Date()
    });
  } catch (error) {
    return respond({ 
      status: "ERROR", 
      error: error.message 
    });
  }
}

// =====================================
// UTILITY FUNCTIONS
// =====================================
function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================
// TEST FUNCTIONS
// =====================================
function testUnifiedData() {
  const testData = {
    rows: [[
      1, "New York", "salesforce consulting", "Test Company", "4.5", "100",
      "123 Test St", "555-1234", "https://maps-website.com", "https://actual-website.com", "https://contact-form.com", "https://maps.google.com/test",
      "contact@test.com; sales@test.com", "2", new Date()
    ]]
  };
  
  const result = handleUnifiedData(testData);
  console.log('Unified test result:', result.getContent());
}

function getStats() {
  const result = doGet();
  console.log('Stats:', result.getContent());
}