// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
// Allow both local dev and production frontend
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-frontend-domain.com' // change to your real deployed frontend URL
];

/**
 * CORS middleware:
 * - echoes allowed origin
 * - sets Access-Control-Allow-* headers
 * - short-circuits OPTIONS preflights with 204
 *
 * This is robust across Express versions and avoids path-to-regexp issues.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    // Echo the requesting origin (more secure than '*')
    res.setHeader('Access-Control-Allow-Origin', origin);
    // Tell caches that the response varies based on Origin header
    res.setHeader('Vary', 'Origin');
  } else {
    // Optional: allow non-browser tools (curl/postman) by not setting origin header
    // res.setHeader('Access-Control-Allow-Origin', '*');
  }

  // Allow common methods and requested headers
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.header('Access-Control-Request-Headers') || 'Content-Type,Authorization,Accept'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Respond to preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Load your existing Netlify function modules
console.log('Loading submit.js');
const submitFn = require('./functions/submit.js').handler;

console.log('Loading getSheets.js');
const getSheetsFn = require('./functions/getSheets.js').handler;

console.log('Loading getSheetData.js');
const getSheetDataFn = require('./functions/getSheetData.js').handler;

console.log('Loading updateSheetRow.js');
const updateSheetRowFn = require('./functions/updateSheetRow.js').handler;

console.log('Loading deleteSheetRow.js');
const deleteSheetRowFn = require('./functions/deleteSheetRow.js').handler;

console.log('Loading logFormChange.js');
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

    // copy headers from function result (these will overwrite any earlier headers)
    Object.entries(headers).forEach(([k, v]) => {
      try { res.setHeader(k, v); } catch (e) {}
    });

    if (result.body === undefined || result.body === null || result.body === '') {
      return res.status(status).end();
    }

    if (typeof result.body === 'string') {
      try {
        const parsed = JSON.parse(result.body);
        return res.status(status).json(parsed);
      } catch (e) {
        return res.status(status).send(result.body);
      }
    }

    return res.status(status).json(result.body);
  } catch (err) {
    console.error('Error running handler:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

app.get('/', (req, res) => res.json({ ok: true, message: 'Express wrapper for Netlify functions' }));

app.get('/getSheets', async (req, res) => runHandler(getSheetsFn, req, res));
app.get('/getSheetData', async (req, res) => runHandler(getSheetDataFn, req, res));
app.post('/submit', async (req, res) => runHandler(submitFn, req, res));
app.post('/updateSheetRow', async (req, res) => runHandler(updateSheetRowFn, req, res));
app.post('/deleteSheetRow', async (req, res) => runHandler(deleteSheetRowFn, req, res));
app.post('/logFormChange', async (req, res) => runHandler(logFormChangeFn, req, res));

app.get('/_health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
