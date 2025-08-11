// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Load your existing Netlify function modules
// (assumes you keep the `functions/` directory as in the zip)
const submitFn = require('./functions/submit.js').handler;
const getSheetsFn = require('./functions/getSheets.js').handler;
const getSheetDataFn = require('./functions/getSheetData.js').handler;
const updateSheetRowFn = require('./functions/updateSheetRow.js').handler;
const deleteSheetRowFn = require('./functions/deleteSheetRow.js').handler;
const logFormChangeFn = require('./functions/logFormChange.js').handler;

// Helper: build a Netlify-style `event` object from Express req
function makeEvent(req) {
  const event = {
    httpMethod: req.method,
    headers: req.headers || {},
    queryStringParameters: Object.keys(req.query).length ? req.query : null,
    pathParameters: req.params || null,
  };

  if (req.body && Object.keys(req.body).length > 0) {
    // Netlify functions expect event.body to be a string for JSON bodies
    try {
      event.body = JSON.stringify(req.body);
    } catch (e) {
      event.body = req.body;
    }
  }

  return event;
}

// Helper: call a Netlify handler and translate its response to Express
async function runHandler(handler, req, res) {
  try {
    const event = makeEvent(req);
    const result = await handler(event);

    if (!result) {
      return res.status(500).json({ error: 'Function did not return a result.' });
    }

    const status = result.statusCode || 200;
    const headers = result.headers || {};

    // set headers
    Object.entries(headers).forEach(([k, v]) => {
      try { res.setHeader(k, v); } catch (e) {}
    });

    // send body (try to parse JSON if possible)
    if (result.body === undefined || result.body === null || result.body === '') {
      return res.status(status).end();
    }

    // Many of your Netlify functions return JSON.stringify(...) as body
    if (typeof result.body === 'string') {
      try {
        const parsed = JSON.parse(result.body);
        return res.status(status).json(parsed);
      } catch (e) {
        return res.status(status).send(result.body);
      }
    }

    // body is already an object
    return res.status(status).json(result.body);
  } catch (err) {
    console.error('Error running handler:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

// Route mapping (match the function names)
app.get('/', (req, res) => res.json({ ok: true, message: 'Express wrapper for Netlify functions' }));

app.get('/getSheets', async (req, res) => runHandler(getSheetsFn, req, res));
app.get('/getSheetData', async (req, res) => runHandler(getSheetDataFn, req, res));
app.post('/submit', async (req, res) => runHandler(submitFn, req, res));
app.post('/updateSheetRow', async (req, res) => runHandler(updateSheetRowFn, req, res));
app.post('/deleteSheetRow', async (req, res) => runHandler(deleteSheetRowFn, req, res));
app.post('/logFormChange', async (req, res) => runHandler(logFormChangeFn, req, res));

// Health check
app.get('/_health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});