document.addEventListener("DOMContentLoaded", () => {
  // === Ladda in HEADER och FOOTER först ===
  Promise.all([
    fetch("header.html").then(res => res.text()),
    fetch("footer.html").then(res => res.text())
  ]).then(([headerHtml, footerHtml]) => {
    document.getElementById("header-placeholder").innerHTML = headerHtml;
    document.getElementById("footer-placeholder").innerHTML = footerHtml;

    // === Initiera funktioner EFTER att header/footer är laddade ===
    initSlider();
    initKontaktForm();
    initMobileMenu();
  });
});

// === Funktioner ===

function initSlider() {
  const slides = document.querySelectorAll('.review-slide');
  let currentSlide = 0;

  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
  }

  function moveSlide(step) {
    currentSlide = (currentSlide + step + slides.length) % slides.length;
    showSlide(currentSlide);
  }

  if (slides.length > 0) {
    showSlide(currentSlide);
    const prevBtn = document.querySelector('.slider-btn.prev');
    const nextBtn = document.querySelector('.slider-btn.next');
    if (prevBtn && nextBtn) {
      prevBtn.addEventListener('click', () => moveSlide(-1));
      nextBtn.addEventListener('click', () => moveSlide(1));
    }
  }
}

function initKontaktForm() {
  const kontaktForm = document.getElementById("kontaktForm");
  const bekraftelse = document.getElementById("form-bekraftelse");

  if (kontaktForm && bekraftelse) {
    kontaktForm.addEventListener("submit", (e) => {
      e.preventDefault();
      kontaktForm.reset();
      bekraftelse.style.display = "block";
    });
  }
}

function initMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      navLinks.classList.toggle("show");
    });
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      navLinks.classList.toggle("show");
    });
  }
});

// === Ladda in chatboten på alla sidor ===
(function loadChatbotEverywhere() {
  // Skapa en placeholder längst ner i <body>
  const placeholder = document.createElement('div');
  placeholder.id = 'chatbot-placeholder';
  document.body.appendChild(placeholder);

  // Hämta och injicera chatbotens HTML
  fetch('chatbot.html')
    .then(res => res.text())
    .then(html => { placeholder.innerHTML = html; })
    .catch(() => { console.warn('Kunde inte ladda chatbot.html'); });
})();

document.documentElement.classList.add('js-ready');
