import { normBackend } from './formatters.js';

const KTI_TOKEN = 'poc-token-123';

function buildLedgerCollectionXml(company) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function sanitizeTallyXml(str) {
  // Remove numeric character references to chars invalid in XML 1.0
  // Valid: #x9, #xA, #xD, #x20-#xD7FF, #xE000-#xFFFD
  return str
    .replace(/&#(\d+);/g, (match, n) => {
      const c = parseInt(n, 10);
      if (c === 0x9 || c === 0xA || c === 0xD) return match;
      if (c >= 0x20 && c <= 0xD7FF) return match;
      if (c >= 0xE000 && c <= 0xFFFD) return match;
      return '';
    })
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function parseLedgerXml(xmlStr) {
  const doc = new DOMParser().parseFromString(sanitizeTallyXml(xmlStr), 'text/xml');
  // Tally returns ledger name in NAME attribute: <LEDGER NAME="Cash" ...>
  const names = [...doc.getElementsByTagName('LEDGER')]
    .map(el => (el.getAttribute('NAME') || '').trim())
    .filter(n => n && n !== '?');
  return [...new Set(names)].sort();
}

export async function fetchTallyLedgers(config, token, backendUrl) {
  const cfg = config || {};

  if (cfg.tally_mode === 'DIRECT_URL') {
    const url = normBackend(backendUrl) + '/tally/ledgers';
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || 'Failed to fetch ledgers from Tally');
    }
    const data = await res.json();
    return data.ledgers || [];
  }

  // LOCAL_CONNECTOR: POST collection XML directly from browser to connector
  if (!cfg.tally_company_name) throw new Error('Tally Company Name is not configured — save Config first.');
  const xml = buildLedgerCollectionXml(cfg.tally_company_name);
  const url = `http://localhost:${cfg.connector_port || 9988}/post-to-tally`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml', 'X-KTI-Token': KTI_TOKEN },
    body:    xml,
  });
  if (!res.ok) throw new Error(`Connector returned HTTP ${res.status}`);
  const text = await res.text();
  const names = parseLedgerXml(text);
  if (!names.length) throw new Error('No ledgers found in Tally response — is the company name correct?');
  return names;
}

export function parseTallyResponse(xmlStr) {
  const doc        = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const created    = parseInt(doc.querySelector('CREATED')?.textContent ?? '0', 10);
  const lineError  = (doc.querySelector('LINEERROR')?.textContent ?? '').trim();
  const combError  = (doc.querySelector('COMBINEDERROR')?.textContent ?? '').trim();
  if (created > 0 && !lineError && !combError) return { success: true };
  return { success: false, error: lineError || combError || 'Unknown Tally error' };
}

export async function postXmlToTally(xml, config, token, backendUrl) {
  const cfg = config || {};
  let url, headers;

  if (cfg.tally_mode === 'DIRECT_URL') {
    url     = normBackend(backendUrl) + '/tally/post';
    headers = { 'Content-Type': 'text/xml', 'Authorization': 'Bearer ' + token };
  } else {
    url     = `http://localhost:${cfg.connector_port || 9988}/post-to-tally`;
    headers = { 'Content-Type': 'text/xml', 'X-KTI-Token': KTI_TOKEN };
  }

  try {
    const res  = await fetch(url, { method: 'POST', headers, body: xml });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text).error || text; } catch (_) {}
      return { status: 'ERROR', response: msg };
    }
    const parsed = parseTallyResponse(text);
    return {
      status:   parsed.success ? 'POSTED' : 'ERROR',
      response: parsed.success ? text : (parsed.error + '\n\n' + text),
    };
  } catch (err) {
    const hint = cfg.tally_mode === 'DIRECT_URL'
      ? 'is the backend reachable (ngrok up)?'
      : 'is connector.py running on the VM?';
    return { status: 'CONNECTOR_OFFLINE', response: err.message + ' — ' + hint };
  }
}
