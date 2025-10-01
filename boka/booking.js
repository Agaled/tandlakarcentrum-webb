// ===== API-bas (behåll din port) =====
const API_BASE = 'http://localhost:2070';

// ===== Små hjälpare =====
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function toOffsetIso(d){
  const tzMin = -d.getTimezoneOffset();
  const sgn = tzMin >= 0 ? '+' : '-';
  const h = pad(Math.floor(Math.abs(tzMin)/60));
  const m = pad(Math.abs(tzMin)%60);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sgn}${h}:${m}`;
}
const startOfDayIso = dateStr => toOffsetIso(new Date(dateStr+'T00:00:00'));
const endOfDayIso   = dateStr => toOffsetIso(new Date(dateStr+'T23:59:59'));

function filterPastSlots(slots, dayYMD){
  const now = new Date();
  const today = ymd(now);
  if (dayYMD < today) return [];
  if (dayYMD === today) return slots.filter(s=>s.start > now);
  return slots;
}
const showOnly = step => {
  $('#step1')?.classList.toggle('hidden', step!=='step1');
  $('#step2')?.classList.toggle('hidden', step!=='step2');
  $('#step3')?.classList.toggle('hidden', step!=='step3');
};

// ===== Muntra-indexering =====
function buildIncludedIndex(included){ const m = new Map(); (included||[]).forEach(x=>m.set(`${x.type}:${x.id}`,x)); return m; }
const byTypeId = (idx, type, id) => idx.get(`${type}:${id}`) || null;
function fullName(a={}){ return a.name || [a.first_name,a.last_name].filter(Boolean).join(' ') || a.title || a.display_name || ''; }

// ===== API-anrop =====
async function fetchCaregivers(){
  const r = await fetch(`${API_BASE}/api/caregivers`);
  if (!r.ok) throw new Error(`caregivers ${r.status}`);
  return r.json();
}
async function fetchProcedureNamesByIds(ids){
  const unique = Array.from(new Set((ids||[]).map(String)));
  if (!unique.length) return new Map();
  const r = await fetch(`${API_BASE}/api/procedures?ids=${encodeURIComponent(unique.join(','))}`);
  if (!r.ok) throw new Error(`procedures ${r.status}`);
  const j = await r.json();
  const map = new Map();
  (j?.data||[]).forEach(p=>map.set(String(p.id),{
    name: p?.attributes?.name || `#${p.id}`,
    price: p?.attributes?.price ?? null
  }));
  return map;
}
async function fetchFreeSlots({procedureId, caregiverId, fromIso, toIso}){
  const u = new URL(`${API_BASE}/api/free-slots`);
  u.searchParams.set('procedureId', String(procedureId));
  u.searchParams.set('from', fromIso);
  u.searchParams.set('to', toIso);
  if (caregiverId) u.searchParams.set('caregiverId', String(caregiverId));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`free-slots ${r.status}`);
  return r.json();
}
async function postBooking(payload){
  const r = await fetch(`${API_BASE}/api/book`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  const j = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(j?.error || `Booking ${r.status}`);
  return j;
}

// ===== Normalisering =====
function collectTrueProcedureIds(payload){
  const ids = [];
  const idx = buildIncludedIndex(payload?.included);
  (payload?.data||[]).forEach(item=>{
    const prs = item?.relationships?.procedures?.data || [];
    prs.forEach(ref=>{
      const capl = byTypeId(idx, ref.type || 'muntra_caregiver_procedure_at_location', ref.id);
      const trueRef = capl?.relationships?.procedure?.data;
      ids.push(String(trueRef?.id ?? ref.id));
    });
  });
  return ids;
}
function normalizeCaregivers(payload, procNameMap){
  const idx = buildIncludedIndex(payload?.included);
  const byCg = new Map();
  (payload?.data||[]).forEach(item=>{
    const cgRel = item?.relationships?.caregiver?.data; if (!cgRel) return;
    const cg = byTypeId(idx, cgRel.type, cgRel.id);
    const name = fullName(cg?.attributes) || `Behandlare #${cgRel.id}`;
    const id = cg?.id || cgRel.id;

    const procs = [];
    (item?.relationships?.procedures?.data||[]).forEach(ref=>{
      const capl = byTypeId(idx, ref.type || 'muntra_caregiver_procedure_at_location', ref.id);
      const trueRef = capl?.relationships?.procedure?.data;
      const procId  = String(trueRef?.id ?? ref.id);
      const resolved= procNameMap.get(procId);
      const duration =
        capl?.attributes?.duration_in_minutes_existing_patient ??
        capl?.attributes?.duration_in_minutes_new_patient ??
        capl?.attributes?.duration_in_minutes ?? null;
      procs.push({ id:procId, name: resolved?.name || `#${procId}`, price: resolved?.price ?? null, duration });
    });

    const prev = byCg.get(id) || { caregiverId:id, name, procedures:[] };
    const exist = new Set(prev.procedures.map(p=>p.id));
    procs.forEach(p=>{ if(!exist.has(p.id)) prev.procedures.push(p); });
    byCg.set(id, prev);
  });

  const list = Array.from(byCg.values());
  list.sort((a,b)=> a.name.localeCompare(b.name,'sv'));
  list.forEach(c=>c.procedures.sort((a,b)=> a.name.localeCompare(b.name,'sv')));
  return list;
}
function normalizeSlots(payload){
  const incl = payload?.included || [];
  const map = new Map(incl.map(x=>[String(x.id),x]));
  const rows = Array.isArray(payload?.data) ? payload.data : (payload?.data ? [payload.data] : []);
  const toArr = v => Array.isArray(v) ? v : (v ? [v] : []); const out = [];
  rows.forEach(row=>{
    toArr(row?.relationships?.free_bookable_slots?.data).forEach(r=>{
      const key = r?.id != null ? String(r.id) : null;
      const obj = key ? (map.get(key) || r) : r;
      const a = obj?.attributes || r?.attributes || {};
      const startStr = a.dtstart || a.starts_at || a.start; if (!startStr) return;
      const dur = a.duration_in_minutes ?? a.duration ?? null;
      out.push({ id: key || obj?.id || startStr, start: new Date(startStr), rawStart: startStr, duration: dur });
    });
  });
  out.sort((x,y)=> x.start - y.start);
  return out;
}

// ===== UI – behandlingar =====
function renderTreatmentsCards(procs){
  const wrap = $('#treatmentsGrid'); wrap.innerHTML = '';
  procs.forEach(p=>{
    const duration = p.sample?.duration || p.duration || 30;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 't-row';
    row.dataset.procId = String(p.id);

    // --- NY MARKUP för snyggare kort med tids-badge ---
    row.innerHTML = `
      <div class="badge">
        <div class="big">${duration}</div>
        <div class="small">min</div>
      </div>
      <div class="text">
        <div class="title">${p.name || p.sample?.name || `#${p.id}`}</div>
        <div class="meta">${duration} min • Klicka för att välja</div>
      </div>
      <div class="right">›</div>
    `;

    row.addEventListener('click', async ()=>{
      selectTreatment(p);
      showOnly('step2');
      $('#slotsList').innerHTML = 'Söker närmaste lediga dag…';
      await autoFindNearestSlots();
    });
    wrap.appendChild(row);
  });
}

function selectTreatment(proc){
  CURRENT.procedureId = String(proc.id);
  CURRENT.procedureDuration = proc.duration || proc.sample?.duration || 30;

  // default-behandlare som erbjuder behandlingen
  let defaultCg = null;
  for (const cg of CAREGIVERS_CACHE){
    const offers = (cg.procedures||[]).map(x=>String(x.id));
    if (offers.includes(CURRENT.procedureId)){ defaultCg = String(cg.caregiverId); break; }
  }
  if (!defaultCg && CAREGIVERS_CACHE.length) defaultCg = String(CAREGIVERS_CACHE[0].caregiverId);
  CURRENT.caregiverId = defaultCg;

  // fyll select
  const sel = $('#caregiverSelectSmall');
  sel.innerHTML = CAREGIVERS_CACHE.map(c=>`<option value="${c.caregiverId}">${c.name}</option>`).join('');
  sel.value = defaultCg;
  sel.onchange = ()=>{ CURRENT.caregiverId = sel.value; };
}

// ===== UI – tider =====
function renderSlotsList(slots, caregiverName){
  const list = $('#slotsList'); list.innerHTML = '';
  if (!slots.length){ list.innerHTML = `<div class="help">Inga lediga tider hittades för vald dag.</div>`; return; }
  slots.forEach(s=>{
    const row = document.createElement('div'); row.className = 'slot-row';
    row.innerHTML = `
      <div class="slot-left">
        <div class="slot-time">${new Intl.DateTimeFormat('sv-SE',{hour:'2-digit',minute:'2-digit'}).format(s.start)}</div>
        <div class="slot-doc">${caregiverName || ''}</div>
      </div>
      <div class="slot-right">
        <button class="slot-select" type="button">Välj</button>
      </div>`;
    row.querySelector('.slot-select').addEventListener('click', ()=>{
      CURRENT.slot = { dtstart: s.rawStart, duration: s.duration ?? null };
      const cg = CAREGIVERS_CACHE.find(x=>String(x.caregiverId)===String(CURRENT.caregiverId));
      const pr = cg?.procedures.find(p=>String(p.id)===String(CURRENT.procedureId));
      const when = new Intl.DateTimeFormat('sv-SE',{dateStyle:'full',timeStyle:'short'}).format(new Date(CURRENT.slot.dtstart));
      const dur  = CURRENT.slot.duration ?? CURRENT.procedureDuration ?? 30;
      $('#apptSummary').textContent = `Du bokar ${pr?.name || ''} – ${when}. Behandlingen utförs av ${cg?.name || ''} och beräknas ta ${dur} min.`;
      $('#bookBtn').disabled = false;
      showOnly('step3');
    });
    list.appendChild(row);
  });
}

// ===== State =====
let CAREGIVERS_CACHE = [];
let PROCEDURES_UNIQUE = [];
let CURRENT = { caregiverId:null, procedureId:null, procedureDuration:null, slot:null };

// ===== Hitta närmaste dag med tider =====
async function autoFindNearestSlots(maxDays=14){
  const cg = CURRENT.caregiverId; const pr = CURRENT.procedureId; if (!cg || !pr) return;
  const today = new Date();
  for (let i=0; i<=maxDays; i++){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()+i);
    const dayStr = ymd(d);
    const payload = await fetchFreeSlots({procedureId: pr, caregiverId: cg, fromIso: startOfDayIso(dayStr), toIso: endOfDayIso(dayStr)});
    const all = normalizeSlots(payload);
    const vis = filterPastSlots(all, dayStr);
    if (vis.length){
      const cgName = CAREGIVERS_CACHE.find(x=>String(x.caregiverId)===String(cg))?.name || '';
      $('#dateInput').value = dayStr;
      renderSlotsList(vis, cgName);
      return;
    }
  }
  renderSlotsList([], CAREGIVERS_CACHE.find(x=>String(x.caregiverId)===String(cg))?.name || '');
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async ()=> {
  try{
    // hämta & normalisera
    const raw = await fetchCaregivers();
    const nameMap = await fetchProcedureNamesByIds(collectTrueProcedureIds(raw));
    CAREGIVERS_CACHE = normalizeCaregivers(raw, nameMap);

    // unique procedure list
    const pMap = new Map();
    CAREGIVERS_CACHE.forEach(cg=> (cg.procedures||[]).forEach(p=>{
      if (!pMap.has(String(p.id))) pMap.set(String(p.id), { id:String(p.id), name:p.name, duration:p.duration||null, sample:{name:p.name,duration:p.duration||null}});
    }));
    PROCEDURES_UNIQUE = Array.from(pMap.values()).sort((a,b)=>a.name.localeCompare(b.name,'sv'));

    renderTreatmentsCards(PROCEDURES_UNIQUE);
    showOnly('step1');

    // Back-knappar
    $('#backTo1').addEventListener('click', ()=> showOnly('step1'));
    $('#backTo2').addEventListener('click', ()=> showOnly('step2'));

    // Byt behandlare
    $('#caregiverSelectSmall').addEventListener('change', async ()=>{
      $('#slotsList').innerHTML = 'Hämtar tider…';
      await autoFindNearestSlots();
    });

    // Hämta tider direkt vid datumändring
    $('#dateInput').addEventListener('change', async ()=>{
      try{
        const day = $('#dateInput').value || ymd(new Date());
        $('#slotsList').innerHTML = 'Hämtar tider…';
        const payload = await fetchFreeSlots({
          procedureId: CURRENT.procedureId,
          caregiverId: CURRENT.caregiverId,
          fromIso: startOfDayIso(day),
          toIso: endOfDayIso(day)
        });
        const all = normalizeSlots(payload);
        const vis = filterPastSlots(all, day);
        const cgName = CAREGIVERS_CACHE.find(x=>String(x.caregiverId)===String(CURRENT.caregiverId))?.name || '';
        renderSlotsList(vis, cgName);
      }catch(e){ alert('Kunde inte hämta tider.'); }
    });

    // Fallback-knapp (dold i CSS)
    $('#loadSlotsBtn').addEventListener('click', async ()=>{
      try{
        const day = $('#dateInput').value || ymd(new Date());
        const payload = await fetchFreeSlots({
          procedureId: CURRENT.procedureId,
          caregiverId: CURRENT.caregiverId,
          fromIso: startOfDayIso(day),
          toIso: endOfDayIso(day)
        });
        const all = normalizeSlots(payload);
        const vis = filterPastSlots(all, day);
        const cgName = CAREGIVERS_CACHE.find(x=>String(x.caregiverId)===String(CURRENT.caregiverId))?.name || '';
        renderSlotsList(vis, cgName);
      }catch(e){ alert('Kunde inte hämta tider.'); }
    });

  }catch(e){ /* tyst logik */ }
});

// ===== Bokning =====
$('#bookBtn').addEventListener('click', async ()=>{
  try{
    const btn = $('#bookBtn'); btn.disabled = true; btn.textContent = 'Bokar…';
    if (!CURRENT.slot?.dtstart || !CURRENT.procedureId || !CURRENT.caregiverId) throw new Error('Saknar vald tid/behandling/behandlare.');

    // PNR YYMMDD-XXXX
    const rawPid = $('#personalId').value.trim();
    if (!/^\d{6}-\d{4}$/.test(rawPid)) throw new Error('Personnummer måste vara på formen ÅÅMMDD-XXXX.');
    const pid10 = rawPid.replace(/\D/g,'');

    // Kolla att patienten finns (din server svarar 200 när den finns)
    const lookup = await fetch(`${API_BASE}/api/patient-lookup?ssn=${encodeURIComponent(pid10)}`);
    if (!lookup.ok) throw new Error('Patient finns inte i journalsystemet. Kontakta kliniken för registrering.');

    const durationMinutes = Number(CURRENT.slot.duration || CURRENT.procedureDuration || 30);
    const payload = {
      dtstart: CURRENT.slot.dtstart,
      durationMinutes,
      procedureId: CURRENT.procedureId,
      organizerId: CURRENT.caregiverId,
      patient: {
        personalId: pid10,
        firstName: $('#firstName').value.trim(),
        lastName:  $('#lastName').value.trim(),
        email:     $('#email').value.trim(),
        phone:     $('#phone').value.trim(),
        note:      $('#note').value.trim()
      }
    };

    const result = await postBooking(payload);
    const when = new Intl.DateTimeFormat('sv-SE',{dateStyle:'full',timeStyle:'short'}).format(new Date(CURRENT.slot.dtstart));
    $('#bookResult').innerHTML = `✅ Bokat: <strong>${when}</strong>. Tack! (ID: ${result?.data?.id || 'ok'})`;
    btn.textContent = 'Bekräfta bokning';
  }catch(e){
    $('#bookResult').textContent = `⚠️ ${String(e.message || e)}`;
    $('#bookBtn').disabled = false; $('#bookBtn').textContent = 'Bekräfta bokning';
  }
});
