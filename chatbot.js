// Chatbot som pratar med vår backend (RAG)
(function initChatbot() {
  const API_URL = "http://localhost:3001/api/chat";
  const CONTACT_URL = "kontakt.html"; // Byt till bokning.html om du saknar kontakt.html
  const ACUTE_PHONE = "042-26 00 44";

  function wire() {
    const btn = document.getElementById("chatbot-button");
    const box = document.getElementById("chatbot-box");
    const closeBtn = document.getElementById("chatbot-close");
    const sendBtn = document.getElementById("chatbot-send");
    const input = document.getElementById("chatbot-text");
    const messages = document.getElementById("chatbot-messages");

    if (!btn || !box || !closeBtn || !sendBtn || !input || !messages) return false;

    // Öppna/stäng
    btn.addEventListener("click", () => {
      const isHidden = getComputedStyle(box).display === "none";
      box.style.display = isHidden ? "flex" : "none";
      btn.setAttribute("aria-expanded", String(isHidden));
    });
    closeBtn.addEventListener("click", () => {
      box.style.display = "none";
      btn.setAttribute("aria-expanded","false");
    });

    // Skicka meddelande
    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      addMessage("user", text);
      input.value = "";

      addMessage("bot", "Skriver svar…");

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text })
        });
        if (!res.ok) throw new Error("API error");
        const data = await res.json();

        replaceLastBotMessage(data.answer);

        // Visa källor (om några)
        if (data.sources && data.sources.length) {
          const el = document.createElement("div");
          el.className = "msg bot";
          el.innerHTML = "Källor: " + data.sources.map(s => `<a href="${s.url}" target="_blank">${s.label}</a>`).join(" ");
          messages.appendChild(el);
        }
      } catch (e) {
        replaceLastBotMessage(
          `Det gick inte att hämta svar just nu.\nDu kan fylla i formuläret här: ${CONTACT_URL} så återkommer vi inom 24 timmar.\nVid akuta besvär: ring ${ACUTE_PHONE}.`
        );
      } finally {
        messages.scrollTop = messages.scrollHeight;
      }
    }

    function addMessage(sender, text) {
      const div = document.createElement("div");
      div.classList.add("msg", sender);
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function replaceLastBotMessage(text) {
      const all = messages.querySelectorAll(".msg.bot");
      const last = all[all.length - 1];
      if (last) last.textContent = text; else addMessage("bot", text);
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

    return true;
  }

  function waitAndWire(tries = 50) {
    if (wire()) return;
    if (tries <= 0) return;
    setTimeout(()=>waitAndWire(tries-1), 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => waitAndWire());
  } else {
    waitAndWire();
  }
})();
