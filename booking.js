// === Mockdata (låtsas) ===
const treatments = [
  { id: 1, name: "Akuttid", price: 390, original: 550 },
  { id: 2, name: "Basundersökning", price: 750 },
  { id: 3, name: "Basundersökning 19–23 år", price: 450 },
  { id: 4, name: "Hygienistbehandling", price: 650 },
  { id: 5, name: "Konsultation Invisalign", price: 0 },
];

const mockTimes = {
  1: [
    { time: "2025-09-08T14:00:00", dentist: "Dr. Yousef", price: 390, original: 550 },
    { time: "2025-09-08T14:30:00", dentist: "Dr. Yousef", price: 390, original: 550 },
  ],
  2: [
    { time: "2025-09-09T09:00:00", dentist: "Dr. Anna", price: 750 },
    { time: "2025-09-09T09:30:00", dentist: "Dr. Anna", price: 750 },
  ]
};

// === Hjälpfunktioner ===
const app = document.getElementById("booking-app");

function formatDateTime(dt) {
  const d = new Date(dt);
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dt) {
  const d = new Date(dt);
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

// === Steg 1: Lista behandlingar ===
function renderTreatments() {
  app.innerHTML = `<h2>Hur kan vi hjälpa dig?</h2>`;
  const ul = document.createElement("ul");
  ul.className = "booking-list";

  treatments.forEach(t => {
    const li = document.createElement("li");
    li.className = "booking-item";
    li.innerHTML = `
      <div>
        <div class="title">${t.name}</div>
        ${t.price ? `<div class="meta">från ${t.price} kr</div>` : ""}
      </div>
      <div class="chevron">›</div>
    `;
    li.addEventListener("click", () => renderTimes(t.id, t.name));
    ul.appendChild(li);
  });

  app.appendChild(ul);
}

// === Steg 2: Lista tider för vald behandling ===
function renderTimes(treatmentId, treatmentName) {
  const times = mockTimes[treatmentId] || [];

  const container = document.createElement("div");

  container.innerHTML = `
    <div class="back-row">
      <button class="btn-back" onclick="renderTreatments()">←</button>
      <h2>${treatmentName}</h2>
    </div>
  `;

  let currentDay = "";
  times.forEach(slot => {
    const day = formatDate(slot.time);
    if (day !== currentDay) {
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.textContent = day;
      container.appendChild(dayHeader);
      currentDay = day;
    }

    const row = document.createElement("div");
    row.className = "slot";
    row.innerHTML = `
      <div class="left">
        <span class="time">${formatDateTime(slot.time)}</span>
        <span class="dentist">${slot.dentist}</span>
      </div>
      <div class="right">
        <div class="price-row">
          ${slot.original ? `<span class="old-price">${slot.original} kr</span>` : ""}
          <span class="price">${slot.price} kr</span>
        </div>
        <button class="btn" onclick="renderForm('${treatmentId}','${treatmentName}','${slot.time}','${slot.dentist}','${slot.price}')">Boka</button>
      </div>
    `;
    container.appendChild(row);
  });

  app.innerHTML = "";
  app.appendChild(container);
}

// === Steg 3: Kontaktformulär ===
function renderForm(treatmentId, treatmentName, time, dentist, price) {
  const d = new Date(time);
  const readableTime = `${d.toLocaleDateString("sv-SE")} kl ${d.toLocaleTimeString("sv-SE", {hour:"2-digit",minute:"2-digit"})}`;

  app.innerHTML = `
    <div class="back-row">
      <button class="btn-back" onclick="renderTimes(${treatmentId}, '${treatmentName}')">←</button>
      <h2>Dina uppgifter</h2>
    </div>
    <p>Du har valt <strong>${treatmentName}</strong> hos <strong>${dentist}</strong> den <strong>${readableTime}</strong> (${price} kr).</p>

    <form class="form" onsubmit="submitBooking(event)">
      <input type="hidden" name="treatmentId" value="${treatmentId}">
      <input type="hidden" name="time" value="${time}">
      <input type="hidden" name="dentist" value="${dentist}">
      <input type="hidden" name="price" value="${price}">

      <input class="input" name="first_name" placeholder="Förnamn" required>
      <input class="input" name="last_name" placeholder="Efternamn" required>
      <input class="input" name="personal_number" placeholder="Personnummer (YYYYMMDD-XXXX)" required>
      <input class="input" type="email" name="email" placeholder="E-post" required>
      <input class="input" type="tel" name="phone" placeholder="Telefon" required>
      <textarea class="textarea" name="note" placeholder="Meddelande (valfritt)"></textarea>

      <button class="btn" type="submit">Bekräfta bokning</button>
    </form>
  `;
}

// === Steg 4: (just nu) Mock-submit ===
function submitBooking(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  alert(`(Mock) Bokning skickad:\n${JSON.stringify(data, null, 2)}`);

  // Här kommer vi senare lägga in riktiga fetch() mot Muntra
  renderTreatments();
}

// Initiera
renderTreatments();
