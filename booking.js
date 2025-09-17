/***********************
 * KONFIG – BYT DESSA! *
 ***********************/
const PROXY     = "https://muntra-proxy.aghiedjalbout.workers.dev/"; // din Worker-URL
const CLINIC_ID = "864";                                             // din klinik-id (sträng)

/* ====== DOM ====== */
const elStatus     = document.getElementById("status");
const elLoading    = document.getElementById("loading");
const elTreatments = document.getElementById("treatments");

const modal        = document.getElementById("modal");
const modalTitle   = document.getElementById("modalTitle");
const modalAlert   = document.getElementById("modalAlert");
const modalClose   = document.getElementById("modalClose");
const fromDate     = document.getElementById("fromDate");
const toDate       = document.getElementById("toDate");
const reloadSlots  = document.getElementById("reloadSlots");
const slotsLoading = document.getElementById("slotsLoading");
const slotsList    = document.getElementById("slots");
const bookForm     = document.getElementById("bookForm");
const submitBooking= document.getElementById("submitBooking");
const personalId   = document.getElementById("personalId");
const firstName    = document.getElementById("firstName");
const lastName     = document.getElementById("lastName");
const phone        = document.getElementById("phone");
const email        = document.getElementById("email");

document.addEventListener("DOMContentLoaded", init);

/* ====== STATE ====== */
let currentTreatment = null;   // { id, name, duration, price }
let selectedSlot     = null;   // { dtstart, duration, caregiver_id, caregiver_name, organizer_id }
let caregiverToOrganizer = new Map();
let selectedOrganizerId = null;
let selectedCaregiverName = "";

/* ====== INIT ====== */
async function init() {
  showInfo("Laddar behandlingar…");
  try {
    const list = await loadTreatments();
    if (!list.length) showWarn("Hittade inga behandlingar i svaret.");
    else showOk("Behandlingar hämtade.");
    renderTreatments(list);
    wireEvents();
  } catch (err) {
    showWarn(`Kunde inte hämta behandlingar.<br><small>${escapeHtml(err.message || String(err))}</small>`);
  } finally {
    elLoading.style.display = "none";
  }
}

/* ====== EVENTS ====== */
function wireEvents() {
  elTreatments.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-tid]");
    if (!btn) return;
    const t = btn.dataset;
    currentTreatment = {
      id: t.tid, name: t.tname, duration: Number(t.tdur || 30), price: Number(t.tprice || 0)
    };
    openModal(currentTreatment);
    await loadAndRenderSlots(); // visar behandlare först
  });

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  reloadSlots.addEventListener("click", () => loadAndRenderSlots(selectedOrganizerId));

  slotsList.addEventListener("click", (e) => {
    const el = e.target.closest("button[data-dtstart]");
    if (!el) return;
    for (const b of slotsList.querySelectorAll("button[data-dtstart]")) b.disabled = false;
    el.disabled = true;
    selectedSlot = {
      dtstart: el.dataset.dtstart,
      duration: Number(el.dataset.duration),
      caregiver_id: el.dataset.caregiverId || null,
      caregiver_name: el.dataset.caregiverName || "",
      organizer_id: el.dataset.organizerId || null
    };
    submitBooking.disabled = false;
    flashModal(
      `Vald tid: <strong>${fmtDateTime(selectedSlot.dtstart)}</strong> ` +
      `<span class="small">(${selectedSlot.duration || currentTreatment?.duration || 30} min` +
      `${selectedSlot.caregiver_name ? ` · ${escapeHtml(selectedSlot.caregiver_name)}` : ""})</span>`,
      "ok"
    );
  });

  bookForm.addEventListener("submit", onSubmitBooking);
}

/* ====== HÄMTA BEHANDLINGAR ====== */
async function loadTreatments() {
  // Försök: procedures?clinic_id → fallback: treatments
  let payload = null; let lastErr = null;
  try { payload = await apiGet("procedures", { clinic_id: CLINIC_ID }); }
  catch (e) { lastErr = e; }
  if (!payload) {
    try { payload = await apiGet("treatments", {}); }
    catch (e) { throw lastErr || e; }
  }
  const arr = Array.isArray(payload?.data) ? payload.data : [];
  return arr.map(normalizeTreatment).filter(t => t.online !== false);
}

function normalizeTreatment(item) {
  const a = item?.attributes || {};
  const id       = String(item?.id ?? a.id ?? "");
  const name     = (a.name || a.text || a.title || "Behandling").trim();
  const duration = a.duration_in_minutes ?? a.duration ?? null;
  const price    = a.price ?? (a.price_cents != null ? a.price_cents/100 : null);
  const online   = a.online_bookable ?? a.bookable_by_patient ?? a.visible_in_online_booking ?? undefined;
  return { id, name, duration, price, online };
}

/* ====== DATUM ====== */
function toISODate(d){ return new Date(d).toISOString().slice(0,10); }
function toISOSeconds(d){ return new Date(d).toISOString().replace(/\.\d{3}Z$/,"Z"); }
function isoStartOfDayZ(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString().replace(".000Z","Z");
}
function isoEndOfDayZ(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).toISOString().replace(".000Z","Z");
}

/* ====== MODAL ====== */
function openModal(t) {
  modalTitle.textContent = `Boka: ${t.name}`;
  const start = new Date(), end = new Date(); end.setDate(end.getDate() + 30);
  fromDate.value = toISODate(start);
  toDate.value   = toISODate(end);
  modal.classList.add("show");
  modal.setAttribute("aria-hidden","false");
  selectedOrganizerId = null; selectedCaregiverName = "";
  ensureCaregiverContainer();
  const badge = document.getElementById("caregiverBadge");
  if (badge) badge.textContent = "";
  slotsList.innerHTML = ""; modalAlert.innerHTML = ""; submitBooking.disabled = true;
  try { personalId.focus(); } catch {}
}
function closeModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden","true");
  slotsList.innerHTML = ""; modalAlert.innerHTML = "";
  selectedSlot = null; submitBooking.disabled = true;
}
function flashModal(html, ok=null){
  if (!html) { modalAlert.innerHTML=""; return; }
  modalAlert.innerHTML = `<div class="${ok ? "alert ok" : "alert"}">${html}</div>`;
}

/* ====== CAREGIVER (behandlare) UI ====== */
function ensureCaregiverContainer() {
  let box = document.getElementById("caregiversBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "caregiversBox";
    box.innerHTML = `
      <h4 style="margin:10px 0 6px">Välj behandlare</h4>
      <ul id="caregiversList" class="list"></ul>
      <hr style="margin:12px 0">
      <h4 style="margin:10px 0 6px">Lediga tider <span id="caregiverBadge" class="small"></span></h4>
    `;
    slotsList.parentNode.insertBefore(box, slotsList);
  }
  return box;
}

function _pickName(attrs = {}) {
  return (
    attrs.name ||
    attrs.full_name ||
    [attrs.first_name, attrs.last_name].filter(Boolean).join(" ") ||
    attrs.title ||
    attrs.nick_name ||
    attrs.caregiver_name || ""
  );
}

function _caregiverFromIncluded(included, organizerId) {
  const incById = new Map(included.map(x => [String(x?.id ?? ""), x]));
  const cal = incById.get(String(organizerId));
  let cgId = null, name = "";
  if (cal) {
    const rels = cal.relationships || {};
    cgId = rels?.caregiver?.data?.id || null;
    if (cgId && incById.get(String(cgId))) name = _pickName(incById.get(String(cgId)).attributes || {});
    if (!name) name = _pickName(cal.attributes || {});
  }
  return { cgId, name };
}

function extractCaregivers(payload) {
  const dataArr  = Array.isArray(payload?.data) ? payload.data : [];
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const incById  = new Map(included.map(x => [String(x?.id ?? ""), x]));
  const out = [];
  for (const item of dataArr) {
    const organizerId = String(item?.id ?? "");
    let cgId = item?.relationships?.caregiver?.data?.id || null;
    let name = "";
    if (cgId && incById.get(String(cgId))) name = _pickName(incById.get(String(cgId)).attributes || {});
    if (!cgId || !name) {
      const viaInc = _caregiverFromIncluded(included, organizerId);
      cgId = cgId || viaInc.cgId;
      name = name || viaInc.name;
    }
    if (!name) name = _pickName(item?.attributes || {});
    out.push({ organizer_id: organizerId, caregiver_id: cgId || null, caregiver_name: name || "Behandlare" });
  }
  return out;
}

function renderCaregivers(list) {
  ensureCaregiverContainer();
  const ul = document.getElementById("caregiversList");
  ul.innerHTML = "";
  if (!list.length) { ul.innerHTML = `<li class="small">Inga behandlare hittades i intervallet.</li>`; return; }
  for (const c of list) {
    const li = document.createElement("li");
    li.className = "treatment";
    li.innerHTML = `
      <div>
        <div class="t-title">${escapeHtml(c.caregiver_name)}</div>
        <div class="t-meta"><span>Kalender #${escapeHtml(c.organizer_id)}</span></div>
      </div>
      <div>
        <button class="btn" data-org="${escapeAttr(c.organizer_id)}" data-cgname="${escapeAttr(c.caregiver_name)}">Välj behandlare</button>
      </div>`;
    ul.appendChild(li);
  }
  ul.onclick = (e) => {
    const btn = e.target.closest("button[data-org]");
    if (!btn) return;
    selectedOrganizerId = btn.dataset.org;
    selectedCaregiverName = btn.dataset.cgname || "";
    const badge = document.getElementById("caregiverBadge");
    if (badge) badge.textContent = selectedCaregiverName ? `· ${selectedCaregiverName}` : "";
    loadAndRenderSlots(selectedOrganizerId);
  };
}

/* ====== LEDIGA TIDER ====== */
async function loadAndRenderSlots(filterOrganizerId = null) {
  if (!currentTreatment) return;

  if (!fromDate.value || !toDate.value) {
    const start = new Date(), end = new Date(); end.setDate(end.getDate() + 30);
    fromDate.value = toISODate(start);
    toDate.value   = toISODate(end);
  }
  const dtstart = isoStartOfDayZ(fromDate.value);
  const dtend   = isoEndOfDayZ(toDate.value);

  const baseCore = { dtstart, dtend, clinic_id: CLINIC_ID };

  if (!filterOrganizerId) {
    flashModal("Välj behandlare för att se tider.", "ok");
    slotsLoading.style.display = "block";
    try {
      const caregiversRes = await apiGet("muntra-caregiver-at-locations", {
        ...baseCore,
        include: "caregiver,free_bookable_slots,caregiver_at_location,organizer",
        procedure_ids: currentTreatment.id
      });
      renderCaregivers(extractCaregivers(caregiversRes));
    } catch (err) {
      renderCaregivers([]);
      flashModal(`Kunde inte hämta behandlare: ${escapeHtml(err.message || String(err))}`, null);
    } finally {
      slotsLoading.style.display = "none";
    }
    return;
  }

  slotsList.innerHTML = "";
  submitBooking.disabled = true; selectedSlot = null;
  flashModal("Söker lediga tider…", null);
  slotsLoading.style.display = "block";

  const includeVariants = [
    "caregiver,free_bookable_slots,caregiver_at_location,organizer",
    "caregiver,free-bookable-slots,caregiver-at-location,organizer",
    "caregiver,free_bookable_slots,caregiver-at-location,organizer",
    "caregiver,free-bookable-slots,caregiver_at_location,organizer",
  ];
  const tries = [];
  for (const inc of includeVariants) {
    tries.push({ ...baseCore, include: inc, procedure_ids: currentTreatment.id, _label: `(${inc})` });
    tries.push({ ...baseCore, include: inc, _label: `(${inc})` });
  }

  let lastErr = null;
  try {
    for (const t of tries) {
      const { _label, ...params } = t;
      try {
        const res = await apiGet("muntra-caregiver-at-locations", params);
        if (Array.isArray(res?.data)) {
          res.data = res.data.filter(d => String(d?.id ?? "") === String(filterOrganizerId));
        }
        const slots = extractSlots(res);
        if (slots.length) {
          renderSlots(slots);
          flashModal(`<span class="small">Lediga tider · ${escapeHtml(selectedCaregiverName)} ${escapeHtml(_label)}</span>`, "ok");
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error("Fel vid hämtning av tider:", _label, err);
      }
    }
    flashModal("Inga tider för vald behandlare i intervallet.", null);
  } catch (e) {
    lastErr = e;
    flashModal(`Kunde inte hämta tider: ${escapeHtml(e.message || String(e))}`, null);
  } finally {
    slotsLoading.style.display = "none";
    if (lastErr) console.error(lastErr);
  }
}

/* ====== PARSA SLOTS ====== */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(String(s)).replace(/"/g,"&quot;"); }
function isoify(x){ const d = new Date(x); return isNaN(+d) ? x : d.toISOString().replace(/\.\d{3}Z$/,"Z"); }
function fmtDateTime(iso){ const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString("sv-SE",{dateStyle:"medium", timeStyle:"short"}); }
function formatPrice(p){ const n = Number(p); return isFinite(n) ? new Intl.NumberFormat("sv-SE",{style:"currency",currency:"SEK"}).format(n) : String(p); }
function trimSlashes(s){ return String(s).replace(/^\/+|\/+$/g,""); }

function extractSlots(payload) {
  caregiverToOrganizer = new Map();

  const out = [];
  const dataArr = Array.isArray(payload?.data) ? payload.data : [];
  const included = Array.isArray(payload?.included) ? payload.included : [];

  const norm = s => String(s || "").toLowerCase().replace(/[-_]/g, "");
  const getRelId = (node, keys) => {
    const rels = node?.relationships || {};
    for (const k of Object.keys(rels)) {
      if (keys.some(key => norm(k) === norm(key))) {
        return rels[k]?.data?.id || null;
      }
    }
    return null;
  };

  // caregiver_id -> organizer_id
  for (const item of dataArr) {
    const type = norm(item?.type || "");
    const looksLikeCAL = type.includes("caregiveratlocation") || type.includes("calendar") || type.includes("organizer");
    const organizerId = looksLikeCAL ? String(item?.id ?? "") : null;
    const cgId = getRelId(item, ["caregiver"]);
    if (organizerId && cgId) caregiverToOrganizer.set(String(cgId), organizerId);
  }

  const incById = new Map(included.map(x => [String(x?.id ?? ""), x]));
  const cgNameFromId = (id) => {
    const a = incById.get(String(id))?.attributes || {};
    return a.name || a.full_name || a.title || "";
  };

  const pushSlot = (s) => {
    if (!s?.dtstart) return;
    out.push({
      dtstart: s.dtstart,
      duration: Number(s.duration ?? s.duration_in_minutes ?? 0) || null,
      caregiver_id: s.caregiver_id || null,
      caregiver_name: s.caregiver_name || "",
      organizer_id: s.organizer_id || null
    });
  };

  // via data[].attributes.free_bookable_slots
  for (const item of dataArr) {
    const type = norm(item?.type || "");
    const looksLikeCAL = type.includes("caregiveratlocation") || type.includes("calendar") || type.includes("organizer");
    const organizerId = looksLikeCAL ? String(item?.id ?? "") : null;

    const cgId = getRelId(item, ["caregiver"]);
    const cgName = cgNameFromId(cgId);

    const free = Array.isArray(item?.attributes?.free_bookable_slots)
      ? item.attributes.free_bookable_slots : [];

    for (const sl of free) {
      const a = sl?.attributes || sl || {};
      const start = a.dtstart || a.start || a.datetime || a.starts_at;
      if (!start) continue;

      const caregiver_id = cgId || a.caregiver_id || null;
      const org = organizerId || (caregiver_id ? caregiverToOrganizer.get(String(caregiver_id)) : null) || null;

      pushSlot({
        dtstart: isoify(start),
        duration: a.duration_in_minutes || a.duration || null,
        caregiver_id,
        caregiver_name: cgName || a.caregiver_name || "",
        organizer_id: org
      });
    }
  }

  // via included
  for (const inc of included) {
    const type = norm(inc?.type || "");
    if (!type.includes("slot")) continue;

    const a = inc?.attributes || {};
    const start = a.dtstart || a.start || a.datetime || a.starts_at;
    if (!start) continue;

    const cgId = getRelId(inc, ["caregiver"]);
    const cgName = cgNameFromId(cgId);
    const orgFromRel = getRelId(inc, ["caregiver_at_location","caregiver-at-location","organizer","calendar"]);
    const org = orgFromRel || (cgId ? caregiverToOrganizer.get(String(cgId)) : null) || null;

    pushSlot({
      dtstart: isoify(start),
      duration: a.duration_in_minutes || a.duration || null,
      caregiver_id: cgId || null,
      caregiver_name: cgName,
      organizer_id: org
    });
  }

  out.sort((a,b)=>new Date(a.dtstart)-new Date(b.dtstart));
  const seen=new Set(), res=[];
  for (const s of out) {
    const k=[s.dtstart, s.organizer_id||"", s.caregiver_id||""].join("|");
    if (!seen.has(k)) { seen.add(k); res.push(s); }
  }
  return res;
}

function renderSlots(slots) {
  slotsList.innerHTML = "";
  for (const s of slots) {
    const li = document.createElement("li");
    li.className = "slot";
    li.innerHTML = `
      <strong>${fmtDateTime(s.dtstart)}</strong>
      <div class="small">
        ${(s.duration || currentTreatment?.duration || 30)} min
        ${s.caregiver_name ? ` · <span class="badge">${escapeHtml(s.caregiver_name)}</span>` : ""}
        ${s.organizer_id ? ` · <span class="badge">org #${escapeHtml(String(s.organizer_id))}</span>` : ""}
      </div>
      <button class="btn"
              data-dtstart="${escapeAttr(s.dtstart)}"
              data-duration="${escapeAttr(s.duration || currentTreatment?.duration || 30)}"
              data-caregiver-id="${escapeAttr(s.caregiver_id||"")}"
              data-caregiver-name="${escapeAttr(s.caregiver_name||"")}"
              data-organizer-id="${escapeAttr(s.organizer_id||"")}">Välj tid</button>
    `;
    slotsList.appendChild(li);
  }
}

/* ====== RESOLVE ORGANIZER ====== */
async function resolveOrganizerForSlot(slot) {
  if (slot.organizer_id) return slot.organizer_id;

  const start = new Date(slot.dtstart);
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const params = {
    clinic_id: CLINIC_ID,
    include: "caregiver,free_bookable_slots,caregiver_at_location,caregiver-at-location,organizer",
    dtstart: toISOSeconds(start),
    dtend:   toISOSeconds(end)
  };
  const payload = await apiGet("muntra-caregiver-at-locations", params);

  const dataArr  = Array.isArray(payload?.data) ? payload.data : [];
  const sameSec  = (a,b) => new Date(a).toISOString().slice(0,19) === new Date(b).toISOString().slice(0,19);

  for (const item of dataArr) {
    const free = Array.isArray(item?.attributes?.free_bookable_slots) ? item.attributes.free_bookable_slots : [];
    for (const s of free) {
      const a = s?.attributes || s || {};
      const st = a.dtstart || a.start || a.datetime || a.starts_at;
      if (st && sameSec(st, slot.dtstart)) return String(item?.id ?? "");
    }
  }

  const included = Array.isArray(payload?.included) ? payload.included : [];
  for (const inc of included) {
    const type = String(inc?.type || "").toLowerCase();
    if (!type.includes("slot")) continue;
    const a = inc?.attributes || {};
    const st = a.dtstart || a.start || a.datetime || a.starts_at;
    if (!st || !sameSec(st, slot.dtstart)) continue;

    const rels = inc?.relationships || {};
    const org =
      rels.caregiver_at_location?.data?.id ||
      rels["caregiver-at-location"]?.data?.id ||
      rels.organizer?.data?.id ||
      rels.calendar?.data?.id || null;

    if (org) return String(org);
  }

  if (slot.caregiver_id) {
    for (const item of dataArr) {
      const relCg = item?.relationships?.caregiver?.data?.id;
      if (String(relCg || "") === String(slot.caregiver_id)) return String(item?.id ?? "");
    }
  }
  return null;
}

/* ====== BOKNING ====== */
async function onSubmitBooking(e){
  e.preventDefault();
  if (!currentTreatment || !selectedSlot) { flashModal("Välj en tid först.", null); return; }

  let organizerId = selectedOrganizerId || selectedSlot.organizer_id || null;
  if (!organizerId) organizerId = await resolveOrganizerForSlot(selectedSlot);
  if (!organizerId) {
    flashModal("Kunde inte avgöra kalender (organizer) för den valda tiden. Välj behandlare och försök igen.", null);
    return;
  }

  const duration = selectedSlot.duration || currentTreatment.duration || 30;

  submitBooking.disabled = true;
  try {
    // Query-parametrar behåller vi minimal (clinic_id + personnummer)
    const params = {
      clinic_id: CLINIC_ID,
      patient_personal_id: personalId.value.trim()
    };

    // JSON:API body – organizer_id i attributes (viktigt!)
    const body = {
      data: {
        type: "bookings",
        attributes: {
          dtstart: selectedSlot.dtstart,
          duration_in_minutes: duration,
          status: "booked",
          booked_by_patient: true,
          description: `Onlinebokning – ${currentTreatment.name}`,
          procedure_id: currentTreatment.id,
          organizer_id: organizerId
        },
        relationships: {
          clinic: { data: { type: "clinics", id: String(CLINIC_ID) } },
          ...(selectedSlot.caregiver_id ? {
            caregiver: { data: { type: "caregivers", id: String(selectedSlot.caregiver_id) } }
          } : {})
        }
      }
    };

    await apiPost("muntra-bookings", params, body);
    flashModal(`Klart! Din tid är bokad: <strong>${fmtDateTime(selectedSlot.dtstart)}</strong>`, "ok");
    submitBooking.disabled = true;
  } catch (err) {
    submitBooking.disabled = false;
    flashModal(
      `Bokningen misslyckades: ${escapeHtml(err.message || String(err))}` +
      `<br><span class="small">organizer_id som skickades: ${escapeHtml(String(organizerId))}</span>`,
      null
    );
  }
}

/* ====== RENDER BEHANDLINGAR ====== */
function renderTreatments(items) {
  elTreatments.innerHTML = "";
  for (const t of items) {
    const li = document.createElement("li");
    li.className = "treatment";
    li.innerHTML = `
      <div>
        <div class="t-title">${escapeHtml(t.name)}</div>
        <div class="t-meta">
          ${t.duration ? `<span>${escapeHtml(String(t.duration))} min</span>` : ""}
          ${t.price != null ? `<span>${formatPrice(t.price)}</span>` : ""}
        </div>
      </div>
      <div>
        <button class="btn" data-tid="${escapeAttr(t.id)}" data-tname="${escapeAttr(t.name)}"
                data-tdur="${escapeAttr(t.duration||30)}" data-tprice="${escapeAttr(t.price||"")}">Boka</button>
      </div>
    `;
    elTreatments.appendChild(li);
  }
}

/* ====== API ====== */
const apiGet  = (path, params = {}) => apiFetch("GET", path, params);
const apiPost = (path, params = {}, body = {}) => apiFetch("POST", path, params, body);

async function apiFetch(method, path, params = {}, body) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${PROXY}?path=${encodeURIComponent(trimSlashes(path))}${qs ? `&${qs}` : ""}`;

  let res, raw;
  try {
    res = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
    });
    raw = await res.text();
  } catch (e) {
    throw new Error(`Kunde inte nå proxy (${e.message}). URL: ${url}`);
  }

  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}

  if (!res.ok) {
    const msg = (data && (data.error || data.message))
      ? (data.error || data.message)
      : `HTTP ${res.status}${raw ? ` – ${raw.slice(0, 220)}…` : ""}`;
    const err = new Error(msg);
    err.status = res.status; err.url = url;
    throw err;
  }
  if (!data) { const err = new Error(`Ogiltigt JSON-svar${raw ? `: ${raw.slice(0, 220)}…` : " (tomt svar)"}`); err.url = url; throw err; }
  return data;
}

/* ====== UI helpers ====== */
function showInfo(html) { setAlert("alert", html); }
function showOk(html)   { setAlert("alert ok", html); }
function showWarn(html) { setAlert("alert", html); }
function setAlert(cls, html) { elStatus.innerHTML = `<div class="${cls}">${html}</div>`; }

/* ====== UTILS ====== */
function formatPrice(p){ const n = Number(p); return isFinite(n) ? new Intl.NumberFormat("sv-SE",{style:"currency",currency:"SEK"}).format(n) : String(p); }
function trimSlashes(s){ return String(s).replace(/^\/+|\/+$/g,""); }

/* start */
