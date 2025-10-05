// slim-header.js — injicerar ny header, normaliserar länkar och hanterar nav/dropdown (desktop & mobil)
(async () => {
  // ---------- Upptäck basväg ----------
  const thisScript = document.currentScript || [...document.scripts].find(s => (s.src || '').includes('slim-header.js'));
  const scriptUrl = new URL(thisScript.src, window.location.href);
  const SITE_BASE = scriptUrl.pathname.replace(/\/new-header\/slim-header\.js.*$/, '/'); // ex: "/kliniken/"
  const baseNewHeader = new URL('./', scriptUrl).href; // mappen "new-header/"

  // ---------- Säkerställ global CSS ----------
  const ensureCss = (href) => {
    const abs = new URL(href.replace(/^\//, ''), window.location.origin + SITE_BASE).href;
    const already = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .some(l => (l.href || '').split('?')[0] === abs);
    if (!already) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = abs;
      document.head.appendChild(link);
    }
  };
  ensureCss('styles.css');

  // ---------- Headerns egen CSS ----------
  if (!document.getElementById('atc-slim-css')) {
    const link = document.createElement('link');
    link.id = 'atc-slim-css';
    link.rel = 'stylesheet';
    link.href = new URL('slim-header.css', baseNewHeader).href;
    document.head.appendChild(link);
  }

  // ---------- Injicera header HTML ----------
  const res = await fetch(new URL('slim-header.html', baseNewHeader).href, { cache: 'no-cache' });
  const shell = document.createElement('div');
  shell.innerHTML = await res.text();
  const headerEl = shell.firstElementChild;
  document.body.prepend(headerEl);

  // Dölj legacy-header under test/live
  document.documentElement.classList.add('atc-hide-legacy');

  // ---------- Normalisera interna länkar ----------
  const isInternal = (href) => href && !/^https?:|^mailto:|^tel:|^#/.test(href);
  document.querySelectorAll('.atc-nav a, .atc-cta a, .atc-dropdown__menu a, .atc-brand').forEach(a => {
    const href = a.getAttribute('href');
    if (!isInternal(href)) return;
    const clean = href.replace(/^\/+/, '');
    a.setAttribute('href', SITE_BASE + clean);
  });

  // ---------- Element ----------
  const nav    = document.querySelector('#atc-nav');
  const toggle = document.querySelector('.atc-nav__toggle');
  const dropdown    = document.querySelector('.atc-dropdown');
  const dropdownBtn = dropdown?.querySelector('.atc-dropdown__btn');

  // Skärmläsartext: säkerställ att den är visuellt gömd
  const sr = toggle?.querySelector('.atc-sr');
  if (sr) {
    Object.assign(sr.style, {
      position: 'absolute', width: '1px', height: '1px', margin: '-1px',
      padding: '0', overflow: 'hidden', clip: 'rect(0 0 0 0)', border: '0'
    });
  }

  // ---------- Tillstånd & helpers ----------
  const setNavOpen = (isOpen) => {
    toggle?.setAttribute('aria-expanded', String(isOpen));
    nav?.classList.toggle('open', isOpen);
    document.documentElement.classList.toggle('atc-nav-open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (toggle) toggle.setAttribute('aria-label', isOpen ? 'Stäng menyn' : 'Öppna menyn');
  };

  // Skapa X-knapp i mobilmenyn (om den saknas)
  if (nav && !nav.querySelector('.atc-nav__close')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'atc-nav__close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Stäng menyn');
    nav.appendChild(closeBtn);
    closeBtn.addEventListener('click', () => setNavOpen(false));
  }

  // ---------- Mobil: hamburger ----------
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    setNavOpen(!open);
  });

  // Stäng mobilnav vid klick utanför
  document.addEventListener('click', (e) => {
    if (!nav?.classList.contains('open')) return;
    if (toggle?.contains(e.target) || nav.contains(e.target)) return;
    setNavOpen(false);
  });

  // Stäng på Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav?.classList.contains('open')) setNavOpen(false);
  });

  // Stäng mobilnav när man klickar på en länk
  nav?.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (window.matchMedia('(max-width: 900px)').matches) setNavOpen(false);
  });

  // Stäng ev. öppet mobilnav när man växlar till desktop
  const mqDesktop = window.matchMedia('(min-width: 901px)');
  mqDesktop.addEventListener('change', () => { if (mqDesktop.matches) setNavOpen(false); });

  // ---------- Dropdown: hover på desktop, klick på mobil ----------
  function setupDropdown() {
    if (!dropdown || !dropdownBtn) return;
    const mq = window.matchMedia('(min-width: 901px)');

    const open  = () => { dropdownBtn.setAttribute('aria-expanded','true');  dropdown.classList.add('open');  };
    const close = () => { dropdownBtn.setAttribute('aria-expanded','false'); dropdown.classList.remove('open'); };

    function closeOnDocClick(e){ if (!dropdown.contains(e.target)) close(); }

    function activateDesktop(){
      // Ingen klicklogik – CSS :hover håller menyn öppen (brygga i CSS)
      dropdownBtn.onclick = null;
      document.removeEventListener('click', closeOnDocClick);

      // Uppdatera aria när användaren hovrar
      dropdown.addEventListener('mouseenter', open);
      dropdown.addEventListener('mouseleave', close);
    }

    function activateMobile(){
      dropdown.removeEventListener('mouseenter', open);
      dropdown.removeEventListener('mouseleave', close);

      dropdownBtn.onclick = (e) => {
        e.preventDefault();
        const expanded = dropdownBtn.getAttribute('aria-expanded') === 'true';
        expanded ? close() : open();
      };
      document.addEventListener('click', closeOnDocClick);
    }

    const apply = () => (mq.matches ? activateDesktop() : activateMobile());
    apply();
    mq.addEventListener('change', apply);
  }
  setupDropdown();
})();
