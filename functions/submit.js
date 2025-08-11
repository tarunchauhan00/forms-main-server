const { google } = require("googleapis");
require("dotenv").config(); // Load environment variables

// Validate required environment variables
const requiredEnvVars = [
  "GOOGLE_TYPE",
  "GOOGLE_PROJECT_ID",
  "GOOGLE_PRIVATE_KEY_ID",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_AUTH_URI",
  "GOOGLE_TOKEN_URI",
  "GOOGLE_AUTH_PROVIDER_X509_CERT_URL",
  "GOOGLE_CLIENT_X509_CERT_URL",
];

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

// Google authentication configuration
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
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
});

const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

// Helper function to flatten nested objects
const flattenData = (data, parent = "") => {
  const flattened = {};
  for (const key in data) {
    if (typeof data[key] === "object" && data[key] !== null) {
      Object.assign(flattened, flattenData(data[key], `${parent}${key}_`));
    } else {
      flattened[`${parent}${key}`] = data[key];
    }
  }
  return flattened;
};

// Ensure the sheet exists (create if not)
const ensureSheetExists = async (spreadsheetId, sheetTitle) => {
  try {
    const sheetResponse = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = sheetResponse.data.sheets || [];
    const sheetExists = sheetsList.some(
      (sheet) => sheet.properties.title === sheetTitle
    );
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetTitle },
              },
            },
          ],
        },
      });
    }
  } catch (error) {
    console.error("Error ensuring sheet existence:", error.message);
    throw new Error("Failed to ensure the existence of the sheet.");
  }
};

// Function to upload a file to Google Drive
const uploadToGoogleDrive = async (fileBuffer, mimeType, fileName) => {
  try {
    const uniqueFileName = `${Date.now()}_${fileName}`;
    const filePath = `/tmp/${uniqueFileName}`;
    const fs = require("fs");
    fs.writeFileSync(filePath, fileBuffer);

    const res = await drive.files.create({
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
      requestBody: {
        name: uniqueFileName,
        mimeType,
        parents: ["1buMY25JIfET--7En1xrnT3P5tr9aWtfb"],
      },
    });

    const fileId = res.data.id;
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
    fs.unlinkSync(filePath);

    return `https://drive.google.com/uc?id=${fileId}`;
  } catch (error) {
    console.error("Error uploading file to Google Drive:", error.message);
    throw new Error("Failed to upload file to Google Drive.");
  }
};

exports.handler = async (event) => {
  // Handle preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Method Not Allowed",
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Invalid JSON",
    };
  }

  // File-only upload mode.
  if (body.file && body.fileName && body.mimeType && !body.spreadsheetId && !body.form_title) {
    try {
      const fileBuffer = Buffer.from(body.file, "base64");
      const fileUrl = await uploadToGoogleDrive(fileBuffer, body.mimeType, body.fileName);
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ fileUrl }),
      };
    } catch (error) {
      console.error("Error in file-only upload:", error.message);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Failed to upload file.",
      };
    }
  }

  // Form submission mode.
  if (!body.spreadsheetId || typeof body.spreadsheetId !== "string" ||
      !body.form_title || typeof body.form_title !== "string") {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Invalid data provided. Ensure 'spreadsheetId' and 'form_title' are valid strings.",
    };
  }

  try {
    let fileUrl = null;
    if (body.file && body.fileName && body.mimeType) {
      const fileBuffer = Buffer.from(body.file, "base64");
      fileUrl = await uploadToGoogleDrive(fileBuffer, body.mimeType, body.fileName);
    }

    const sheetTitle = body.form_title;
    await ensureSheetExists(body.spreadsheetId, sheetTitle);

    // Add a submission timestamp
    const submissionTimestamp = new Date().toISOString();
    body.timestamp = submissionTimestamp;

    const { spreadsheetId, form_title, file, fileName, mimeType, ...rawData } = body;
    const data = flattenData(rawData);
    const headersArr = Object.keys(data).concat("timestamp");
    const valuesArr = Object.values(data).concat(submissionTimestamp);

    // Get existing headers (if any)
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: body.spreadsheetId,
      range: `${sheetTitle}!A1:Z1`,
    });

    const existingHeaders = readResponse.data.values?.[0] || [];
    if (!existingHeaders.length) {
      // Append headers (including timestamp)
      await sheets.spreadsheets.values.append({
        spreadsheetId: body.spreadsheetId,
        range: `${sheetTitle}!A1`,
        valueInputOption: "RAW",
        resource: { values: [headersArr] },
      });
    }

    // Append form data (with timestamp)
    await sheets.spreadsheets.values.append({
      spreadsheetId: body.spreadsheetId,
      range: `${sheetTitle}!A2`,
      valueInputOption: "RAW",
      resource: { values: [valuesArr] },
    });

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        message: `Data saved to sheet "${sheetTitle}" in spreadsheet "${body.spreadsheetId}".`,
        fileUrl,
        appendedRows: 1,
      }),
    };
  } catch (error) {
    console.error("Error writing to Google Sheets:", error.message, error.stack);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Failed to save data.",
    };
  }
};
