// Password-checked data endpoint. The shipment data is never part of the static site.
// Source: the SharePoint workbook when the MS_* settings exist, otherwise the bundled shipments.json.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const S = require('../../public/shared/shipments.js');

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

const digest = v => crypto.createHash('sha256').update(String(v)).digest();
const samePassword = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function bundled() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'shipments.json'), 'utf8'));
}

async function fromSharePoint(known) {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, SP_FILE_URL } = process.env;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials'
    })
  });
  if (!tokenRes.ok) throw new Error('Microsoft sign-in failed (' + tokenRes.status + ')');
  const { access_token } = await tokenRes.json();
  const headers = { Authorization: 'Bearer ' + access_token };
  const shareId = 'u!' + Buffer.from(SP_FILE_URL).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  const base = 'https://graph.microsoft.com/v1.0/shares/' + shareId + '/driveItem';
  const [meta, file] = await Promise.all([
    fetch(base + '?$select=lastModifiedDateTime', { headers }),
    fetch(base + '/content', { headers })
  ]);
  if (!file.ok) throw new Error('SharePoint file could not be read (' + file.status + ')');
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
  const parsed = S.parseWorkbook(XLSX, wb, known);
  if (!parsed.rows.length) throw new Error('No shipment rows found in the SharePoint file');
  let updated = new Date();
  if (meta.ok) { const m = await meta.json(); if (m.lastModifiedDateTime) updated = new Date(m.lastModifiedDateTime); }
  return { rows: parsed.rows, updatedLabel: S.fmtTs(Date.UTC(updated.getUTCFullYear(), updated.getUTCMonth(), updated.getUTCDate())) };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!process.env.SITE_PASSWORD) return reply(500, { error: 'SITE_PASSWORD is not set in Netlify.' });
  let password = '';
  try { password = JSON.parse(event.body || '{}').password || ''; } catch (e) { /* ignore */ }
  if (!samePassword(password, process.env.SITE_PASSWORD)) return reply(401, { error: 'Wrong password.' });

  const fallback = bundled();
  const sharepointReady = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SP_FILE_URL'].every(k => process.env[k]);
  if (!sharepointReady) return reply(200, { rows: fallback, updatedLabel: '29 Sep 2026', source: 'bundled' });
  try {
    const sp = await fromSharePoint(fallback);
    return reply(200, { rows: sp.rows, updatedLabel: sp.updatedLabel, source: 'sharepoint' });
  } catch (e) {
    return reply(200, { rows: fallback, updatedLabel: '29 Sep 2026', source: 'bundled', warning: 'SharePoint could not be read, so older data is shown. ' + e.message });
  }
};
