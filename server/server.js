// server/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

// === Konfig (från .env) ===
const BASE = process.env.MUNTRA_API_BASE;                 // t.ex. https://api.muntra.se
const TOKEN = process.env.MUNTRA_API_TOKEN;               // din hemliga token
const CLINIC_ID = process.env.MUNTRA_CLINIC_ID || '7241'; // din klinik
const DEFAULT_ORGANIZER_ID = process.env.DEFAULT_ORGANIZER_ID || '2830';
const PORT = process.env.PORT || 2070;

// === Personnummer-normalisering ===
function normalizeSSN10(ssn) {
  const digits = String(ssn || '').replace(/\D/g, '');
  if (digits.length === 12) return digits.slice(2);   // YYYYMMDDNNNN -> YYMMDDNNNN
  if (digits.length === 11) return digits.slice(1);   // YYYMMDDNNNN? -> YYMMDDNNNN
  if (digits.length === 10) return digits;            // YYMMDDNNNN
  return null;
}

function normalizeSSN12(ssn) {
  const digits = String(ssn || '').replace(/\D/g, '');
  if (digits.length === 12) return digits;            // redan YYYYMMDDNNNN
  if (digits.length === 11) return '0' + digits;      // defensiv fallback

  if (digits.length === 10) {
    // Bestäm sekel dynamiskt: <= current YY => 20xx, annars 19xx
    const yy = parseInt(digits.slice(0, 2), 10);
    const nowYY = new Date().getFullYear() % 100;
    const century = yy <= nowYY ? '20' : '19';
    return century + digits;                          // YYYYMMDDNNNN
  }
  return null;
}


// === Hjälpare för Muntra-anrop ===
function authHeaders() {
  return TOKEN
    ? { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function muntraGET(path) {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${r.statusText}: ${t}`);
  return j;
}

async function muntraPOST(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body || {})
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${r.statusText}: ${t}`);
  return j;
}

// === Robust patient-lookup ===
async function findPatient({ personalNumber, clinicId, email, phone }) {
  const ssn10 = normalizeSSN10(personalNumber);
  const ssn12 = normalizeSSN12(personalNumber);
  if (!ssn10 || !ssn12) return { found: false, reason: 'Ogiltigt personnummerformat' };

  const tries = [
    `/api/patients?deleted=false&personal_id=${ssn10}&per_page=50`,
    `/api/patients?deleted=false&social_security_number=${ssn12}&per_page=50`,
    `/api/patients?deleted=false&social_security_number=${ssn12.slice(0,8)}-${ssn12.slice(8)}&per_page=50`
  ];

  const results = [];
  for (const path of tries) {
    try {
      const r = await muntraGET(path);
      const arr = Array.isArray(r?.data) ? r.data : (r?.data ? [r.data] : []);
      results.push(...arr);
    } catch {}
  }
  if (!results.length) return { found: false, reason: 'Ingen patient med det personnumret' };

  const exact = results.filter(p => {
    const a = p?.attributes || {};
    const pid10 = normalizeSSN10(a.personal_id || '');
    const ssn12x = normalizeSSN12(a.social_security_number || a.personal_id || '');
    return (pid10 && pid10 === ssn10) || (ssn12x && ssn12x === ssn12);
  });
  if (!exact.length) return { found: false, reason: 'Inga exakta träffar' };

  let candidates = exact;

  // Vikta på klinik
  if (clinicId) {
    const cid = String(clinicId);
    const withClinic = candidates.filter(p => {
      const c = p?.attributes?.clinic_id || p?.relationships?.clinic?.data?.id;
      return c && String(c) === cid;
    });
    if (withClinic.length) candidates = withClinic;
  }

  // Vikta på kontaktinfo
  const score = (p) => {
    let s = 0;
    const a = p?.attributes || {};
    if (email && a.e_mail_address && a.e_mail_address.toLowerCase() === String(email).toLowerCase()) s += 2;
    const clean = (x) => String(x || '').replace(/\D/g, '');
    if (phone && a.phone_number_cell && clean(a.phone_number_cell) === clean(phone)) s += 1;
    return s;
  };
  candidates.sort((a, b) => score(b) - score(a));
  if (candidates.length > 1) {
    candidates.sort((a, b) => new Date(b.attributes?.updated_at || 0) - new Date(a.attributes?.updated_at || 0));
  }

  const chosen = candidates[0];
  const pid10 = normalizeSSN10(chosen?.attributes?.personal_id || '');
  const ssn12x = normalizeSSN12(chosen?.attributes?.social_security_number || chosen?.attributes?.personal_id || '');
  if (pid10 !== ssn10 && ssn12x !== ssn12) {
    return { found: false, reason: 'Ambiguös träff – PN stämmer ej' };
  }
  return { found: true, patient: chosen };
}

// === Utils ===
const pad = (n) => String(n).padStart(2, '0');
const toOffsetIso = (d) => {
  const tzMin = -d.getTimezoneOffset();
  const sgn = tzMin >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(tzMin) / 60));
  const offM = pad(Math.abs(tzMin) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sgn}${offH}:${offM}`;
};

// === Healthcheck ===
app.get('/health', (_req, res) => res.json({ ok: true }));

// === Procedures ===
app.get('/api/procedures', async (req, res) => {
  try {
    const { q, ids } = req.query;
    const qs = new URLSearchParams();
    if (ids) qs.set('filter.ids', String(ids));
    if (q)   qs.set('query', String(q));
    const url = `/api/muntra-procedures${qs.toString() ? `?${qs.toString()}` : ''}`;
    const data = await muntraGET(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// === Caregivers ===
app.get('/api/caregivers', async (req, res) => {
  try {
    const clinicId = req.query.clinicId || CLINIC_ID;
    const include =
      'caregiver,clinic,' +
      'procedures,procedures.procedure,' +
      'default_procedure,default_procedure.procedure,' +
      'free_bookable_slots,next_free_bookable_slot';
    const params = new URLSearchParams();
    params.set('include', include);
    params.set('clinic_id', String(clinicId));
    params.set('active', 'true');
    params.set('per_page', '100');
    if (req.query.caregiver_id) params.set('caregiver_id', String(req.query.caregiver_id));
    const data = await muntraGET(`/api/muntra-caregiver-at-locations?${params.toString()}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// === Free slots ===
app.get('/api/free-slots', async (req, res) => {
  try {
    const { procedureId, from, to, caregiverId } = req.query;
    if (!procedureId || !from || !to) {
      return res.status(400).json({ error: 'procedureId, from, to krävs' });
    }
    const include =
      'clinic,caregiver,' +
      'free_bookable_slots,' +
      'procedures,procedures.procedure,' +
      'default_procedure,default_procedure.procedure,' +
      'next_free_bookable_slot';
    const base = new URLSearchParams();
    base.set('include', include);
    base.set('clinic_id', String(CLINIC_ID));
    base.set('dtstart', String(from));
    base.set('dtend', String(to));
    base.set('active', 'true');
    base.set('per_page', '100');
    if (caregiverId) base.set('caregiver_id', String(caregiverId));
    const p1 = new URLSearchParams(base);
    p1.set('procedure_id', String(procedureId));
    let data;
    try {
      data = await muntraGET(`/api/muntra-caregiver-at-locations?${p1.toString()}`);
    } catch {
      const p2 = new URLSearchParams(base);
      p2.set('procedure_ids', String(procedureId));
      data = await muntraGET(`/api/muntra-caregiver-at-locations?${p2.toString()}`);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// === Patient lookup (för test/debug) ===
app.get('/api/patient-lookup', async (req, res) => {
  try {
    const base  = (process.env.MUNTRA_API_BASE || '').replace(/\/$/, '');
    const token = (process.env.MUNTRA_API_TOKEN || '').trim();
    if (!base)  return res.status(500).json({ error: 'Saknar MUNTRA_API_BASE i .env' });
    if (!token) return res.status(500).json({ error: 'Saknar MUNTRA_API_TOKEN i .env' });
    const raw   = String(req.query.ssn || '');
    const ssn12 = normalizeSSN12(raw);
    if (!ssn12) return res.status(400).json({ error: 'Ogiltigt personnummer' });
    const pid10 = ssn12.slice(2);
    const ssn12Hyphen = `${ssn12.slice(0,8)}-${ssn12.slice(8)}`;
    const h = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const candidates = [
      `/api/patients?deleted=false&social_security_number=${encodeURIComponent(ssn12)}&per_page=1`,
      `/api/patients?deleted=false&social_security_number=${encodeURIComponent(ssn12Hyphen)}&per_page=1`,
      `/api/patients?deleted=false&personal_id=${encodeURIComponent(pid10)}&per_page=1`,
      `/api/patients?deleted=false&clinic_id=${encodeURIComponent(process.env.MUNTRA_CLINIC_ID || '')}&social_security_number=${encodeURIComponent(ssn12)}&per_page=1`,
      `/api/patients?deleted=false&clinic_id=${encodeURIComponent(process.env.MUNTRA_CLINIC_ID || '')}&personal_id=${encodeURIComponent(pid10)}&per_page=1`
    ];
    let hit = null, used = null, last = null;
    for (const rel of candidates) {
      const url = `${base}${rel}`;
      const r = await fetch(url, { headers: h });
      const text = await r.text();
      try { last = JSON.parse(text); } catch { last = text; }
      if (!r.ok) continue;
      const p = Array.isArray(last?.data) ? last.data[0] : null;
      if (p?.id) { hit = p; used = rel; break; }
    }
    if (!hit?.id) {
      return res.status(404).json({ error: 'Patient hittades inte', last });
    }
    return res.json({
      id: String(hit.id),
      ssn12,
      first_name: hit?.attributes?.first_name,
      last_name:  hit?.attributes?.last_name,
      email:      hit?.attributes?.e_mail_address,
      phone:      hit?.attributes?.phone_number_cell
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// === Skapa bokning (kopplad till rätt patient via patient_ids) ===
app.post('/api/book', async (req, res) => {
  try {
    const { dtstart, durationMinutes, procedureId, organizerId, patient } = req.body || {};
    if (!dtstart || !durationMinutes || !procedureId || !patient?.personalId) {
      return res.status(400).json({ error: 'dtstart, durationMinutes, procedureId, patient.personalId krävs' });
    }
    const clinicId = CLINIC_ID;
    const orgId = organizerId || DEFAULT_ORGANIZER_ID;

    // 1) lookup patient
    const { found, patient: foundPatient, reason } = await findPatient({
      personalNumber: patient.personalId,
      clinicId,
      email: patient.email,
      phone: patient.phone
    });
    if (!found) {
      return res.status(404).json({ error: 'Patient kunde inte identifieras', details: reason });
    }
    const patientId = String(foundPatient.id);
    console.log('[BOOK] VALD PATIENT:', patientId, foundPatient?.attributes?.first_name, foundPatient?.attributes?.last_name);

    // 2) beräkna dtend
    const start = new Date(dtstart);
    const end   = new Date(start.getTime() + Number(durationMinutes) * 60000);
    const dtend = toOffsetIso(end);

    // 3) Skapa bokning via /api/bookings/book
    const qs = new URLSearchParams();
    qs.set('clinic_id', String(clinicId));
    qs.set('user_ids', String(orgId));
    qs.set('patient_ids', patientId);

    const body = {
      data: {
        attributes: {
          dtstart,
          dtend,
          duration_in_minutes: Number(durationMinutes),
          status: 'CONFIRMED',
          summary: 'Onlinebokning',
          description: patient.note || 'Onlinebokning via webb'
        }
      }
    };

    const created = await muntraPOST(`/api/bookings/book?${qs.toString()}`, body);
    console.log('[BOOK] CREATED id:', created?.data?.id, '-> patient', patientId);
    return res.json(created);
  } catch (e) {
    console.error('[BOOK] ERROR:', e);
    return res.status(500).json({ error: String(e) });
  }
});

// === Start server ===
app.listen(PORT, () => {
  console.log(`Muntra proxy running on http://localhost:${PORT}`);
});
