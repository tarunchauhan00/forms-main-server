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

// Given the form sheet name, derive a log sheet name.
const getLogSheetName = (sheetName) => `${sheetName} - Log`;

// Ensure the log sheet exists; if not, create it and add headers.
const ensureLogSheetExists = async (spreadsheetId, formSheetName) => {
  const logSheetName = getLogSheetName(formSheetName);
  const sheetResponse = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetsList = sheetResponse.data.sheets || [];
  const sheetExists = sheetsList.some(
    (sheet) => sheet.properties.title === logSheetName
  );
  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: logSheetName },
            },
          },
        ],
      },
    });
    // Add header row to the log sheet.
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${logSheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["Submission ID", "Update Timestamp", "User ID", "User Email", "Change Description"]],
      },
    });
  }
  return logSheetName;
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  
  try {
    const body = JSON.parse(event.body);
    // Expected parameters:
    // spreadsheetId, formSheetName, submissionId, updateTimestamp, updatedById, updatedByEmail, changeDescription
    const { spreadsheetId, formSheetName, submissionId, updateTimestamp, updatedById, updatedByEmail, changeDescription } = body;
    
    if (!spreadsheetId || !formSheetName || !submissionId || !updateTimestamp || !updatedById || !updatedByEmail || !changeDescription) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing required parameters." }),
      };
    }
    
    // Derive and ensure the log sheet exists for this form sheet.
    const logSheetName = await ensureLogSheetExists(spreadsheetId, formSheetName);
    
    // Append the log entry (5 columns)
    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${logSheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[submissionId, updateTimestamp, updatedById, updatedByEmail, changeDescription]],
      },
    });
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ result: appendResponse.data }),
    };
  } catch (error) {
    console.error("Error logging form change:", error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to log form change." }),
    };
  }
};
