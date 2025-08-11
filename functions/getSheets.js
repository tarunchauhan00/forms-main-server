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
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  console.log("Event received:", event);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  // Require the spreadsheetId to be provided via query parameters
  const spreadsheetId =
    event.queryStringParameters && event.queryStringParameters.spreadsheetId;
  if (!spreadsheetId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing required spreadsheetId parameter." }),
    };
  }

  // Optionally, get the sheet name (i.e. form title) from the query parameters
  const formSheetTitle =
    event.queryStringParameters && event.queryStringParameters.sheetName;

  try {
    const response = await sheets.spreadsheets.get({ spreadsheetId });
    let sheetsList = response.data.sheets.map(
      (sheet) => sheet.properties.title
    );

    // If a formSheetTitle is provided, filter to that sheet
    if (formSheetTitle) {
      sheetsList = sheetsList.filter((title) => title === formSheetTitle);
    }
    
    console.log("Sheets fetched:", sheetsList);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ sheets: sheetsList }),
    };
  } catch (error) {
    console.error("Error fetching sheet names:", error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to fetch sheet names." }),
    };
  }
};
