const { google } = require("googleapis");
require("dotenv").config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }
  
  try {
    const body = JSON.parse(event.body);
    const { spreadsheetId, sheetName, rowIndex } = body;
    
    if (!spreadsheetId || !sheetName || rowIndex === undefined) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing required parameters." }),
      };
    }

    // First get the sheetId using the sheet name.
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets.find(
      (s) => s.properties.title === sheetName
    );
    if (!sheet) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Sheet not found." }),
      };
    }
    const sheetId = sheet.properties.sheetId;

    // For deletion, Google Sheets expects 0-indexed row numbers.
    // If rowIndex was passed as a 1-indexed value (with header as row 1),
    // subtract 1.
    const startIndex = rowIndex - 1;
    const endIndex = rowIndex;

    const batchUpdateRequest = {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex,
              endIndex,
            },
          },
        },
      ],
    };

    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: batchUpdateRequest,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ result: response.data }),
    };
  } catch (error) {
    console.error("Error deleting sheet row:", error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to delete sheet row." }),
    };
  }
};
