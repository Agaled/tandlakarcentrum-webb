// enkel crossfade-rotator
document.addEventListener('DOMContentLoaded', () => {
  const slides = Array.from(document.querySelectorAll('.hero-bg .slide'));
  if (slides.length <= 1) return;

  // förladda bilder
  slides.forEach(s => {
    const url = (s.style.backgroundImage || '').replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    if (url) { const img = new Image(); img.src = url; }
  });

  let i = 0;
  const intervalMs = 6000;

  setInterval(() => {
    slides[i].classList.remove('active');
    i = (i + 1) % slides.length;
    slides[i].classList.add('active');
  }, intervalMs);
});
