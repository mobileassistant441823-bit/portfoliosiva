// ============================================================
//  Netlify Serverless Function — API Proxy
//  உங்க secret keys இங்க மட்டும் இருக்கும்
//  Browser inspect பண்ணினாலும் இந்த file தெரியாது
// ============================================================
//
//  Netlify Dashboard → Site Settings → Environment Variables-ல
//  இந்த இரண்டையும் add பண்ணுங்க:
//
//    JSONBIN_KEY   =  உங்க jsonbin.io Master Key
//    ADMIN_PASS    =  உங்க admin password (எதுவும் வையுங்க)
//
// ============================================================

const JSONBIN_KEY = process.env.JSONBIN_KEY;
const ADMIN_PASS  = process.env.ADMIN_PASS || 'admin123';
const BIN_ID_KEY  = 'JSONBIN_BIN_ID'; // Netlify env var for bin ID

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path   = event.path.replace('/.netlify/functions/api', '') || '/';
  const method = event.httpMethod;

  // ── AUTH CHECK (for write operations) ──────────────────────
  function isAuthed() {
    const token = (event.headers['x-admin-token'] || '').trim();
    return token === ADMIN_PASS;
  }

  // ── GET /data — load portfolio data ────────────────────────
  if (method === 'GET' && path === '/data') {
    const binId = process.env[BIN_ID_KEY];
    if (!binId) {
      return { statusCode: 200, headers, body: JSON.stringify({ exists: false }) };
    }
    try {
      const res  = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_KEY }
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ exists: true, data: data.record }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Fetch failed' }) };
    }
  }

  // ── POST /auth — verify password ───────────────────────────
  if (method === 'POST' && path === '/auth') {
    const body = JSON.parse(event.body || '{}');
    if (body.password === ADMIN_PASS) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false }) };
  }

  // ── PUT /data — save portfolio data (auth required) ────────
  if (method === 'PUT' && path === '/data') {
    if (!isAuthed()) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const payload = JSON.parse(event.body || '{}');
    const binId   = process.env[BIN_ID_KEY];

    try {
      if (binId) {
        // Update existing bin
        await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
          body:    JSON.stringify(payload)
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      } else {
        // Create new bin
        const res  = await fetch('https://api.jsonbin.io/v3/b', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'X-Master-Key':  JSONBIN_KEY,
            'X-Bin-Name':    'portfolio-data',
            'X-Bin-Private': 'true'
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const newId = data.metadata?.id;
        // NOTE: After first save, manually add JSONBIN_BIN_ID to Netlify env vars
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, newBinId: newId, message: `Add JSONBIN_BIN_ID=${newId} to Netlify env vars!` })
        };
      }
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Save failed' }) };
    }
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
};
