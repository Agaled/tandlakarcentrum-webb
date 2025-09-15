/* === Off-hours Popup Controller (visas varje sidladdning utanför 09–18) === */
(function() {
  const TIMEZONE = 'Europe/Stockholm';

  // Öppettider: alla dagar 09:00–18:00
  const OPENING_HOURS = {
    0: [9, 18], 1: [9, 18], 2: [9, 18],
    3: [9, 18], 4: [9, 18], 5: [9, 18], 6: [9, 18]
  };

  // Hur länge ska “stängd”-krysset tysta popupen?
  // 0 minuter = visa vid varje sidladdning (utanför öppettid)
  // Exempel: sätt till 15 för att tysta i 15 min.
  const SUPPRESS_AFTER_CLOSE_MINUTES = 0;

  // Fallback-telefon om den inte hittas i DOM
  const FALLBACK_PHONE_HUMAN = '042-26 00 44';
  const FALLBACK_PHONE_E164  = '+4642260044';

  // --- Hjälpfunktioner ---
  function nowInTz() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
  }

  function parseSwedishToE164(numStr) {
    if (!numStr) return { human: FALLBACK_PHONE_HUMAN, e164: FALLBACK_PHONE_E164 };
    const digits = (numStr.match(/\d+/g) || []).join('');
    if (!digits) return { human: FALLBACK_PHONE_HUMAN, e164: FALLBACK_PHONE_E164 };
    const e164 = digits.startsWith('0') ? '+46' + digits.slice(1) : '+' + digits;
    return { human: numStr.trim(), e164 };
  }

  function getPhoneFromDom() {
    // Försöker plocka från samma element som i din header
    const el = document.querySelector('.contact-box-vertical');
    if (!el) return null;
    const m = el.textContent && el.textContent.match(/0\d[\d\s-]+/);
    return m ? parseSwedishToE164(m[0]) : null;
  }

  function isOpenNow(d) {
    const day = d.getDay();
    const hours = OPENING_HOURS[day];
    const h = d.getHours() + d.getMinutes()/60;
    return h >= hours[0] && h < hours[1];
  }

  // --- “Minns att jag stängt”-logik (tystar X minuter) ---
  const KEY = 'offhoursSuppressUntilTs';
  function dismissedForNow() {
    if (SUPPRESS_AFTER_CLOSE_MINUTES <= 0) return false;
    try {
      const ts = Number(localStorage.getItem(KEY) || 0);
      return Date.now() < ts;
    } catch { return false; }
  }
  function markDismissedForMinutes(min) {
    if (min <= 0) return;
    try {
      const untilTs = Date.now() + min * 60 * 1000;
      localStorage.setItem(KEY, String(untilTs));
    } catch { /* ignore */ }
  }

  function createPopup(phone) {
    const backdrop = document.createElement('div');
    backdrop.id = 'offhours-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-live', 'polite');

    const popup = document.createElement('div');
    popup.id = 'offhours-popup';
    popup.setAttribute('tabindex', '-1');
    popup.setAttribute('aria-hidden', 'false');

    const closeBtn = document.createElement('button');
    closeBtn.id = 'offhours-close';
    closeBtn.setAttribute('aria-label', 'Stäng meddelandet');
    closeBtn.innerHTML = '✕';

    const title = document.createElement('h3');
    title.textContent = 'Vi har inte öppet just nu';

    const p1 = document.createElement('p');
    p1.textContent = 'Vid akuta besvär kan du ringa oss dygnet runt på följande nummer:';

    const ctaRow = document.createElement('div');
    ctaRow.className = 'cta-row';

    const tel = document.createElement('a');
    tel.className = 'tel-btn';
    tel.href = 'tel:' + phone.e164;
    tel.textContent = phone.human;

    const small = document.createElement('small');
    small.textContent = 'Akutnummer – alltid öppet';

    ctaRow.appendChild(tel);
    ctaRow.appendChild(small);

    popup.appendChild(closeBtn);
    popup.appendChild(title);
    popup.appendChild(p1);
    popup.appendChild(ctaRow);

    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);

    function hide() {
      backdrop.style.display = 'none';
      popup.setAttribute('aria-hidden', 'true');
      markDismissedForMinutes(SUPPRESS_AFTER_CLOSE_MINUTES);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') hide(); }

    closeBtn.addEventListener('click', hide);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) hide(); });
    document.addEventListener('keydown', onKey);

    // Visa
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => popup.focus());
  }

  function init() {
    const url = new URL(location.href);
    const force = url.searchParams.get('showpopup') === '1'; // debug: ?showpopup=1

    const now = nowInTz();
    const shouldShow = force || !isOpenNow(now);

    if (!shouldShow || dismissedForNow()) return;

    const phone = getPhoneFromDom() || { human: FALLBACK_PHONE_HUMAN, e164: FALLBACK_PHONE_E164 };

    // Liten delay så vi inte bråkar med folden
    setTimeout(() => createPopup(phone), 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
