/* =========================================
   Globalt skript (utan chatbot)
   - Fungerar med NY eller LEGACY header
   - Recensions-slider enligt tidigare klassnamn
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const HTML = document.documentElement;
  const NEW_HEADER_ACTIVE = HTML.classList.contains("atc-hide-legacy"); // sätts av slim-header.js

  // Kör dessa oavsett header-typ
  initReviewsSlider();   // <-- DIN recensions-slider (review-slide + slider-btn)
  initHeroSlider();      // (valfri) hero-slider om du har en
  initKontaktForm();     // formulär

  if (NEW_HEADER_ACTIVE) {
    // Ny header är aktiv -> ladda inte legacy header/footer
    return;
  }

  // Legacy-läge: ladda header/footer och initiera sen
  Promise.all([
    fetch("/header.html", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : Promise.reject(r))),
    fetch("/footer.html", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : Promise.reject(r))),
  ])
    .then(([headerHtml, footerHtml]) => {
      const headerMount = document.getElementById("header-placeholder");
      const footerMount = document.getElementById("footer-placeholder");
      if (headerMount) headerMount.innerHTML = headerHtml;
      if (footerMount) footerMount.innerHTML = footerHtml;

      initMobileMenu(); // legacy-mobilmeny (#menuToggle/#navLinks) om den finns
    })
    .catch((err) => {
      console.warn("Kunde inte ladda legacy header/footer:", err);
      initMobileMenu();
    });
});

/* =========================================
   DIN RECENSIONS-SLIDER (som tidigare)
   - Använder .review-slide
   - Knappar: .slider-btn.prev / .slider-btn.next
   - Pausar på hover, fortsätter när man lämnar
   - Robust om knappar saknas
   ========================================= */
function initReviewsSlider() {
  const slides = Array.from(document.querySelectorAll(".review-slide"));
  if (slides.length === 0) return;

  // Hitta knappar (om de finns)
  const prevBtn = document.querySelector(".slider-btn.prev");
  const nextBtn = document.querySelector(".slider-btn.next");

  let current = 0;
  const INTERVAL = 8000; // auto-rotation (ms). Sätt till 0 om du vill stänga av.
  let timer = null;

  const show = (i) => {
    current = (i + slides.length) % slides.length;
    slides.forEach((slide, idx) => {
      const active = idx === current;
      slide.classList.toggle("active", active);
      // tillgänglighet (valfritt men bra)
      slide.hidden = !active;
      slide.setAttribute("aria-hidden", String(!active));
      slide.setAttribute("tabindex", active ? "0" : "-1");
    });
  };

  const next = () => show(current + 1);
  const prev = () => show(current - 1);

  // Auto-rotation
  const start = () => {
    if (INTERVAL > 0) {
      stop();
      timer = setInterval(next, INTERVAL);
    }
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  // Init
  show(current);
  start();

  // Events för knappar (om de finns)
  if (prevBtn) prevBtn.addEventListener("click", () => { prev(); start(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { next(); start(); });

  // Pausa på hover/fokus på själva slider-området
  const container =
    slides[0].closest(".reviews, .testimonial-slider, .reviews-slider, #reviews") || slides[0].parentElement;
  if (container) {
    container.addEventListener("mouseenter", stop);
    container.addEventListener("mouseleave", start);
    container.addEventListener("focusin", stop);
    container.addEventListener("focusout", start);
    // Piltangenter
    container.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); start(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); start(); }
    });
  }
}

/* =========================================
   (Valfri) Hero-slider – kör bara om .hero-slider finns
   ========================================= */
function initHeroSlider() {
  const slider = document.querySelector(".hero-slider");
  if (!slider) return;
  const slides = slider.querySelectorAll(".slide");
  if (!slides.length) return;

  let index = 0;
  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, k) => {
      const active = k === index;
      s.classList.toggle("is-active", active);
      s.hidden = !active;
    });
  };
  const next = () => show(index + 1);

  show(index);
  setInterval(next, 6000);
}

/* =========================================
   Legacy mobil-menyn (#menuToggle / #navLinks)
   ========================================= */
function initMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  if (!menuToggle || !navLinks) return;
  if (menuToggle.dataset.bound === "1") return;
  menuToggle.dataset.bound = "1";

  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
      navLinks.classList.remove("show");
    }
  });
}

/* =========================================
   Kontaktformulär
   ========================================= */
function initKontaktForm() {
  const kontaktForm = document.getElementById("kontaktForm");
  const bekraftelse = document.getElementById("form-bekraftelse");
  if (!kontaktForm || !bekraftelse) return;

  kontaktForm.addEventListener("submit", (e) => {
    e.preventDefault();
    kontaktForm.reset();
    bekraftelse.style.display = "block";
  });
}
